require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const MongoStore = require('connect-mongo');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();

// ══════════════════════════════════════════════════════════
//  MONGOOSE MODELS
// ══════════════════════════════════════════════════════════

const UserSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    displayName: String,
    email: String,
    avatar: String,
    accountBalance: { type: Number, default: 10000 },
    riskPercent: { type: Number, default: 1 },
    broker: { type: String, default: '' },
    timezone: { type: String, default: 'UTC+7' },
    currency: { type: String, default: 'USD|$|Dolar Amerika Serikat' },
    createdAt: { type: Date, default: Date.now }
});

const TradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    pair: { type: String, required: true },
    direction: { type: String, enum: ['BUY', 'SELL'], required: true },
    session: { type: String, enum: ['Asian', 'London', 'New York', 'London/NY Overlap', 'Other'], default: 'Other' },
    lot: { type: Number, required: true },
    entryPrice: { type: Number, default: 0 },
    exitPrice: { type: Number, default: 0 },
    sl: { type: Number, default: 0 },
    tp: { type: Number, default: 0 },
    result: { type: String, enum: ['WIN', 'LOSS', 'BREAKEVEN'], required: true },
    pnl: { type: Number, default: 0 },
    rMultiple: { type: Number, default: 0 },
    psychology: { type: String, required: true },
    confidenceLevel: { type: Number, min: 1, max: 10, default: 5 },
    setup: { type: String, default: '' },
    tags: [String],
    notes: { type: String, default: '' },
    chartBefore: { type: String, default: '' },
    chartAfter: { type: String, default: '' },
    duration: { type: Number, default: 0 }, // minutes
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

TradeSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const DiarySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    mood: { type: Number, min: 1, max: 5, default: 3 },
    content: { type: String, required: true },
    goals: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Trade = mongoose.model('Trade', TradeSchema);
const Diary = mongoose.model('Diary', DiarySchema);

// ══════════════════════════════════════════════════════════
//  DATABASE CONNECTION
// ══════════════════════════════════════════════════════════

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err));

// ══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ══════════════════════════════════════════════════════════

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'tradejournal-ultra-secret-2024',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

// ══════════════════════════════════════════════════════════
//  PASSPORT GOOGLE OAUTH
// ══════════════════════════════════════════════════════════

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails?.[0]?.value,
                avatar: profile.photos?.[0]?.value
            });
            console.log(`👤 New user registered: ${user.displayName}`);
        }
        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Unauthorized' });
};

// ══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
    (req, res) => res.redirect('/journal')
);

app.get('/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ user: req.user });
    } else {
        res.json({ user: null });
    }
});

// Serve journal app (requires auth — redirect to landing if not logged in)
app.get('/journal', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'journal.html'));
});

