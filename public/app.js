/* ══════════════════════════════════════════════════════════
   TRADELOG — Frontend Application
══════════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
const state = {
    user: null,
    trades: [],
    stats: null,
    currentPage: 'dashboard',
    filters: { pair: '', result: '', direction: '' },
    pagination: { page: 1, pages: 1, total: 0 },
    chartInstances: {},
    editingId: null,
    chartBeforeData: null,
    chartAfterData: null
};

// ══════════════════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════════════════
const api = {
    async request(method, url, data) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        if (data) opts.body = JSON.stringify(data);
        const res = await fetch(url, opts);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    },
    get: (url) => api.request('GET', url),
    post: (url, data) => api.request('POST', url, data),
    put: (url, data) => api.request('PUT', url, data),
    delete: (url) => api.request('DELETE', url)
};

// ══════════════════════════════════════════════════
//  TOAST NOTIFICATION
// ══════════════════════════════════════════════════
function toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${type} show`;
    setTimeout(() => el.classList.remove('show'), 3500);
}

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════
function navigate(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // Remove active from nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    if (!pageEl) return;
    pageEl.classList.add('active');
    state.currentPage = page;

    const navLink = document.querySelector(`[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    // Load page data
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'journal': loadJournal(); break;
        case 'analytics': loadAnalytics(); break;
        case 'leaderboard': loadLeaderboard(); break;
        case 'diary': loadDiary(); break;
        case 'settings': loadSettings(); break;
        case 'new-trade': initTradeForm(); break;
    }

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    window.scrollTo(0, 0);
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════
async function loadDashboard() {
    try {
        const [statsData, tradesData] = await Promise.all([
            api.get('/api/stats'),
            api.get('/api/trades?limit=8&sort=-date')
        ]);

        state.stats = statsData;
        state.trades = tradesData.trades;

        renderStats(statsData);
        renderRecentTrades(tradesData.trades);
        renderDashboardCharts(statsData);

        const name = state.user?.displayName?.split(' ')[0] || 'Trader';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        document.getElementById('dash-greeting').textContent = `${greeting}, ${name}. Let's check your edge.`;

        // Best / Worst
        if (statsData.bestTrade && statsData.worstTrade) {
            document.getElementById('best-worst-row').style.display = 'grid';
            document.getElementById('best-trade-info').innerHTML = tradeInfoHtml(statsData.bestTrade);
            document.getElementById('worst-trade-info').innerHTML = tradeInfoHtml(statsData.worstTrade);
        }

    } catch (err) {
        console.error(err);
    }
}

function tradeInfoHtml(t) {
    if (!t) return '<div class="stat-sub">No trades yet</div>';
    return `
    <div style="font-weight:700;font-size:1rem;color:var(--text)">${t.pair}</div>
    <div class="stat-sub">${t.direction} • ${t.lot} lot • ${fmtDate(t.date)}</div>
    <div style="font-family:var(--font-head);font-size:1.3rem;color:${(t.pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">
      ${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}
    </div>`;
}

function renderStats(s) {
    if (!s || s.empty) {
        document.getElementById('stat-winrate').textContent = '—%';
        document.getElementById('stat-trades').textContent = '0 trades total';
        document.getElementById('stat-pnl').textContent = '$0.00';
        document.getElementById('stat-avg-pnl').textContent = 'avg $0.00/trade';
        document.getElementById('stat-streak').textContent = '—';
        document.getElementById('stat-streak-type').textContent = 'No trades yet';
        document.getElementById('stat-wl').textContent = '— / — / —';
        document.getElementById('sidebar-winrate').textContent = '—%';
        document.getElementById('sidebar-streak').textContent = '0 trades';
        return;
    }

    const wr = parseFloat(s.winrate);
    animateCount('stat-winrate', 0, wr, 1000, v => `${v.toFixed(1)}%`);
    document.getElementById('stat-trades').textContent = `${s.total} trades total`;
    document.getElementById('winrate-bar').style.width = `${wr}%`;

    const pnl = parseFloat(s.totalPnL);
    document.getElementById('stat-pnl').textContent = `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`;
    document.getElementById('stat-pnl').style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('stat-avg-pnl').textContent = `avg ${s.avgPnL >= 0 ? '+' : ''}$${Math.abs(s.avgPnL).toFixed(2)}/trade`;

    const streak = s.currentStreak;
    const sType = s.streakType;
    document.getElementById('stat-streak').textContent = streak > 0 ? `${streak} 🔥` : '—';
    document.getElementById('stat-streak-type').textContent = sType === 'WIN' ? `WIN Streak` :
        sType === 'LOSS' ? `LOSS Streak` : '—';
    document.getElementById('stat-streak').style.color = sType === 'WIN' ? 'var(--green)' : sType === 'LOSS' ? 'var(--red)' : 'var(--text2)';

    document.getElementById('stat-wl').textContent = `${s.wins} / ${s.losses} / ${s.breakevens}`;
    document.getElementById('stat-rr').textContent = `avg R: ${s.avgRMultiple ? s.avgRMultiple.toFixed(2) : '—'}`;

    document.getElementById('sidebar-winrate').textContent = `${wr}%`;
    document.getElementById('sidebar-streak').textContent = `${s.total} trades`;
}

function renderRecentTrades(trades) {
    const el = document.getElementById('recent-trades-list');
    if (!trades || trades.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Belum ada trades. <a href="#" onclick="navigate(\'new-trade\')" style="color:var(--orange)">Tambah trade pertama kamu!</a></p></div>';
        return;
    }

    el.innerHTML = trades.map(t => `
    <div class="recent-trade-row" onclick="openTradeDetail('${t._id}')">
      <div class="rt-date">${fmtDate(t.date)}</div>
      <div>
        <div class="rt-pair">${t.pair}</div>
        <div class="rt-lot">${t.lot} lot · ${t.setup || t.psychology}</div>
      </div>
      <div class="rt-dir ${t.direction.toLowerCase()}">${t.direction}</div>
      <div>
        <div class="rt-pnl ${(t.pnl || 0) >= 0 ? 'pos' : 'neg'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</div>
        <div style="text-align:right"><span class="result-badge ${t.result}">${t.result}</span></div>
      </div>
    </div>
  `).join('');
}

function renderDashboardCharts(s) {
    if (!s || s.empty) return;

    // Cumulative PnL Chart
    destroyChart('chart-cum-pnl');
    const cumCtx = document.getElementById('chart-cum-pnl').getContext('2d');
    const labels = s.cumPnLData.map(d => fmtDateShort(d.date));
    const values = s.cumPnLData.map(d => d.value);

    state.chartInstances['chart-cum-pnl'] = new Chart(cumCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: values[values.length - 1] >= 0 ? '#00E676' : '#E63946',
                backgroundColor: values[values.length - 1] >= 0
                    ? 'rgba(0,230,118,0.06)' : 'rgba(230,57,70,0.06)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: values.length > 30 ? 0 : 3,
                pointBackgroundColor: '#FF6B35'
            }]
        },
        options: chartDefaults()
    });

    // Win/Loss Donut
    destroyChart('chart-winloss');
    const wlCtx = document.getElementById('chart-winloss').getContext('2d');
    state.chartInstances['chart-winloss'] = new Chart(wlCtx, {
        type: 'doughnut',
        data: {
            labels: ['WIN', 'LOSS', 'BE'],
            datasets: [{
                data: [s.wins, s.losses, s.breakevens],
                backgroundColor: ['rgba(0,230,118,0.8)', 'rgba(230,57,70,0.8)', 'rgba(120,120,140,0.6)'],
                borderColor: ['#00E676', '#E63946', '#5050680'],
                borderWidth: 2
            }]
        },
        options: {
            ...chartDefaults(),
            cutout: '65%',
            plugins: {
                ...chartDefaults().plugins,
                legend: { display: true, position: 'bottom', labels: { color: '#9090a8', font: { size: 11 }, padding: 12 } }
            }
        }
    });
}

// ══════════════════════════════════════════════════
//  JOURNAL
// ══════════════════════════════════════════════════
async function loadJournal(page = 1) {
    try {
        const { pair, result, direction } = state.filters;
        let url = `/api/trades?page=${page}&limit=15`;
        if (pair) url += `&pair=${pair}`;
        if (result) url += `&result=${result}`;
        if (direction) url += `&direction=${direction}`;

        const data = await api.get(url);
        state.trades = data.trades;
        state.pagination = { page, pages: data.pages, total: data.total };

        renderTradeTable(data.trades);
        renderPagination(data.pages, page);
    } catch (err) {
        toast('Error loading trades', 'error');
    }
}

function renderTradeTable(trades) {
    const tbody = document.getElementById('trade-table-body');
    if (!trades || trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No trades found. <a href="#" onclick="navigate(\'new-trade\')" style="color:var(--orange)">Add your first trade →</a></td></tr>';
        return;
    }

    tbody.innerHTML = trades.map(t => `
    <tr onclick="openTradeDetail('${t._id}')">
      <td style="color:var(--text2)">${fmtDate(t.date)}</td>
      <td style="font-weight:600;color:var(--text)">${t.pair}</td>
      <td><span class="result-badge ${t.direction === 'BUY' ? 'WIN' : 'LOSS'}" style="color:${t.direction === 'BUY' ? 'var(--green)' : 'var(--red)'};border-color:${t.direction === 'BUY' ? 'rgba(0,230,118,0.2)' : 'rgba(230,57,70,0.2)'};background:${t.direction === 'BUY' ? 'var(--green-glow)' : 'var(--red-glow)'}">${t.direction}</span></td>
      <td>${t.lot}</td>
      <td>${t.entryPrice || '—'}</td>
      <td>${t.exitPrice || '—'}</td>
      <td style="color:var(--text2)">${t.sl || '—'} / ${t.tp || '—'}</td>
      <td style="font-weight:700;color:${(t.pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</td>
      <td><span class="result-badge ${t.result}">${t.result}</span></td>
      <td style="color:var(--text2);font-size:0.75rem">${t.psychology}</td>
      <td>
        <div class="action-btns" onclick="event.stopPropagation()">
          <button class="btn-action" onclick="editTrade('${t._id}')">Edit</button>
          <button class="btn-action del" onclick="deleteTrade('${t._id}')">Del</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPagination(pages, current) {
    const el = document.getElementById('pagination');
    if (pages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    if (current > 1) html += `<button class="page-btn" onclick="loadJournal(${current - 1})">← Prev</button>`;

    for (let i = 1; i <= pages; i++) {
        if (Math.abs(i - current) <= 2 || i === 1 || i === pages) {
            html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="loadJournal(${i})">${i}</button>`;
        } else if (Math.abs(i - current) === 3) {
            html += `<span style="color:var(--text2);padding:6px">...</span>`;
        }
    }

    if (current < pages) html += `<button class="page-btn" onclick="loadJournal(${current + 1})">Next →</button>`;
    el.innerHTML = html;
}

// ══════════════════════════════════════════════════
//  TRADE FORM
// ══════════════════════════════════════════════════
function initTradeForm(trade = null) {
    state.editingId = trade?._id || null;
    state.chartBeforeData = trade?.chartBefore || null;
    state.chartAfterData = trade?.chartAfter || null;

    document.getElementById('form-title').textContent = trade ? 'Edit Trade' : 'New Trade';
    document.getElementById('form-submit-btn').textContent = trade ? 'Update Trade' : 'Save Trade';
    document.getElementById('edit-trade-id').value = trade?._id || '';

    // Reset form
    document.getElementById('trade-form').reset();

    // Reset direction/result UI
    document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active-buy', 'active-sell'));
    document.querySelectorAll('.result-btn').forEach(b => {
        b.classList.remove('active-WIN', 'active-LOSS', 'active-BREAKEVEN');
    });

    document.getElementById('f-direction').value = '';
    document.getElementById('f-result').value = '';

    // Set datetime default
    if (!trade) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('f-date').value = now.toISOString().slice(0, 16);
    }

    if (trade) {
        const d = new Date(trade.date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById('f-date').value = d.toISOString().slice(0, 16);
        document.getElementById('f-pair').value = trade.pair;
        document.getElementById('f-session').value = trade.session || 'Other';
        document.getElementById('f-lot').value = trade.lot;
        document.getElementById('f-entry').value = trade.entryPrice || '';
        document.getElementById('f-exit').value = trade.exitPrice || '';
        document.getElementById('f-sl').value = trade.sl || '';
        document.getElementById('f-tp').value = trade.tp || '';
        document.getElementById('f-duration').value = trade.duration || '';
        document.getElementById('f-pnl').value = trade.pnl || '';
        document.getElementById('f-rmultiple').value = trade.rMultiple || '';
        document.getElementById('f-confidence').value = trade.confidenceLevel || 5;
        document.getElementById('confidence-val').textContent = trade.confidenceLevel || 5;
        document.getElementById('f-psychology').value = trade.psychology;
        document.getElementById('f-setup').value = trade.setup || '';
        document.getElementById('f-tags').value = (trade.tags || []).join(', ');
        document.getElementById('f-notes').value = trade.notes || '';

        // Direction
        if (trade.direction) {
            document.getElementById('f-direction').value = trade.direction;
            const btn = document.querySelector(`[data-val="${trade.direction}"]`);
            if (btn) btn.classList.add(`active-${trade.direction.toLowerCase() === 'buy' ? 'buy' : 'sell'}`);
        }

        // Result
        if (trade.result) {
            document.getElementById('f-result').value = trade.result;
            const btn = document.querySelector(`.result-btn[data-val="${trade.result}"]`);
            if (btn) btn.classList.add(`active-${trade.result}`);
        }

        // Preview existing images
        if (trade.chartBefore) {
            document.getElementById('before-preview').innerHTML = `<img src="${trade.chartBefore}" alt="Before">`;
        }
        if (trade.chartAfter) {
            document.getElementById('after-preview').innerHTML = `<img src="${trade.chartAfter}" alt="After">`;
        }
    } else {
        document.getElementById('before-preview').innerHTML = '<span class="upload-icon">📸</span><span>Upload chart sebelum entry</span>';
        document.getElementById('after-preview').innerHTML = '<span class="upload-icon">📸</span><span>Upload chart setelah close</span>';
    }
}

async function editTrade(id) {
    try {
        const trade = await api.get(`/api/trades/${id}`);
        navigate('new-trade');
        setTimeout(() => initTradeForm(trade), 50);
    } catch (err) {
        toast('Error loading trade', 'error');
    }
}

async function deleteTrade(id) {
    if (!confirm('Hapus trade ini? Aksi ini tidak bisa dibatalkan.')) return;
    try {
        await api.delete(`/api/trades/${id}`);
        toast('Trade berhasil dihapus.', 'success');
        loadJournal();
    } catch (err) {
        toast('Error deleting trade', 'error');
    }
}

// ══════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════
async function loadAnalytics() {
    try {
        const s = state.stats || await api.get('/api/stats');
        state.stats = s;

        if (!s || s.empty) {
            toast('Belum ada data untuk dianalisis. Tambahkan trades dulu!', 'info');
            return;
        }

        renderAnalyticsCharts(s);
        renderDowHeatmap(s.dowStats);
        renderSetupStats(s.setupStats);
    } catch (err) {
        console.error(err);
        toast('Error loading analytics', 'error');
    }
}

function renderAnalyticsCharts(s) {
    // Psychology Performance
    if (s.psychStats && Object.keys(s.psychStats).length > 0) {
        destroyChart('chart-psych');
        const ctx = document.getElementById('chart-psych').getContext('2d');
        const psychData = Object.entries(s.psychStats).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
        state.chartInstances['chart-psych'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: psychData.map(([k]) => k.replace(' & ', '\n& ')),
                datasets: [
                    { label: 'Win Rate %', data: psychData.map(([, v]) => v.total > 0 ? ((v.wins / v.total) * 100).toFixed(1) : 0), backgroundColor: 'rgba(255,107,53,0.7)', borderColor: '#FF6B35', borderWidth: 1 },
                    { label: 'Total Trades', data: psychData.map(([, v]) => v.total), backgroundColor: 'rgba(120,120,200,0.4)', borderColor: 'rgba(120,120,200,0.7)', borderWidth: 1, yAxisID: 'y1' }
                ]
            },
            options: {
                ...chartDefaults(),
                scales: {
                    x: { ticks: { color: '#9090a8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#9090a8' }, grid: { color: 'rgba(255,255,255,0.04)' }, title: { display: true, text: 'Win Rate %', color: '#9090a8' } },
                    y1: { position: 'right', ticks: { color: '#9090a8' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Trades', color: '#9090a8' } }
                }
            }
        });
    }

    // Pair Performance
    if (s.pairStats && Object.keys(s.pairStats).length > 0) {
        destroyChart('chart-pair');
        const ctx2 = document.getElementById('chart-pair').getContext('2d');
        const pairData = Object.entries(s.pairStats).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 10);
        state.chartInstances['chart-pair'] = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: pairData.map(([k]) => k),
                datasets: [{
                    label: 'P&L ($)',
                    data: pairData.map(([, v]) => v.pnl.toFixed(2)),
                    backgroundColor: pairData.map(([, v]) => v.pnl >= 0 ? 'rgba(0,230,118,0.7)' : 'rgba(230,57,70,0.7)'),
                    borderColor: pairData.map(([, v]) => v.pnl >= 0 ? '#00E676' : '#E63946'),
                    borderWidth: 1
                }]
            },
            options: {
                ...chartDefaults(),
                scales: {
                    x: { ticks: { color: '#9090a8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#9090a8' }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }

    // Monthly P&L
    if (s.monthlyStats && Object.keys(s.monthlyStats).length > 0) {
        destroyChart('chart-monthly');
        const ctx3 = document.getElementById('chart-monthly').getContext('2d');
        const months = Object.entries(s.monthlyStats).sort(([a], [b]) => a.localeCompare(b));
        state.chartInstances['chart-monthly'] = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: months.map(([k]) => {
                    const [y, m] = k.split('-');
                    return new Date(y, m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
                }),
                datasets: [{
                    label: 'P&L ($)',
                    data: months.map(([, v]) => v.pnl.toFixed(2)),
                    backgroundColor: months.map(([, v]) => v.pnl >= 0 ? 'rgba(0,230,118,0.7)' : 'rgba(230,57,70,0.7)'),
                    borderColor: months.map(([, v]) => v.pnl >= 0 ? '#00E676' : '#E63946'),
                    borderWidth: 1, borderRadius: 4
                }]
            },
            options: {
                ...chartDefaults(),
                scales: {
                    x: { ticks: { color: '#9090a8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#9090a8' }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }

    // Session Win Rate
    if (s.sessionStats && Object.keys(s.sessionStats).length > 0) {
        destroyChart('chart-session');
        const ctx4 = document.getElementById('chart-session').getContext('2d');
        const sessions = Object.entries(s.sessionStats);
        state.chartInstances['chart-session'] = new Chart(ctx4, {
            type: 'radar',
            data: {
                labels: sessions.map(([k]) => k),
                datasets: [{
                    label: 'Win Rate %',
                    data: sessions.map(([, v]) => v.total > 0 ? ((v.wins / v.total) * 100).toFixed(1) : 0),
                    backgroundColor: 'rgba(255,107,53,0.15)',
                    borderColor: '#FF6B35',
                    pointBackgroundColor: '#FF6B35',
                    borderWidth: 2
                }]
            },
            options: {
                ...chartDefaults(),
                scales: {
                    r: {
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        angleLines: { color: 'rgba(255,255,255,0.06)' },
                        ticks: { color: '#9090a8', backdropColor: 'transparent' },
                        pointLabels: { color: '#9090a8', font: { size: 11 } }
                    }
                }
            }
        });
    }
}

function renderDowHeatmap(dowStats) {
    if (!dowStats) return;
    const el = document.getElementById('dow-heatmap');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wrs = Object.values(dowStats).map(v => v.total > 0 ? (v.wins / v.total) * 100 : 0);
    const maxWR = Math.max(...wrs);
    const minWR = Math.min(...wrs.filter(v => v > 0));

    el.innerHTML = days.map((day, i) => {
        const stat = dowStats[i];
        const wr = stat.total > 0 ? ((stat.wins / stat.total) * 100).toFixed(0) : 0;
        const cls = stat.total > 2 ? (wr >= maxWR ? 'hot-high' : wr <= minWR ? 'hot-low' : '') : '';
        return `
      <div class="dow-cell ${cls}">
        <div class="dow-day">${day}</div>
        <div class="dow-wr">${wr > 0 ? wr + '%' : '—'}</div>
        <div class="dow-count">${stat.total} trades</div>
      </div>`;
    }).join('');
}

function renderSetupStats(setupStats) {
    const el = document.getElementById('setup-stats-table');
    if (!setupStats || Object.keys(setupStats).length === 0) {
        el.innerHTML = '<div class="empty-state">Belum ada data setup</div>';
        return;
    }

    const rows = Object.entries(setupStats).sort((a, b) => b[1].total - a[1].total);
    el.innerHTML = `
    <table>
      <thead><tr><th>Setup</th><th>Trades</th><th>Win Rate</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(([setup, v]) => {
        const wr = v.total > 0 ? ((v.wins / v.total) * 100).toFixed(1) : 0;
        const color = wr >= 60 ? 'var(--green)' : wr >= 45 ? 'var(--orange)' : 'var(--red)';
        return `
            <tr>
              <td style="color:var(--text)">${setup}</td>
              <td style="color:var(--text2)">${v.total}</td>
              <td style="color:${color};font-weight:700">${wr}%</td>
              <td>${wr >= 60 ? '✅ Strong' : wr >= 45 ? '⚡ Neutral' : '⚠️ Review'}</td>
            </tr>`;
    }).join('')}
      </tbody>
    </table>`;
}

// ══════════════════════════════════════════════════
//  DIARY
// ══════════════════════════════════════════════════
async function loadDiary() {
    try {
        const entries = await api.get('/api/diary');
        renderDiaryList(entries);
        // Set today's date
        document.getElementById('d-date').value = new Date().toISOString().split('T')[0];
    } catch (err) {
        console.error(err);
    }
}

function renderDiaryList(entries) {
    const el = document.getElementById('diary-list');
    if (!entries || entries.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>Belum ada catatan diary.</p></div>';
        return;
    }

    const moodMap = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
    el.innerHTML = entries.map(e => `
    <div class="diary-entry">
      <div class="diary-entry-header">
        <div class="diary-entry-date">${fmtDate(e.date)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="diary-mood-icon">${moodMap[e.mood]}</span>
          <button class="btn-action del" onclick="deleteDiaryEntry('${e._id}')">Del</button>
        </div>
      </div>
      <div class="diary-entry-content">${escHtml(e.content)}</div>
      ${e.goals ? `<div class="diary-entry-goals">🎯 ${escHtml(e.goals)}</div>` : ''}
    </div>
  `).join('');
}

async function deleteDiaryEntry(id) {
    if (!confirm('Hapus entry ini?')) return;
    try {
        await api.delete(`/api/diary/${id}`);
        toast('Entry dihapus.', 'success');
        loadDiary();
    } catch (err) {
        toast('Error', 'error');
    }
}

// ══════════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════════
async function loadLeaderboard() {
    try {
        const data = await api.get('/api/leaderboard');
        renderLeaderboard(data);
    } catch (err) {
        console.error(err);
    }
}

function renderLeaderboard(data) {
    // Podium (top 3)
    const podEl = document.getElementById('leaderboard-podium');
    if (data.length >= 3) {
        const [first, second, third] = data;
        podEl.innerHTML = `
      ${podiumItem(second, 2)}
      ${podiumItem(first, 1)}
      ${podiumItem(third, 3)}
    `;
    } else {
        podEl.innerHTML = '';
    }

    // Table
    const tbody = document.getElementById('leaderboard-body');
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Belum ada trader di leaderboard (min. 3 trades)</td></tr>';
        return;
    }

    const badges = ['🏆', '🥈', '🥉'];
    tbody.innerHTML = data.map((u, i) => `
    <tr>
      <td><span class="lb-rank lb-rank-${i + 1}">${i + 1}</span></td>
      <td>
        <div class="lb-trader">
          <img src="${u.avatar || defaultAvatar(u.displayName)}" alt="${u.displayName}" class="lb-avatar">
          <span>${escHtml(u.displayName)}</span>
        </div>
      </td>
      <td>${u.totalTrades}</td>
      <td><span class="lb-wr-${u.winrate >= 50 ? 'positive' : 'neutral'}">${u.winrate}%</span></td>
      <td class="lb-pnl-${u.totalPnL >= 0 ? 'pos' : 'neg'}">${u.totalPnL >= 0 ? '+' : ''}$${Math.abs(u.totalPnL).toFixed(2)}</td>
      <td>${badges[i] || '—'}</td>
    </tr>
  `).join('');
}

function podiumItem(u, rank) {
    const heights = { 1: 80, 2: 55, 3: 40 };
    return `
    <div class="podium-item podium-${rank}">
      <img src="${u.avatar || defaultAvatar(u.displayName)}" alt="${u.displayName}" class="podium-avatar">
      <div class="podium-name">${escHtml(u.displayName)}</div>
      <div class="podium-wr">${u.winrate}%</div>
      <div class="podium-block" style="height:${heights[rank]}px">${rank}</div>
    </div>`;
}

// ══════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════
async function loadSettings() {
    const user = state.user;
    if (!user) return;

    document.getElementById('settings-avatar').src = user.avatar || defaultAvatar(user.displayName);
    document.getElementById('settings-name').textContent = user.displayName;
    document.getElementById('settings-email').textContent = user.email;
    document.getElementById('settings-joined').textContent = `Member since ${fmtDate(user.createdAt)}`;
    document.getElementById('s-balance').value = user.accountBalance || '';
    document.getElementById('s-risk').value = user.riskPercent || '';
    document.getElementById('s-broker').value = user.broker || '';
    document.getElementById('s-timezone').value = user.timezone || 'UTC+7';

    // Summary
    const s = state.stats;
    if (s && !s.empty) {
        document.getElementById('settings-summary').innerHTML = `
      <div style="display:grid;gap:12px;padding:12px 0">
        <div style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:0.82rem">
          <span style="color:var(--text2)">Total Trades</span>
          <span style="color:var(--text)">${s.total}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:0.82rem">
          <span style="color:var(--text2)">Win Rate</span>
          <span style="color:var(--orange)">${s.winrate}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:0.82rem">
          <span style="color:var(--text2)">Total P&L</span>
          <span style="color:${s.totalPnL >= 0 ? 'var(--green)' : 'var(--red)'}">${s.totalPnL >= 0 ? '+' : ''}$${Math.abs(s.totalPnL).toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:0.82rem">
          <span style="color:var(--text2)">Account Balance</span>
          <span style="color:var(--text)">$${(user.accountBalance || 0).toLocaleString()}</span>
        </div>
      </div>`;
    } else {
        document.getElementById('settings-summary').innerHTML = '<div class="empty-state">Belum ada data trading.</div>';
    }
}

// ══════════════════════════════════════════════════
//  TRADE DETAIL MODAL
// ══════════════════════════════════════════════════
async function openTradeDetail(id) {
    try {
        const trade = await api.get(`/api/trades/${id}`);
        document.getElementById('modal-content').innerHTML = buildTradeDetailModal(trade);
        document.getElementById('modal-overlay').style.display = 'flex';
    } catch (err) {
        toast('Error loading trade detail', 'error');
    }
}

function buildTradeDetailModal(t) {
    const pnl = t.pnl || 0;
    const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)';

    return `
    <div class="modal-trade-header">
      <span class="modal-pair">${t.pair}</span>
      <span class="result-badge ${t.result}" style="font-size:0.8rem">${t.result}</span>
      <span class="result-badge ${t.direction === 'BUY' ? 'WIN' : 'LOSS'}" style="font-size:0.8rem;color:${t.direction === 'BUY' ? 'var(--green)' : 'var(--red)'}">${t.direction}</span>
    </div>

    <div class="modal-grid">
      <div class="modal-stat"><div class="modal-stat-label">Date</div><div class="modal-stat-value">${fmtDate(t.date)}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Lot</div><div class="modal-stat-value">${t.lot}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Entry</div><div class="modal-stat-value">${t.entryPrice || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Exit</div><div class="modal-stat-value">${t.exitPrice || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">SL</div><div class="modal-stat-value" style="color:var(--red)">${t.sl || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">TP</div><div class="modal-stat-value" style="color:var(--green)">${t.tp || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">P&L</div><div class="modal-stat-value" style="color:${pnlColor};font-size:1.2rem">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">R Multiple</div><div class="modal-stat-value">${t.rMultiple || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Session</div><div class="modal-stat-value">${t.session || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Duration</div><div class="modal-stat-value">${t.duration ? t.duration + ' min' : '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Setup</div><div class="modal-stat-value">${t.setup || '—'}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Confidence</div><div class="modal-stat-value">${t.confidenceLevel || '—'}/10</div></div>
    </div>

    <div style="margin-bottom:1rem">
      <div class="modal-stat-label" style="margin-bottom:6px">Psychology</div>
      <span style="font-size:0.9rem;color:var(--orange)">${t.psychology}</span>
    </div>

    ${t.tags && t.tags.length > 0 ? `
      <div style="margin-bottom:1rem">
        <div class="modal-stat-label" style="margin-bottom:6px">Tags</div>
        ${t.tags.map(tag => `<span style="display:inline-block;background:var(--card2);border:1px solid var(--border);padding:2px 10px;border-radius:20px;font-size:0.75rem;color:var(--text2);margin:2px">${tag}</span>`).join('')}
      </div>` : ''}

    ${(t.chartBefore || t.chartAfter) ? `
      <div class="modal-charts">
        ${t.chartBefore ? `
          <div class="modal-chart-img">
            <img src="${t.chartBefore}" alt="Chart Before" onclick="window.open(this.src,'_blank')">
            <div class="modal-chart-label">📸 Before Entry</div>
          </div>` : ''}
        ${t.chartAfter ? `
          <div class="modal-chart-img">
            <img src="${t.chartAfter}" alt="Chart After" onclick="window.open(this.src,'_blank')">
            <div class="modal-chart-label">📸 After Exit</div>
          </div>` : ''}
      </div>` : ''}

    ${t.notes ? `
      <div style="margin-bottom:1rem">
        <div class="modal-stat-label" style="margin-bottom:6px">Notes</div>
        <div class="modal-notes">${escHtml(t.notes)}</div>
      </div>` : ''}

    <div class="modal-action-bar">
      <button class="btn-primary" onclick="editTrade('${t._id}');closeModal()">✏️ Edit</button>
      <button class="btn-ai" onclick="runAITrade('${t._id}')">⚡ AI Analyze</button>
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-content').innerHTML = '';
}

// ══════════════════════════════════════════════════
//  AI ANALYSIS
// ══════════════════════════════════════════════════
async function runAI(type) {
    const contentEl = document.getElementById('ai-insight-content');
    contentEl.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div> Analyzing your trades...</div>`;

    try {
        const s = state.stats || await api.get('/api/stats');
        const context = {
            winrate: s.winrate,
            total: s.total,
            wins: s.wins,
            losses: s.losses,
            totalPnL: s.totalPnL,
            avgPnL: s.avgPnL,
            currentStreak: s.currentStreak,
            streakType: s.streakType,
            psychStats: s.psychStats,
            pairStats: s.pairStats,
            sessionStats: s.sessionStats,
            setupStats: s.setupStats
        };

        const data = await api.post('/api/ai-analysis', { context, type });
        contentEl.innerHTML = `<div class="ai-text">${escHtml(data.analysis)}</div>`;
    } catch (err) {
        contentEl.innerHTML = `<div style="color:var(--red);font-size:0.82rem">⚠ ${err.message}</div>`;
    }
}

async function runAITrade(id) {
    try {
        const trade = await api.get(`/api/trades/${id}`);
        const context = {
            pair: trade.pair, direction: trade.direction, lot: trade.lot,
            pnl: trade.pnl, result: trade.result, psychology: trade.psychology,
            setup: trade.setup, rMultiple: trade.rMultiple, notes: trade.notes,
            confidenceLevel: trade.confidenceLevel
        };
        const data = await api.post('/api/ai-analysis', { context, type: 'trade' });

        // Show in modal
        const existing = document.getElementById('modal-content');
        const aiDiv = document.createElement('div');
        aiDiv.style.cssText = 'background:rgba(255,107,53,0.06);border:1px solid rgba(255,107,53,0.2);border-radius:8px;padding:12px;margin-top:12px;font-size:0.83rem;line-height:1.7;white-space:pre-wrap;color:var(--text)';
        aiDiv.innerHTML = `<div style="font-family:var(--font-data);font-size:0.65rem;color:var(--orange);margin-bottom:8px;letter-spacing:0.1em">⚡ AI ANALYSIS</div>${escHtml(data.analysis)}`;
        existing.appendChild(aiDiv);
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function runAIAnalytics(type) {
    const el = document.getElementById('ai-analytics-result');
    el.style.display = 'block';
    el.textContent = '⚡ Analyzing...';

    try {
        const s = state.stats || await api.get('/api/stats');
        const data = await api.post('/api/ai-analysis', { context: s, type });
        el.textContent = data.analysis;
    } catch (err) {
        el.textContent = `⚠ ${err.message}`;
    }
}

// ══════════════════════════════════════════════════
//  EXPORT CSV
// ══════════════════════════════════════════════════
async function exportCSV() {
    try {
        const data = await api.get('/api/trades?limit=1000');
        const trades = data.trades;
        const headers = ['Date', 'Pair', 'Direction', 'Lot', 'Entry', 'Exit', 'SL', 'TP', 'Result', 'PnL', 'R-Multiple', 'Psychology', 'Setup', 'Notes', 'Session', 'Duration'];
        const rows = trades.map(t => [
            fmtDate(t.date), t.pair, t.direction, t.lot,
            t.entryPrice || '', t.exitPrice || '', t.sl || '', t.tp || '',
            t.result, t.pnl || 0, t.rMultiple || '', t.psychology,
            t.setup || '', (t.notes || '').replace(/,/g, ';'), t.session || '', t.duration || ''
        ]);

        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tradelog_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Export berhasil!', 'success');
    } catch (err) {
        toast('Export gagal', 'error');
    }
}

// ══════════════════════════════════════════════════
//  CHART HELPERS
// ══════════════════════════════════════════════════
function chartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#111119',
                titleColor: '#f0f0f8',
                bodyColor: '#9090a8',
                borderColor: '#1e1e2e',
                borderWidth: 1
            }
        }
    };
}

function destroyChart(id) {
    if (state.chartInstances[id]) {
        state.chartInstances[id].destroy();
        delete state.chartInstances[id];
    }
}

// ══════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════════════════════
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function defaultAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=1e1e2e&color=FF6B35&bold=true`;
}

function animateCount(id, from, to, duration, fmt) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = performance.now();
    function step(time) {
        const progress = Math.min((time - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = fmt(from + (to - from) * ease);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function resizeImage(file, maxWidth = 900) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ══════════════════════════════════════════════════
//  LOGIN ANIMATION CANVAS
// ══════════════════════════════════════════════════
function initLoginCanvas() {
    const canvas = document.getElementById('login-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.5 + 0.1
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Grid
        ctx.strokeStyle = 'rgba(255,107,53,0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 60) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 60) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,107,53,${p.a})`;
            ctx.fill();
        });

        // Connections
        particles.forEach((p, i) => {
            particles.slice(i + 1).forEach(q => {
                const d = Math.hypot(p.x - q.x, p.y - q.y);
                if (d < 120) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = `rgba(255,107,53,${(1 - d / 120) * 0.12})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            });
        });

        requestAnimationFrame(draw);
    }
    draw();

    // Animate the mini-stat counters in the new hero
    setTimeout(() => {
        document.querySelectorAll('.lp-mini-num').forEach(el => {
            const target = parseFloat(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            const prefix = el.dataset.prefix || '';
            const decimal = parseInt(el.dataset.decimal || '0');
            const dur = 2000;
            const start = Date.now();
            function tick() {
                const p = Math.min((Date.now() - start) / dur, 1);
                const ease = 1 - Math.pow(1 - p, 3);
                const val = target * ease;
                el.textContent = prefix + (decimal > 0 ? val.toFixed(decimal) : Math.floor(val).toLocaleString()) + suffix;
                if (p < 1) requestAnimationFrame(tick);
            }
            tick();
        });
    }, 400);
}

// ══════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════
function bindEvents() {
    // Tutorial events
    initTutorialEvents();

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigate(link.dataset.page);
        });
    });

    // Mobile menu
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await api.post('/auth/logout');
        window.location.reload();
    });

    document.getElementById('settings-logout').addEventListener('click', async () => {
        await api.post('/auth/logout');
        window.location.reload();
    });

    // Direction buttons
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active-buy', 'active-sell'));
            const val = btn.dataset.val;
            btn.classList.add(val === 'BUY' ? 'active-buy' : 'active-sell');
            document.getElementById('f-direction').value = val;
        });
    });

    // Result buttons
    document.querySelectorAll('.result-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.result-btn').forEach(b => {
                b.classList.remove('active-WIN', 'active-LOSS', 'active-BREAKEVEN');
            });
            const val = btn.dataset.val;
            btn.classList.add(`active-${val}`);
            document.getElementById('f-result').value = val;
        });
    });

    // Confidence slider
    document.getElementById('f-confidence').addEventListener('input', function () {
        document.getElementById('confidence-val').textContent = this.value;
    });

    // Chart image uploads
    document.getElementById('f-chart-before').addEventListener('change', async function () {
        if (this.files[0]) {
            const data = await resizeImage(this.files[0]);
            state.chartBeforeData = data;
            document.getElementById('before-preview').innerHTML = `<img src="${data}" alt="Before">`;
        }
    });

    document.getElementById('f-chart-after').addEventListener('change', async function () {
        if (this.files[0]) {
            const data = await resizeImage(this.files[0]);
            state.chartAfterData = data;
            document.getElementById('after-preview').innerHTML = `<img src="${data}" alt="After">`;
        }
    });

    // Trade Form Submit
    document.getElementById('trade-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('form-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        const direction = document.getElementById('f-direction').value;
        const result = document.getElementById('f-result').value;

        if (!direction) { toast('Pilih direction (BUY/SELL)', 'error'); btn.disabled = false; btn.textContent = state.editingId ? 'Update Trade' : 'Save Trade'; return; }
        if (!result) { toast('Pilih hasil trade (WIN/LOSS/BE)', 'error'); btn.disabled = false; btn.textContent = state.editingId ? 'Update Trade' : 'Save Trade'; return; }

        const tags = document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean);

        const payload = {
            date: document.getElementById('f-date').value,
            pair: document.getElementById('f-pair').value,
            direction,
            session: document.getElementById('f-session').value,
            lot: parseFloat(document.getElementById('f-lot').value),
            entryPrice: parseFloat(document.getElementById('f-entry').value) || 0,
            exitPrice: parseFloat(document.getElementById('f-exit').value) || 0,
            sl: parseFloat(document.getElementById('f-sl').value) || 0,
            tp: parseFloat(document.getElementById('f-tp').value) || 0,
            duration: parseInt(document.getElementById('f-duration').value) || 0,
            result,
            pnl: parseFloat(document.getElementById('f-pnl').value) || 0,
            rMultiple: parseFloat(document.getElementById('f-rmultiple').value) || 0,
            confidenceLevel: parseInt(document.getElementById('f-confidence').value) || 5,
            psychology: document.getElementById('f-psychology').value,
            setup: document.getElementById('f-setup').value,
            tags,
            notes: document.getElementById('f-notes').value,
            chartBefore: state.chartBeforeData || '',
            chartAfter: state.chartAfterData || ''
        };

        try {
            if (state.editingId) {
                await api.put(`/api/trades/${state.editingId}`, payload);
                toast('Trade berhasil diupdate! ✅', 'success');
            } else {
                await api.post('/api/trades', payload);
                toast('Trade berhasil disimpan! 🎯', 'success');
            }

            // Reset state
            state.editingId = null;
            state.chartBeforeData = null;
            state.chartAfterData = null;
            state.stats = null; // force refresh

            navigate('journal');
        } catch (err) {
            toast(`Error: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Trade';
        }
    });

    // Journal filters
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
        state.filters.pair = document.getElementById('filter-pair').value;
        state.filters.result = document.getElementById('filter-result').value;
        state.filters.direction = document.getElementById('filter-direction').value;
        loadJournal(1);
    });

    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        state.filters = { pair: '', result: '', direction: '' };
        document.getElementById('filter-pair').value = '';
        document.getElementById('filter-result').value = '';
        document.getElementById('filter-direction').value = '';
        loadJournal(1);
    });

    // Export CSV
    document.getElementById('btn-export').addEventListener('click', exportCSV);

    // AI Analysis button (dashboard)
    document.getElementById('btn-ai-general').addEventListener('click', () => runAI('general'));

    // AI Analytics button
    document.querySelector('.btn-ai[onclick="runAI(\'pattern\')"]')?.addEventListener('click', () => runAIAnalytics('pattern'));

    // Diary form
    document.getElementById('diary-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            await api.post('/api/diary', {
                date: document.getElementById('d-date').value,
                mood: parseInt(document.getElementById('d-mood').value),
                content: document.getElementById('d-content').value,
                goals: document.getElementById('d-goals').value
            });
            toast('Diary entry tersimpan! ✅', 'success');
            this.reset();
            document.getElementById('d-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('d-mood').value = 3;
            document.querySelectorAll('.mood-btn').forEach(b => { b.classList.remove('active'); if (b.dataset.val === '3') b.classList.add('active'); });
            loadDiary();
        } catch (err) {
            toast('Error saving diary', 'error');
        }
    });

    // Mood buttons
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('d-mood').value = btn.dataset.val;
        });
    });

    // Settings form
    document.getElementById('settings-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            const user = await api.put('/api/user', {
                accountBalance: parseFloat(document.getElementById('s-balance').value),
                riskPercent: parseFloat(document.getElementById('s-risk').value),
                broker: document.getElementById('s-broker').value,
                timezone: document.getElementById('s-timezone').value
            });
            state.user = user;
            toast('Settings tersimpan! ✅', 'success');
        } catch (err) {
            toast('Error saving settings', 'error');
        }
    });

    // Keyboard: Escape closes modal
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
}

// ══════════════════════════════════════════════════
//  APP INIT
// ══════════════════════════════════════════════════
async function init() {
    try {
        const { user } = await api.get('/auth/user');

        if (user) {
            state.user = user;

            // Populate user UI
            const avatar = user.avatar || defaultAvatar(user.displayName);
            document.getElementById('sidebar-avatar').src = avatar;
            document.getElementById('mobile-avatar').src = avatar;
            document.getElementById('sidebar-name').textContent = user.displayName;
            document.getElementById('sidebar-email').textContent = user.email;

            bindEvents();
            navigate('journal');

            // Show tutorial once for new users
            const tutorialDone = localStorage.getItem('tradelog_tutorial_done');
            if (!tutorialDone) {
                setTimeout(() => startTutorial(), 600);
            }
        } else {
            // Not authenticated — send back to landing page
            window.location.href = '/';
        }
    } catch (err) {
        console.error('Init error:', err);
        window.location.href = '/';
    }
}

// ══════════════════════════════════════════════════
//  TUTORIAL SYSTEM
// ══════════════════════════════════════════════════
const TUTORIAL_STEPS = [
    {
        id: 'welcome',
        icon: '🎉',
        title: 'Selamat Datang di TradeLog!',
        desc: 'Jurnal trading profesionalmu sudah siap. Kami akan tunjukkan cara pakainya — hanya butuh 30 detik!',
        target: null, // centered, no spotlight
        position: 'center'
    },
    {
        id: 'sidebar',
        icon: '🧭',
        title: 'Panel Navigasi',
        desc: 'Sidebar ini adalah pusat komando kamu. Dari sini kamu bisa akses semua fitur: Dashboard, Journal, Analytics, AI Coach, dan lainnya.',
        target: '#sidebar',
        position: 'right'
    },
    {
        id: 'new-trade',
        icon: '✍️',
        title: 'Catat Trade Kamu',
        desc: 'Klik "+ New Trade" untuk mencatat setiap trade. Isi detail pair, lot, entry/exit, SL/TP, psikologi, dan upload screenshot chart kamu.',
        target: '[data-page="new-trade"]',
        position: 'right'
    },
    {
        id: 'journal',
        icon: '📋',
        title: 'Trade Journal',
        desc: 'Semua trade yang sudah kamu catat akan tampil di sini. Kamu bisa filter, edit, hapus, dan lihat detail lengkap setiap trade.',
        target: '[data-page="journal"]',
        position: 'right'
    },
    {
        id: 'dashboard',
        icon: '📊',
        title: 'Dashboard & Statistik',
        desc: 'Dashboard menampilkan winrate, total P&L, streak, dan grafik performa kamu secara real-time. Semua data penting dalam satu tampilan.',
        target: '[data-page="dashboard"]',
        position: 'right'
    },
    {
        id: 'analytics',
        icon: '🔬',
        title: 'Analytics Mendalam',
        desc: 'Lihat performa berdasarkan pair, sesi, hari dalam seminggu, dan setup yang kamu pakai. Temukan edge tersembunyi di data tradingmu.',
        target: '[data-page="analytics"]',
        position: 'right'
    },
    {
        id: 'ai-coach',
        icon: '⚡',
        title: 'AI Coach Siap Membantu',
        desc: 'Tombol AI Analysis di dashboard akan menganalisis psikologi, pola trade, dan memberikan saran personal berdasarkan data tradingmu.',
        target: '#btn-ai-general',
        position: 'bottom'
    },
    {
        id: 'done',
        icon: '🚀',
        title: 'Kamu Siap Trading!',
        desc: 'Sekarang mulai catat trade pertamamu. Semakin banyak data yang kamu masukkan, semakin akurat insight yang bisa kamu dapatkan.',
        target: null,
        position: 'center',
        finalBtn: 'Catat Trade Pertama →'
    }
];

let tutStep = 0;

function startTutorial() {
    tutStep = 0;
    const overlay = document.getElementById('tutorial-overlay');
    overlay.style.display = 'block';
    overlay.classList.add('active');
    renderTutStep();
}

function closeTutorial(goToNewTrade = false) {
    const overlay = document.getElementById('tutorial-overlay');
    overlay.style.display = 'none';
    overlay.classList.remove('active');
    localStorage.setItem('tradelog_tutorial_done', '1');
    if (goToNewTrade) navigate('new-trade');
}

function renderTutStep() {
    const step = TUTORIAL_STEPS[tutStep];
    const total = TUTORIAL_STEPS.length;
    const overlay = document.getElementById('tutorial-overlay');
    const spotlight = document.getElementById('tutorial-spotlight');
    const card = document.getElementById('tutorial-card');

    // Update badge
    document.getElementById('tut-step-badge').textContent =
        `${String(tutStep + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

    // Update content
    document.getElementById('tut-icon').textContent = step.icon;
    document.getElementById('tut-title').textContent = step.title;
    document.getElementById('tut-desc').textContent = step.desc;

    // Dots
    const dotsEl = document.getElementById('tut-dots');
    dotsEl.innerHTML = TUTORIAL_STEPS.map((_, i) =>
        `<div class="tut-dot ${i === tutStep ? 'active' : ''}"></div>`
    ).join('');

    // Prev button
    const prevBtn = document.getElementById('tut-prev-btn');
    prevBtn.style.display = tutStep > 0 ? 'block' : 'none';

    // Next button
    const nextBtn = document.getElementById('tut-next-btn');
    const isFirst = tutStep === 0;
    const isLast = tutStep === total - 1;
    nextBtn.textContent = isFirst ? 'Mulai Tour →' : isLast ? (step.finalBtn || 'Selesai 🎉') : 'Lanjut →';

    // Navigate to the right page for context
    const pageMap = {
        'sidebar': 'journal',
        'new-trade': 'journal',
        'journal': 'journal',
        'dashboard': 'dashboard',
        'analytics': 'analytics',
        'ai-coach': 'dashboard'
    };
    if (pageMap[step.id]) {
        navigate(pageMap[step.id]);
    }

    // Position spotlight & card
    if (!step.target || step.position === 'center') {
        // Centered welcome/done card
        overlay.classList.add('step-welcome');
        spotlight.style.cssText = 'width:0;height:0;top:50%;left:50%;';
        card.style.cssText = `
      position:fixed;
      top:50%;left:50%;
      transform:translate(-50%,-50%);
      width:360px;
    `;
    } else {
        overlay.classList.remove('step-welcome');
        const targetEl = document.querySelector(step.target);
        if (!targetEl) {
            // fallback to center
            card.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;`;
            spotlight.style.cssText = 'width:0;height:0;';
            return;
        }

        const rect = targetEl.getBoundingClientRect();
        const pad = 8;

        // Set spotlight position
        spotlight.style.cssText = `
      position: fixed;
      left: ${rect.left - pad}px;
      top: ${rect.top - pad}px;
      width: ${rect.width + pad * 2}px;
      height: ${rect.height + pad * 2}px;
      border-radius: 10px;
    `;
        spotlight.classList.add('pulsing');

        // Position card based on preferred position
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const cardW = 320;
        const cardH = 220; // approx
        const gap = 20;

        let cardLeft, cardTop;

        if (step.position === 'right') {
            cardLeft = rect.right + gap;
            cardTop = rect.top + rect.height / 2 - cardH / 2;
            // If overflows right, put on left
            if (cardLeft + cardW > viewW - 20) {
                cardLeft = rect.left - cardW - gap;
            }
        } else if (step.position === 'bottom') {
            cardLeft = rect.left + rect.width / 2 - cardW / 2;
            cardTop = rect.bottom + gap;
        } else if (step.position === 'top') {
            cardLeft = rect.left + rect.width / 2 - cardW / 2;
            cardTop = rect.top - cardH - gap;
        }

        // Clamp to viewport
        cardLeft = Math.max(16, Math.min(cardLeft, viewW - cardW - 16));
        cardTop = Math.max(16, Math.min(cardTop, viewH - cardH - 16));

        card.style.cssText = `
      position: fixed;
      left: ${cardLeft}px;
      top: ${cardTop}px;
      width: ${cardW}px;
    `;
    }

    // Re-trigger animation
    card.style.animation = 'none';
    card.offsetHeight; // reflow
    card.style.animation = 'tut-card-in 0.35s ease';
}

function initTutorialEvents() {
    document.getElementById('tut-next-btn').addEventListener('click', () => {
        if (tutStep >= TUTORIAL_STEPS.length - 1) {
            closeTutorial(true);
        } else {
            tutStep++;
            renderTutStep();
        }
    });

    document.getElementById('tut-prev-btn').addEventListener('click', () => {
        if (tutStep > 0) {
            tutStep--;
            renderTutStep();
        }
    });

    document.getElementById('tut-skip-btn').addEventListener('click', () => {
        closeTutorial(false);
    });
}

init();