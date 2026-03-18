# 📈 Trading Journal — Setup Guide

Aplikasi jurnal trading profesional dengan Google OAuth, MongoDB, dan AI Analysis via Groq.

---

## ⚙️ Prasyarat

- Node.js v18+
- Akun [MongoDB Railway](https://railway.app)
- Akun [Google Cloud Console](https://console.cloud.google.com)
- Akun [Groq](https://console.groq.com)

---

## 🚀 Cara Setup Lokal

### 1. Clone & Install

```bash
git clone <repo-url>
cd trading-journal
npm install
```

### 2. Buat file `.env`

```bash
cp .env.example .env
```

Isi semua variabel di `.env` (lihat panduan di bawah).

### 3. Jalankan

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Buka `http://localhost:3000`

---

## 🔑 Cara Dapat Credentials

### MongoDB (Railway)

1. Login ke [railway.app](https://railway.app)
2. New Project → Database → MongoDB
3. Klik plugin MongoDB → Variables
4. Copy nilai `MONGO_URL` → paste ke `MONGODB_URI`

### Google OAuth

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat project baru (atau pakai yang ada)
3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
4. Application type: **Web application**
5. Authorized redirect URIs:
   - Lokal: `http://localhost:3000/auth/google/callback`
   - Production: `https://yourdomain.com/auth/google/callback`
6. Copy Client ID & Client Secret ke `.env`

> **OAuth Consent Screen**: Isi nama app, email, dan tambahkan scope `email` dan `profile`

### Groq API Key

1. Daftar di [console.groq.com](https://console.groq.com)
2. API Keys → Create API Key
3. Copy ke `GROQ_API_KEY`

### Session Secret

Generate string random:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📦 Deploy ke Railway

1. Push code ke GitHub
2. Railway → New Project → Deploy from GitHub
3. Tambahkan semua variabel dari `.env` di Railway → Variables
4. Set `CALLBACK_URL` ke URL Railway kamu: `https://<app>.railway.app/auth/google/callback`
5. Update Google Cloud Console dengan URL tersebut

---

## ✨ Fitur

| Fitur | Keterangan |
|-------|------------|
| 🔐 Google OAuth | Login aman via akun Google |
| 📝 Trade Journal | Catat setiap trade lengkap |
| 📊 Analytics | Charts & statistik mendalam |
| 🤖 Groq AI | Analisis psikologi & pola trading |
| 📅 Trading Diary | Jurnal harian dengan mood tracker |
| 🏆 Leaderboard | Ranking winrate sesama trader |
| 📸 Chart Screenshot | Upload foto chart before/after |
| 📤 Export CSV | Download semua data trading |
| 📱 Responsive | Support mobile & desktop |
| 🔥 Streak Tracker | Lacak win streak kamu |

---

## 🗂️ Struktur

```
trading-journal/
├── server.js          # Express backend + API routes
├── package.json
├── .env.example
└── public/
    ├── index.html     # SPA structure
    ├── style.css      # Dark cyberpunk theme
    └── app.js         # Frontend logic
```

---

## 🐛 Troubleshooting

**"Failed to connect MongoDB"** → Pastikan `MONGODB_URI` benar dan IP kamu di-whitelist di Railway

**"Google OAuth error"** → Pastikan `CALLBACK_URL` di `.env` sama persis dengan yang di Google Console

**"Groq API error"** → Cek API key dan quota di console.groq.com

---

*Made with ❤️ — Dark Trader Edition*