app.post('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ══════════════════════════════════════════════════════════
//  TRADE ROUTES
// ══════════════════════════════════════════════════════════

// Get all trades (paginated)
app.get('/api/trades', requireAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, pair, result, direction, sort = '-date', search } = req.query;
        const filter = { userId: req.user._id };
        if (pair) filter.pair = pair;
        if (result) filter.result = result;
        if (direction) filter.direction = direction;

        const trades = await Trade.find(filter)
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('-chartBefore -chartAfter');

        const total = await Trade.countDocuments(filter);
        res.json({ trades, total, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single trade (with images)
app.get('/api/trades/:id', requireAuth, async (req, res) => {
    try {
        const trade = await Trade.findOne({ _id: req.params.id, userId: req.user._id });
        if (!trade) return res.status(404).json({ error: 'Trade not found' });
        res.json(trade);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create trade
app.post('/api/trades', requireAuth, async (req, res) => {
    try {
        const trade = await Trade.create({ ...req.body, userId: req.user._id });
        res.status(201).json(trade);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update trade
app.put('/api/trades/:id', requireAuth, async (req, res) => {
    try {
        const trade = await Trade.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { ...req.body, updatedAt: new Date() },
            { new: true, runValidators: true }
        );
        if (!trade) return res.status(404).json({ error: 'Trade not found' });
        res.json(trade);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete trade
app.delete('/api/trades/:id', requireAuth, async (req, res) => {
    try {
        await Trade.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════
//  STATS ROUTE
// ══════════════════════════════════════════════════════════

app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const trades = await Trade.find({ userId }).select('-chartBefore -chartAfter').sort('date');

        if (trades.length === 0) {
            return res.json({ empty: true, total: 0, wins: 0, losses: 0, breakevens: 0, winrate: 0, totalPnL: 0 });
        }

        const total = trades.length;
        const wins = trades.filter(t => t.result === 'WIN').length;
        const losses = trades.filter(t => t.result === 'LOSS').length;
        const breakevens = trades.filter(t => t.result === 'BREAKEVEN').length;
        const winrate = ((wins / total) * 100).toFixed(1);
        const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
        const avgPnL = totalPnL / total;

        // Streak
        const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));
        let currentStreak = 0, streakType = sorted[0]?.result || '';
        for (const t of sorted) {
            if (t.result === 'BREAKEVEN') continue;
            if (t.result === streakType) currentStreak++;
            else break;
        }

        // Psychology stats
        const psychStats = {};
        trades.forEach(t => {
            if (!psychStats[t.psychology]) psychStats[t.psychology] = { total: 0, wins: 0, pnl: 0 };
            psychStats[t.psychology].total++;
            psychStats[t.psychology].pnl += (t.pnl || 0);
            if (t.result === 'WIN') psychStats[t.psychology].wins++;
        });

        // Pair stats
        const pairStats = {};
        trades.forEach(t => {
            if (!pairStats[t.pair]) pairStats[t.pair] = { total: 0, wins: 0, pnl: 0 };
            pairStats[t.pair].total++;
            pairStats[t.pair].pnl += (t.pnl || 0);
            if (t.result === 'WIN') pairStats[t.pair].wins++;
        });

        // Session stats
        const sessionStats = {};
        trades.forEach(t => {
            const s = t.session || 'Other';
            if (!sessionStats[s]) sessionStats[s] = { total: 0, wins: 0 };
            sessionStats[s].total++;
            if (t.result === 'WIN') sessionStats[s].wins++;
        });

        // Monthly stats
        const monthlyStats = {};
        trades.forEach(t => {
            const key = new Date(t.date).toISOString().slice(0, 7);
            if (!monthlyStats[key]) monthlyStats[key] = { total: 0, wins: 0, pnl: 0 };
            monthlyStats[key].total++;
            monthlyStats[key].pnl += (t.pnl || 0);
            if (t.result === 'WIN') monthlyStats[key].wins++;
        });

        // Day of week stats (0=Sun, 1=Mon...)
        const dowStats = {};
        for (let i = 0; i <= 6; i++) dowStats[i] = { total: 0, wins: 0 };
        trades.forEach(t => {
            const dow = new Date(t.date).getDay();
            dowStats[dow].total++;
            if (t.result === 'WIN') dowStats[dow].wins++;
        });

        // Cumulative P&L for chart
        let cumPnL = 0;
        const cumPnLData = trades.map(t => {
            cumPnL += (t.pnl || 0);
            return { date: t.date, value: parseFloat(cumPnL.toFixed(2)) };
        });

        // Setup stats
        const setupStats = {};
        trades.forEach(t => {
            if (!t.setup) return;
            if (!setupStats[t.setup]) setupStats[t.setup] = { total: 0, wins: 0 };
            setupStats[t.setup].total++;
            if (t.result === 'WIN') setupStats[t.setup].wins++;
        });

        const sortedByPnL = [...trades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));

        res.json({
            total, wins, losses, breakevens,
            winrate: parseFloat(winrate),
            totalPnL: parseFloat(totalPnL.toFixed(2)),
            avgPnL: parseFloat(avgPnL.toFixed(2)),
            currentStreak, streakType,
            psychStats, pairStats, sessionStats,
            monthlyStats, dowStats,
            cumPnLData,
            setupStats,
            bestTrade: sortedByPnL[0] || null,
            worstTrade: sortedByPnL[sortedByPnL.length - 1] || null,
            avgRMultiple: trades.filter(t => t.rMultiple).reduce((s, t) => s + t.rMultiple, 0) / (trades.filter(t => t.rMultiple).length || 1)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════════════════

app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await User.find({}).select('displayName avatar createdAt');
        const leaderboard = [];

        for (const user of users) {
            const trades = await Trade.find({ userId: user._id }).select('result pnl');
            if (trades.length < 3) continue;

            const wins = trades.filter(t => t.result === 'WIN').length;
            const winrate = parseFloat(((wins / trades.length) * 100).toFixed(1));
            const totalPnL = parseFloat(trades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2));

            leaderboard.push({
                userId: user._id,
                displayName: user.displayName,
                avatar: user.avatar,
                totalTrades: trades.length,
                wins,
                winrate,
                totalPnL,
                memberSince: user.createdAt
            });
        }

        leaderboard.sort((a, b) => b.winrate - a.winrate || b.totalTrades - a.totalTrades);
        res.json(leaderboard.slice(0, 50));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════
//  DIARY ROUTES
// ══════════════════════════════════════════════════════════

app.get('/api/diary', requireAuth, async (req, res) => {
    try {
        const entries = await Diary.find({ userId: req.user._id }).sort('-date').limit(30);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/diary', requireAuth, async (req, res) => {
    try {
        const entry = await Diary.create({ ...req.body, userId: req.user._id });
        res.status(201).json(entry);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/diary/:id', requireAuth, async (req, res) => {
    try {
        await Diary.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════
//  UPDATE USER SETTINGS
// ══════════════════════════════════════════════════════════

app.put('/api/user', requireAuth, async (req, res) => {
    try {
        const allowed = ['accountBalance', 'riskPercent', 'broker', 'timezone', 'currency'];
        const update = {};
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════
//  GROQ AI ANALYSIS
// ══════════════════════════════════════════════════════════

app.post('/api/ai-analysis', requireAuth, async (req, res) => {
    if (!process.env.GROQ_API_KEY) {
        return res.status(400).json({ error: 'GROQ_API_KEY not configured. Add it to your .env file.' });
    }

    try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const { context, type } = req.body;

        const systemPrompt = `Kamu adalah trading coach dan psikolog trading profesional yang menganalisis jurnal trading.
Berikan insight yang spesifik, actionable, dan encouraging berdasarkan data trading.
Gunakan bahasa Indonesia yang natural dan profesional.
Gunakan bullet points untuk poin utama. Maksimal 200 kata.
Selalu akhiri dengan 1 kalimat motivasi singkat.`;

        const promptMap = {
            general: `Analisis data trading berikut dan berikan insight komprehensif:\n${JSON.stringify(context, null, 2)}`,
            psychology: `Analisis pola psikologi dari data trading ini. Identifikasi state psikologi mana yang menghasilkan performance terbaik dan terburuk:\n${JSON.stringify(context, null, 2)}`,
            pattern: `Identifikasi pola menang dan kalah dari data trading ini. Apa kesamaan dari trade yang profit vs yang rugi?\n${JSON.stringify(context, null, 2)}`,
            suggestion: `Berdasarkan history trading ini, berikan top 3 area improvement yang paling krusial untuk trader ini:\n${JSON.stringify(context, null, 2)}`,
            trade: `Analisis satu trade berikut ini dan berikan feedback konstruktif:\n${JSON.stringify(context, null, 2)}`
        };

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: promptMap[type] || promptMap.general }
            ],
            model: 'llama-3.3-70b-versatile',
            max_tokens: 500,
            temperature: 0.7
        });

        res.json({ analysis: completion.choices[0].message.content });
    } catch (err) {
        console.error('Groq error:', err.message);
        res.status(500).json({ error: `Groq AI error: ${err.message}` });
    }
});

// ══════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Trading Journal running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}\n`);
});