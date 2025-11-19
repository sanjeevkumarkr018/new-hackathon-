// Main Application Logic for Carbon Footprint Tracker

// Helper function to safely get CONFIG
function getConfig() {
    if (typeof CONFIG !== 'undefined') {
        return CONFIG;
    }
    if (typeof window !== 'undefined' && window.CONFIG) {
        return window.CONFIG;
    }
    // Fallback config if CONFIG is not loaded
    console.warn('CONFIG not found, using fallback');
    return {
        app: { demoMode: true, seedDemoData: false },
        emissionFactors: {
            transport: { car: 0.41, flightShort: 0.158, publicTransport: 0.053 },
            energy: { electricity: 0.233, gas: 5.3 },
            food: { meatMeal: 7.19, dairyServing: 2.5 },
            waste: { wasteBag: 2.5, recyclingOffset: -1.2 },
            shopping: { general: 0.005, electronics: 50 }
        },
        conversions: { kgToTonnes: 0.001, treesPerTonne: 20 },
        ui: { chartColors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'] },
        stripe: { priceId: 'price_premium_monthly' },
        chatbot: { mockMode: true, apiBase: 'http://localhost:5000' }
    };
}

// Initialize app on DOM load
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit to ensure CONFIG is loaded
    setTimeout(() => {
        initializeApp();
    }, 100);
});

// Global app state
const appState = {
    currentCalculation: null,
    userData: null,
    isPremium: false,
};

let trendChartInstance = null;
let categoryChartInstance = null;
let tokenChartInstance = null;
const DETAILED_BREAKDOWN_KEY = 'detailedBreakdown';

const defaultDetailedBreakdown = {
    transport: {
        total_km: 92.4,
        total_emissions_kg: 36.2,
        vehicles: [
            { vehicle: 'electric car', total_km: 48.6, trips: 6, avg_km_per_trip: 8.1, total_emissions_kg: 12.4 },
            { vehicle: 'metro', total_km: 28.4, trips: 8, avg_km_per_trip: 3.6, total_emissions_kg: 5.1 },
            { vehicle: 'rideshare', total_km: 15.4, trips: 3, avg_km_per_trip: 5.1, total_emissions_kg: 7.8 }
        ]
    },
    power: {
        total_kwh: 128.4,
        total_emissions_kg: 28.9,
        sources: [
            { source: 'Grid electricity', usage_kwh: 82.5, peak_window: '6pm-11pm', emissions_kg: 20.4, renewable_pct: 35 },
            { source: 'Solar array', usage_kwh: 24.0, peak_window: '11am-3pm', emissions_kg: 2.1, renewable_pct: 100 },
            { source: 'Backup generator', usage_kwh: 21.9, peak_window: 'During outages', emissions_kg: 6.4, renewable_pct: 0 }
        ]
    },
    shopping: {
        total_spend: 245,
        total_emissions_kg: 14.3,
        items: [
            { item: 'Groceries', total_amount: 120, units: 'USD', total_emissions_kg: 4.8 },
            { item: 'Electronics', total_amount: 1, units: 'items', total_emissions_kg: 6.5 },
            { item: 'Clothing', total_amount: 2, units: 'items', total_emissions_kg: 3.0 }
        ]
    },
    energy: {
        total_usage: 186,
        total_emissions_kg: 31.5,
        types: [
            { type: 'Heating', total_amount: 72, units: 'kWh', total_emissions_kg: 12.4 },
            { type: 'Cooling', total_amount: 46, units: 'kWh', total_emissions_kg: 7.8 },
            { type: 'Appliances', total_amount: 38, units: 'kWh', total_emissions_kg: 6.1 },
            { type: 'Lighting', total_amount: 30, units: 'kWh', total_emissions_kg: 5.2 }
        ]
    }
};

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function mergeBreakdownData(defaultData, storedData) {
    const merged = deepClone(defaultData);
    Object.entries(storedData || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (Array.isArray(value) || typeof value !== 'object') {
            merged[key] = value;
            return;
        }
        merged[key] = {
            ...(merged[key] || {}),
            ...value,
        };
    });
    return merged;
}

function getStoredDetailedBreakdown() {
    try {
        const stored = localStorage.getItem(DETAILED_BREAKDOWN_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        console.warn('Unable to parse stored breakdown data:', error);
        return null;
    }
}

function saveDetailedBreakdown(data) {
    try {
        localStorage.setItem(DETAILED_BREAKDOWN_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Unable to persist breakdown data:', error);
    }
}

function ensureDetailedBreakdown() {
    const stored = getStoredDetailedBreakdown();
    if (!stored) {
        const seed = deepClone(defaultDetailedBreakdown);
        saveDetailedBreakdown(seed);
        return seed;
    }
    const merged = mergeBreakdownData(defaultDetailedBreakdown, stored);
    saveDetailedBreakdown(merged);
    return merged;
}

function hasDetailedSections(breakdown) {
    return !!(breakdown && Object.keys(breakdown).length > 0);
}

const tokenSystem = (() => {
    const STORAGE_KEY = 'tokenTotals';
    const HISTORY_KEY = 'tokenHistory';
    const ACHIEVEMENT_KEY = 'tokenAchievements';
    const DAILY_KEY = 'tokenDailyTotals';
    const LEADERBOARD_KEY = 'tokenLeaderboard';
    const MAX_HISTORY = 80;
    const WEEKLY_GOAL = 700;
    const MONTHLY_GOAL = 3000;
    const MAX_SAVED_PER_DAY_KG = 1000; // anti-cheat threshold

    const achievementCatalog = [
        { id: 'starter', title: 'Green Starter', requirement: 100, type: 'tokens', icon: '🌱', description: 'Earn 100 tokens.' },
        { id: 'warrior', title: 'Eco Warrior', requirement: 1000, type: 'tokens', icon: '⚔️', description: 'Earn 1,000 tokens.' },
        { id: 'hero', title: 'Zero Carbon Hero', requirement: 10000, type: 'tokens', icon: '🦸‍♀️', description: 'Earn 10,000 tokens.' },
        { id: 'protector', title: 'Planet Protector', requirement: 20, type: 'streak', icon: '🛡️', description: 'Maintain a 20 day saving streak.' },
    ];

    let totals = {
        lifetimeTokens: 0,
        todayTokens: 0,
        weekTokens: 0,
        monthTokens: 0,
        todaySavedKg: 0,
        weekSavedKg: 0,
        monthSavedKg: 0,
        streakDays: 0,
        lastEarnedDate: null,
    };
    let history = [];
    let achievements = {};
    let dailyTotals = {};
    let leaderboard = [];

    function loadState() {
        totals = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || totals;
        totals = { ...totals, lifetimeTokens: totals.lifetimeTokens || 0, streakDays: totals.streakDays || 0 };
        history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || [];
        achievements = JSON.parse(localStorage.getItem(ACHIEVEMENT_KEY) || '{}') || {};
        dailyTotals = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}') || {};
        leaderboard = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]') || [];
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(totals));
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify(achievements));
        localStorage.setItem(DAILY_KEY, JSON.stringify(dailyTotals));
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
    }

    function isoDate(date = new Date()) {
        return date.toISOString().split('T')[0];
    }

    function daysBetween(dateA, dateB) {
        const start = new Date(dateA);
        const end = new Date(dateB);
        const diffTime = start.setHours(0, 0, 0, 0) - end.setHours(0, 0, 0, 0);
        return Math.round(diffTime / (1000 * 60 * 60 * 24));
    }

    function recalcAggregates() {
        const today = isoDate();
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 6);
        const weekStart = isoDate(weekAgo);
        const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));

        const inRange = (date, start) => date >= start;

        const totalsReducer = history.reduce((acc, entry) => {
            const tokens = entry.tokens || 0;
            const saved = entry.savedKg || 0;
            acc.lifetime += tokens;
            if (entry.date === today) {
                acc.today += tokens;
                acc.todaySaved += saved;
            }
            if (inRange(entry.date, weekStart)) {
                acc.week += tokens;
                acc.weekSaved += saved;
            }
            if (inRange(entry.date, monthStart)) {
                acc.month += tokens;
                acc.monthSaved += saved;
            }
            return acc;
        }, { lifetime: 0, today: 0, week: 0, month: 0, todaySaved: 0, weekSaved: 0, monthSaved: 0 });

        totals = {
            ...totals,
            lifetimeTokens: parseFloat(totalsReducer.lifetime.toFixed(2)),
            todayTokens: parseFloat(totalsReducer.today.toFixed(2)),
            weekTokens: parseFloat(totalsReducer.week.toFixed(2)),
            monthTokens: parseFloat(totalsReducer.month.toFixed(2)),
            todaySavedKg: parseFloat(totalsReducer.todaySaved.toFixed(2)),
            weekSavedKg: parseFloat(totalsReducer.weekSaved.toFixed(2)),
            monthSavedKg: parseFloat(totalsReducer.monthSaved.toFixed(2)),
        };
    }

    function updateStreak(date) {
        if (!totals.lastEarnedDate) {
            totals.streakDays = 1;
            totals.lastEarnedDate = date;
            return;
        }

        const diff = daysBetween(date, totals.lastEarnedDate);
        if (diff === 0) return;
        if (diff === 1) {
            totals.streakDays += 1;
        } else if (diff > 1) {
            totals.streakDays = 1;
        }
        totals.lastEarnedDate = date;
    }

    function renderHistory() {
        const list = document.getElementById('tokenHistoryList');
        const counter = document.getElementById('tokenHistoryCounter');
        if (!list) return;

        if (!history.length) {
            list.innerHTML = '<p class="empty-message">Log your activities to start earning tokens.</p>';
            if (counter) counter.textContent = '0 entries';
            return;
        }

        list.innerHTML = history.slice(0, 12).map(entry => `
            <div class="token-history-item">
                <div class="token-history-left">
                    <h4>${entry.date}</h4>
                    <p>${entry.message || 'Consistent progress recorded.'}</p>
                </div>
                <div class="token-history-value">+${entry.tokens.toFixed(1)} 🪙</div>
            </div>
        `).join('');

        if (counter) counter.textContent = `${history.length} entr${history.length === 1 ? 'y' : 'ies'}`;
    }

    function renderTotals() {
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('totalTokens', Math.round(totals.lifetimeTokens));
        setText('todayTokens', totals.todayTokens?.toFixed(1) || '0.0');
        setText('weekTokens', totals.weekTokens?.toFixed(1) || '0.0');
        setText('monthTokens', totals.monthTokens?.toFixed(1) || '0.0');
        setText('todaySavingsText', `${totals.todaySavedKg?.toFixed(1) || 0} kg saved today`);
        setText('weekSavingsText', `${Math.round(totals.weekTokens)} / ${WEEKLY_GOAL} tokens goal`);
        setText('monthSavingsText', `${Math.round(totals.monthTokens)} / ${MONTHLY_GOAL} tokens goal`);

        const weekFill = document.getElementById('weekProgressFill');
        const monthFill = document.getElementById('monthProgressFill');
        if (weekFill) {
            weekFill.style.width = `${Math.min(100, (totals.weekTokens / WEEKLY_GOAL) * 100)}%`;
        }
        if (monthFill) {
            monthFill.style.width = `${Math.min(100, (totals.monthTokens / MONTHLY_GOAL) * 100)}%`;
        }

        const motivationText = document.getElementById('tokenMotivationText');
        if (motivationText) {
            if (totals.todayTokens > 0) {
                if (totals.streakDays >= 5) {
                    motivationText.textContent = `🔥 ${totals.streakDays}-day streak! Keep the momentum for bonus perks.`;
                } else {
                    motivationText.textContent = `Great job! ${totals.todaySavedKg.toFixed(1)} kg saved today earned you ${totals.todayTokens.toFixed(1)} tokens.`;
                }
            } else {
                motivationText.textContent = 'Log a new activity today to keep your streak alive and earn more tokens.';
            }
        }
    }

    function renderAchievements(unlockedAchievement = null) {
        const grid = document.getElementById('achievementGrid');
        if (!grid) return;

        grid.innerHTML = achievementCatalog.map(config => {
            const unlocked = achievements[config.id]?.unlocked;
            const progressValue = config.type === 'tokens' ? totals.lifetimeTokens : totals.streakDays;
            const progress = Math.min(100, (progressValue / config.requirement) * 100);

            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
                    <div class="achievement-icon">${config.icon}</div>
                    <h4>${config.title}</h4>
                    <p>${config.description}</p>
                    <div class="achievement-progress">
                        ${unlocked ? 'Unlocked 🎉' : `${Math.min(progressValue, config.requirement).toFixed(0)} / ${config.requirement}`}
                    </div>
                </div>
            `;
        }).join('');

        if (unlockedAchievement) {
            showAchievementToast(unlockedAchievement);
        }
    }

    function renderLeaderboard() {
        const list = document.getElementById('leaderboardList');
        if (!list) return;

        const sample = [
            { name: 'Ava L.', tokens: 6840 },
            { name: 'Noah T.', tokens: 5210 },
            { name: 'Mila S.', tokens: 4875 },
            { name: 'Leo G.', tokens: 4620 },
        ];

        const youEntry = { name: 'You', tokens: Math.round(totals.lifetimeTokens) };
        const merged = [youEntry, ...sample];

        leaderboard = merged.sort((a, b) => b.tokens - a.tokens).slice(0, 5);

        list.innerHTML = leaderboard.map(item => `
            <li>
                <span>${item.name}</span>
                <span>${item.tokens.toLocaleString()} 🪙</span>
            </li>
        `).join('');
    }

    function renderChart() {
        const canvas = document.getElementById('tokenPerformanceChart');
        if (!canvas) return;

        const recent = history.slice(0, 10).reverse();
        if (!recent.length) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary');
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Earn tokens to see your progress.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary');
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Chart library loading...', canvas.width / 2, canvas.height / 2);
            return;
        }

        const labels = recent.map(entry => entry.date.slice(5));
        const savedData = recent.map(entry => entry.savedKg);
        const tokenData = recent.map(entry => entry.tokens);

        if (tokenChartInstance) {
            tokenChartInstance.destroy();
        }

        try {
            tokenChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Emissions Saved (kg)',
                        data: savedData,
                        backgroundColor: colorWithAlpha('#3b82f6', 0.4),
                        borderRadius: 6,
                        borderSkipped: false,
                        order: 2,
                    },
                    {
                        label: 'Tokens Earned',
                        data: tokenData,
                        type: 'line',
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#10b981',
                        tension: 0.35,
                        fill: false,
                        order: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true },
                },
                plugins: {
                    legend: { position: 'bottom' },
                },
            },
            });
        } catch (error) {
            console.error('Error creating token chart:', error);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary');
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Chart unavailable', canvas.width / 2, canvas.height / 2);
        }
    }

    function showAchievementToast(achievement) {
        const existing = document.querySelector('.achievement-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: var(--bg-primary);
            border: 1px solid var(--accent-primary);
            padding: 1rem 1.5rem;
            border-radius: 14px;
            box-shadow: var(--shadow-xl);
            z-index: 10000;
            animation: fadeInRight 0.4s ease;
        `;
        toast.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <div style="font-size:1.5rem;">${achievement.icon}</div>
                <div>
                    <strong>${achievement.title}</strong>
                    <p style="margin-top:0.25rem; color:var(--text-secondary);">Achievement unlocked!</p>
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function celebrate(tokens) {
        const container = document.getElementById('tokenCelebration');
        if (!container) return;
        const coin = document.createElement('span');
        coin.className = 'coin-drop';
        coin.textContent = '🪙';
        coin.style.left = `${50 + (Math.random() * 30 - 15)}%`;
        container.appendChild(coin);
        setTimeout(() => coin.remove(), 1200);
    }

    function checkAchievements() {
        achievementCatalog.forEach(config => {
            const progress = config.type === 'tokens' ? totals.lifetimeTokens : totals.streakDays;
            if (progress >= config.requirement && !achievements[config.id]?.unlocked) {
                achievements[config.id] = {
                    unlocked: true,
                    unlockedOn: isoDate(),
                };
                renderAchievements(config);
            }
        });
    }

    function updateUI() {
        renderTotals();
        renderHistory();
        renderAchievements();
        renderLeaderboard();
        renderChart();
    }

    function addHistoryEntry(entry) {
        history.unshift(entry);
        if (history.length > MAX_HISTORY) {
            history.pop();
        }
    }

    function recordCalculation({ currentTonnes, previousTonnes, date, message }, options = {}) {
        const currentKg = Math.max(0, (currentTonnes || 0) * 1000);
        const previousKg = typeof previousTonnes === 'number' ? Math.max(0, previousTonnes * 1000) : null;
        dailyTotals[date] = currentKg;

        if (previousKg === null) {
            recalcAggregates();
            saveState();
            updateUI();
            return;
        }

        const savedKg = Math.max(0, previousKg - currentKg);
        if (savedKg === 0) {
            recalcAggregates();
            saveState();
            updateUI();
            return;
        }

        if (savedKg > MAX_SAVED_PER_DAY_KG) {
            showNotification('Reported savings look unrealistic. Please verify your inputs.', 'error');
            return;
        }

        const tokensEarned = parseFloat((savedKg * 10).toFixed(2));

        const entry = {
            id: `token-${Date.now()}`,
            date,
            savedKg: parseFloat(savedKg.toFixed(2)),
            tokens: tokensEarned,
            message: message || 'Great reduction compared to last log!',
            createdAt: Date.now(),
        };

        addHistoryEntry(entry);
        updateStreak(date);
        recalcAggregates();
        checkAchievements();
        if (!options.silent) {
            celebrate(tokensEarned);
        }
        saveState();
        updateUI();
    }

    function init() {
        loadState();
        recalcAggregates();
        updateUI();
    }

    function showGuide() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:10000;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:640px; max-height:80vh; overflow-y:auto;">
                <div class="modal-header">
                    <h2>Impact Tokens 101</h2>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>• Every verified reduction compared to your last log converts to tokens: <strong>1 kg saved = 10 tokens</strong>.</p>
                    <p>• Keep logging daily to build streaks and unlock achievements.</p>
                    <p>• Anti-cheat protections flag unrealistic savings to keep the leaderboard fair.</p>
                    <p>• Redeem section launches soon with sustainable perks and donations.</p>
                </div>
                <div class="modal-actions">
                    <button class="btn-primary" id="tokenGuideCloseBtn">Got it!</button>
                </div>
            </div>
        `;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#tokenGuideCloseBtn').addEventListener('click', () => modal.remove());
        document.body.appendChild(modal);
    }

    function reset() {
        totals = {
            lifetimeTokens: 0,
            todayTokens: 0,
            weekTokens: 0,
            monthTokens: 0,
            todaySavedKg: 0,
            weekSavedKg: 0,
            monthSavedKg: 0,
            streakDays: 0,
            lastEarnedDate: null,
        };
        history = [];
        achievements = {};
        dailyTotals = {};
        leaderboard = [];
        saveState();
        updateUI();
    }

    return {
        init,
        recordCalculation,
        showGuide,
        reset,
    };
})();

if (typeof window !== 'undefined') {
    window.tokenSystem = tokenSystem;
}

// Initialize application
async function initializeApp() {
    try {
        console.log('Initializing app...');
        
        // Setup event listeners with error handling
        try {
            setupThemeToggle();
        } catch (e) {
            console.warn('Theme toggle setup failed:', e);
        }
        
        try {
            setupNavigation();
        } catch (e) {
            console.warn('Navigation setup failed:', e);
        }
        
        try {
            setupFloatingChat();
        } catch (e) {
            console.warn('Floating chat setup failed:', e);
        }
        
        try {
            setupCalculator();
        } catch (e) {
            console.error('Calculator setup failed:', e);
        }
        
        try {
            setupDashboard();
        } catch (e) {
            console.warn('Dashboard setup failed:', e);
        }
        
        try {
            ensureDetailedBreakdown();
        } catch (e) {
            console.warn('Detailed breakdown setup failed:', e);
        }
        
        try {
            setupTokenSystem();
        } catch (e) {
            console.warn('Token system setup failed:', e);
        }
        
        try {
            setupHistory();
        } catch (e) {
            console.warn('History setup failed:', e);
        }
        
        try {
            setupInsights();
        } catch (e) {
            console.warn('Insights setup failed:', e);
        }
        
        try {
            setupGoals();
        } catch (e) {
            console.warn('Goals setup failed:', e);
        }
        
        try {
            setupTasks();
        } catch (e) {
            console.warn('Tasks setup failed:', e);
        }
        
        try {
            setupPremium();
        } catch (e) {
            console.warn('Premium setup failed:', e);
        }
        
        try {
            setupProfile();
        } catch (e) {
            console.warn('Profile setup failed:', e);
        }
        
        try {
            setupAuth();
        } catch (e) {
            console.warn('Auth setup failed:', e);
        }

        // Load user data
        try {
            await loadUserData();
        } catch (e) {
            console.warn('User data load failed:', e);
        }

        // Initialize dashboard with demo data
        try {
            const config = getConfig();
            const shouldSeedDemo = !!(config?.app?.demoMode && config?.app?.seedDemoData);
            if (shouldSeedDemo) {
                loadDemoData();
            }
        } catch (e) {
            console.warn('Demo data load failed:', e);
        }

        // Update dashboard on load
        try {
            updateDashboard();
        } catch (e) {
            console.warn('Dashboard update failed:', e);
        }

        // Update UI based on user state
        try {
            updateUI();
        } catch (e) {
            console.warn('UI update failed:', e);
        }
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Critical error during app initialization:', error);
        alert('There was an error initializing the app. Please refresh the page. Error: ' + error.message);
    }
}

// Theme Toggle
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = document.documentElement.getAttribute('data-theme');

    themeToggle.innerHTML = currentTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggle.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
    });
}

// Navigation
function setupNavigation() {
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking a link (except chat link which opens modal)
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.id !== 'chatLink') {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
            });
        }
    });
    
    // Close mobile menu when chat link opens modal
    const chatLink = document.getElementById('chatLink');
    if (chatLink) {
        chatLink.addEventListener('click', () => {
            navMenu.classList.remove('active');
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// Scroll to section helper
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Floating Chat Modal Setup
function setupFloatingChat() {
    const chatLink = document.getElementById('chatLink');
    const floatingChatButton = document.getElementById('floatingChatButton');
    const floatingChatModal = document.getElementById('floatingChatModal');
    const floatingChatClose = document.getElementById('floatingChatClose');

    // Open modal when chat link is clicked
    if (chatLink) {
        chatLink.addEventListener('click', (e) => {
            e.preventDefault();
            openFloatingChat();
        });
    }

    // Open modal when floating chat button is clicked
    if (floatingChatButton) {
        floatingChatButton.addEventListener('click', (e) => {
            e.preventDefault();
            openFloatingChat();
        });
    }

    // Close modal when close button is clicked
    if (floatingChatClose) {
        floatingChatClose.addEventListener('click', () => {
            closeFloatingChat();
        });
    }

    // Close modal when clicking outside the container
    if (floatingChatModal) {
        floatingChatModal.addEventListener('click', (e) => {
            if (e.target === floatingChatModal) {
                closeFloatingChat();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && floatingChatModal && !floatingChatModal.classList.contains('hidden')) {
            closeFloatingChat();
        }
    });
}

// Open floating chat modal
function openFloatingChat() {
    const floatingChatModal = document.getElementById('floatingChatModal');
    const floatingChatButton = document.getElementById('floatingChatButton');
    const floatingChatIframe = document.getElementById('floatingChatIframe');
    
    if (floatingChatModal) {
        floatingChatModal.style.display = 'flex';
        floatingChatModal.classList.remove('hidden');
        
        // Hide floating button when modal is open
        if (floatingChatButton) {
            floatingChatButton.style.display = 'none';
        }
        
        // Reload iframe to ensure fresh content
        if (floatingChatIframe) {
            floatingChatIframe.src = floatingChatIframe.src;
        }
        
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
}

// Close floating chat modal
function closeFloatingChat() {
    const floatingChatModal = document.getElementById('floatingChatModal');
    const floatingChatButton = document.getElementById('floatingChatButton');
    
    if (floatingChatModal) {
        floatingChatModal.classList.add('hidden');
        setTimeout(() => {
            floatingChatModal.style.display = 'none';
        }, 300); // Wait for animation to complete
        
        // Show floating button again when modal is closed
        if (floatingChatButton) {
            floatingChatButton.style.display = 'flex';
        }
        
        // Restore body scroll
        document.body.style.overflow = '';
    }
}

// Calculator Setup
function setupCalculator() {
    const calcTabs = document.querySelectorAll('.calc-tab');
    const calcPanels = document.querySelectorAll('.calc-panel');
    const calculateBtn = document.getElementById('calculateBtn');
    const saveCalculationBtn = document.getElementById('saveCalculationBtn');

    if (!calculateBtn) {
        console.error('Calculate button not found');
        return;
    }

    // Tab switching
    calcTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const category = tab.getAttribute('data-category');
            
            // Update active tab
            calcTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active panel
            calcPanels.forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`${category}-panel`);
            if (panel) {
                panel.classList.add('active');
            }
        });
    });

    setupCalcCategoryToggles();

    // Calculate button
    calculateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Show loading state
        const btnText = document.getElementById('calculateBtnText');
        const btnLoading = document.getElementById('calculateBtnLoading');
        if (btnText && btnLoading) {
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
        }
        calculateBtn.disabled = true;
        
        // Small delay to show loading state, then calculate
        setTimeout(() => {
            try {
                const result = calculateFootprint();
                // If calculation returns false or undefined, there was an error
                if (result === false) {
                    console.error('Calculation returned false');
                }
            } catch (error) {
                console.error('Error calculating footprint:', error);
                // Still show result even if there's an error, as long as we have a value
                if (appState.currentCalculation && appState.currentCalculation.co2e !== undefined) {
                    displayCalculationResult(appState.currentCalculation.co2e);
                } else {
                    alert('Error calculating footprint. Please check your inputs and try again. Error: ' + (error.message || error));
                }
            } finally {
                // Hide loading state
                if (btnText && btnLoading) {
                    btnText.style.display = 'inline';
                    btnLoading.style.display = 'none';
                }
                calculateBtn.disabled = false;
            }
        }, 100);
    });

    // Allow Enter key to trigger calculation
    document.querySelectorAll('.calculator-content .input-field').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                calculateBtn.click();
            }
        });
    });

    // Save calculation button
    if (saveCalculationBtn) {
        saveCalculationBtn.addEventListener('click', () => {
            saveCalculation();
        });
    }
}

function setupCalcCategoryToggles() {
    try {
        const toggles = document.querySelectorAll('.calc-category-toggle');
        
        if (toggles.length === 0) {
            console.warn('No calculator category toggles found');
            return;
        }
        
        toggles.forEach(toggle => {
            try {
                const targetId = toggle.getAttribute('data-target') || toggle.getAttribute('aria-controls');
                if (!targetId) {
                    console.warn('Toggle missing data-target or aria-controls:', toggle);
                    return;
                }
                
                const content = document.getElementById(targetId);
                if (!content) {
                    console.warn('Content element not found for toggle:', targetId);
                    return;
                }
                
                // Ensure initial state matches aria-expanded
                const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
                content.style.display = isExpanded ? 'grid' : 'none';
                if (isExpanded) {
                    content.removeAttribute('hidden');
                } else {
                    content.setAttribute('hidden', 'hidden');
                }
                
                // Use a flag to prevent duplicate listeners
                if (toggle.dataset.listenerAttached === 'true') {
                    return; // Already has listener
                }
                toggle.dataset.listenerAttached = 'true';
                
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        const currentlyExpanded = toggle.getAttribute('aria-expanded') === 'true';
                        const nextState = !currentlyExpanded;
                        toggle.setAttribute('aria-expanded', nextState);
                        
                        if (nextState) {
                            content.removeAttribute('hidden');
                            content.style.display = 'grid';
                        } else {
                            content.setAttribute('hidden', 'hidden');
                            content.style.display = 'none';
                        }
                        
                        const icon = toggle.querySelector('.calc-toggle-icon');
                        if (icon) {
                            icon.textContent = nextState ? '−' : '+';
                        }
                    } catch (err) {
                        console.error('Error toggling category:', err);
                    }
                });
            } catch (err) {
                console.error('Error setting up toggle:', err);
            }
        });
        
        console.log(`Setup ${toggles.length} calculator category toggles`);
    } catch (error) {
        console.error('Error in setupCalcCategoryToggles:', error);
    }
}

// Calculate Carbon Footprint
function calculateFootprint() {
    console.log('Starting calculation...');
    
    // Get CONFIG safely
    const CONFIG_TO_USE = getConfig();
    
    if (!CONFIG_TO_USE || !CONFIG_TO_USE.emissionFactors) {
        console.error('CONFIG not loaded');
        alert('Configuration not loaded. Please refresh the page and ensure config.js loads before app.js.');
        return false;
    }

    const factors = CONFIG_TO_USE.emissionFactors;
    let totalCo2e = 0; // kg CO2e

    // Helper function to safely parse float with default 0
    const safeParseFloat = (elementId) => {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element ${elementId} not found, defaulting to 0`);
            return 0;
        }
        const value = parseFloat(element.value);
        return isNaN(value) || value < 0 ? 0 : value;
    };

    try {
        // Transport - All values default to 0 if not provided (inputs are already daily)
        // Personal Vehicles
        const carMilesPerDay = safeParseFloat('car-miles');
        const electricCarMilesPerDay = safeParseFloat('electric-car-miles');
        const hybridCarMilesPerDay = safeParseFloat('hybrid-car-miles');
        const motorcycleMilesPerDay = safeParseFloat('motorcycle-miles');
        
        // Public Transportation
        const metroMilesPerDay = safeParseFloat('metro-miles');
        const busMilesPerDay = safeParseFloat('bus-miles');
        const trainMilesPerDay = safeParseFloat('train-miles');
        const tramMilesPerDay = safeParseFloat('tram-miles');
        
        // Rides & Taxis
        const taxiMilesPerDay = safeParseFloat('taxi-miles');
        const rideshareMilesPerDay = safeParseFloat('rideshare-miles');
        
        // Air Travel
        const flightShortKmPerDay = safeParseFloat('flight-short-km');
        const flightLongKmPerDay = safeParseFloat('flight-long-km');
        
        // Eco-Friendly (zero emissions, but tracked for completeness)
        const bikeMilesPerDay = safeParseFloat('bike-miles');
        const walkingMilesPerDay = safeParseFloat('walking-miles');
        
        // Calculate emissions
        const transportCarCo2e = carMilesPerDay * factors.transport.car;
        const transportElectricCarCo2e = electricCarMilesPerDay * factors.transport.electricCar;
        const transportHybridCarCo2e = hybridCarMilesPerDay * factors.transport.hybridCar;
        const transportMotorcycleCo2e = motorcycleMilesPerDay * factors.transport.motorcycle;
        const transportMetroCo2e = metroMilesPerDay * factors.transport.metro;
        const transportBusCo2e = busMilesPerDay * factors.transport.bus;
        const transportTrainCo2e = trainMilesPerDay * factors.transport.train;
        const transportTramCo2e = tramMilesPerDay * factors.transport.tram;
        const transportTaxiCo2e = taxiMilesPerDay * factors.transport.taxi;
        const transportRideshareCo2e = rideshareMilesPerDay * factors.transport.rideshare;
        const transportFlightShortCo2e = flightShortKmPerDay * factors.transport.flightShort;
        const transportFlightLongCo2e = flightLongKmPerDay * factors.transport.flightLong;
        const transportBikeCo2e = bikeMilesPerDay * factors.transport.bike; // 0
        const transportWalkingCo2e = walkingMilesPerDay * factors.transport.walking; // 0
        
        const totalTransportCo2e = transportCarCo2e + transportElectricCarCo2e + transportHybridCarCo2e +
            transportMotorcycleCo2e + transportMetroCo2e + transportBusCo2e + transportTrainCo2e +
            transportTramCo2e + transportTaxiCo2e + transportRideshareCo2e + transportFlightShortCo2e +
            transportFlightLongCo2e + transportBikeCo2e + transportWalkingCo2e;
        
        totalCo2e += totalTransportCo2e;

        console.log('Transport calculation:', {
            car: transportCarCo2e.toFixed(2),
            electricCar: transportElectricCarCo2e.toFixed(2),
            hybridCar: transportHybridCarCo2e.toFixed(2),
            motorcycle: transportMotorcycleCo2e.toFixed(2),
            metro: transportMetroCo2e.toFixed(2),
            bus: transportBusCo2e.toFixed(2),
            train: transportTrainCo2e.toFixed(2),
            tram: transportTramCo2e.toFixed(2),
            taxi: transportTaxiCo2e.toFixed(2),
            rideshare: transportRideshareCo2e.toFixed(2),
            flightShort: transportFlightShortCo2e.toFixed(2),
            flightLong: transportFlightLongCo2e.toFixed(2),
            total: totalTransportCo2e.toFixed(2)
        });

        // Energy - All values default to 0 if not provided (inputs are already daily)
        const electricityPerDay = safeParseFloat('electricity');
        const gasPerDay = safeParseFloat('gas');
        const renewablePercent = Math.min(100, Math.max(0, safeParseFloat('renewable-percent'))); // Clamp 0-100
        const heatingOilPerDay = safeParseFloat('heating-oil');
        const propanePerDay = safeParseFloat('propane');
        const coalPerDay = safeParseFloat('coal');
        const solarKwhPerDay = safeParseFloat('solar-kwh');
        const windKwhPerDay = safeParseFloat('wind-kwh');
        
        const electricityEmissions = electricityPerDay * factors.energy.electricity * (1 - renewablePercent / 100);
        const gasCo2e = gasPerDay * factors.energy.gas;
        const heatingOilCo2e = heatingOilPerDay * factors.energy.heatingOil;
        const propaneCo2e = propanePerDay * factors.energy.propane;
        const coalCo2e = coalPerDay * factors.energy.coal;
        const solarCo2e = solarKwhPerDay * factors.energy.solar; // Low emissions from manufacturing
        const windCo2e = windKwhPerDay * factors.energy.wind; // Very low emissions from manufacturing
        
        const totalEnergyCo2e = electricityEmissions + gasCo2e + heatingOilCo2e + propaneCo2e + coalCo2e + solarCo2e + windCo2e;
        
        totalCo2e += totalEnergyCo2e;

        console.log('Energy calculation:', {
            electricity: electricityEmissions.toFixed(2),
            gas: gasCo2e.toFixed(2),
            heatingOil: heatingOilCo2e.toFixed(2),
            propane: propaneCo2e.toFixed(2),
            coal: coalCo2e.toFixed(2),
            solar: solarCo2e.toFixed(2),
            wind: windCo2e.toFixed(2),
            total: totalEnergyCo2e.toFixed(2)
        });

        // Food - All values default to 0 if not provided (inputs are already daily)
        const beefMealsPerDay = safeParseFloat('beef-meals');
        const chickenMealsPerDay = safeParseFloat('chicken-meals');
        const fishMealsPerDay = safeParseFloat('fish-meals');
        const meatMealsPerDay = safeParseFloat('meat-meals');
        const vegetarianMealsPerDay = safeParseFloat('vegetarian-meals');
        const veganMealsPerDay = safeParseFloat('vegan-meals');
        const dairyPerDay = safeParseFloat('dairy-products');
        const cheeseServingsPerDay = safeParseFloat('cheese-servings');
        const eggsServingsPerDay = safeParseFloat('eggs-servings');
        const processedFoodMealsPerDay = safeParseFloat('processed-food-meals');
        const localFoodPercent = Math.min(100, Math.max(0, safeParseFloat('local-food'))); // Clamp 0-100
        
        const localReduction = Math.max(0.8, 1 - (localFoodPercent / 100) * 0.2); // 20% reduction max for local
        const foodBeefCo2e = beefMealsPerDay * factors.food.beefMeal * localReduction;
        const foodChickenCo2e = chickenMealsPerDay * factors.food.chickenMeal * localReduction;
        const foodFishCo2e = fishMealsPerDay * factors.food.fishMeal * localReduction;
        const foodMeatCo2e = meatMealsPerDay * factors.food.meatMeal * localReduction;
        const foodVegetarianCo2e = vegetarianMealsPerDay * factors.food.vegetarianMeal * localReduction;
        const foodVeganCo2e = veganMealsPerDay * factors.food.veganMeal * localReduction;
        const foodDairyCo2e = dairyPerDay * factors.food.dairyServing;
        const foodCheeseCo2e = cheeseServingsPerDay * factors.food.cheese;
        const foodEggsCo2e = eggsServingsPerDay * factors.food.eggs;
        const foodProcessedCo2e = processedFoodMealsPerDay * factors.food.processedFood;
        
        const totalFoodCo2e = foodBeefCo2e + foodChickenCo2e + foodFishCo2e + foodMeatCo2e +
            foodVegetarianCo2e + foodVeganCo2e + foodDairyCo2e + foodCheeseCo2e + foodEggsCo2e + foodProcessedCo2e;
        
        totalCo2e += totalFoodCo2e;

        console.log('Food calculation:', {
            beef: foodBeefCo2e.toFixed(2),
            chicken: foodChickenCo2e.toFixed(2),
            fish: foodFishCo2e.toFixed(2),
            otherMeat: foodMeatCo2e.toFixed(2),
            vegetarian: foodVegetarianCo2e.toFixed(2),
            vegan: foodVeganCo2e.toFixed(2),
            dairy: foodDairyCo2e.toFixed(2),
            cheese: foodCheeseCo2e.toFixed(2),
            eggs: foodEggsCo2e.toFixed(2),
            processed: foodProcessedCo2e.toFixed(2),
            total: totalFoodCo2e.toFixed(2)
        });

        // Waste - All values default to 0 if not provided (inputs are already daily)
        const wasteBagsPerDay = safeParseFloat('waste-bags');
        const plasticWastePerDay = safeParseFloat('plastic-waste');
        const paperWastePerDay = safeParseFloat('paper-waste');
        const organicWastePerDay = safeParseFloat('organic-waste');
        const recyclingPercent = Math.min(100, Math.max(0, safeParseFloat('recycling-percent'))); // Clamp 0-100
        const compostPercent = Math.min(100, Math.max(0, safeParseFloat('compost-percent'))); // Clamp 0-100
        
        const wasteBagsEmissions = wasteBagsPerDay * factors.waste.wasteBag;
        const plasticWasteEmissions = plasticWastePerDay * factors.waste.plasticWaste;
        const paperWasteEmissions = paperWastePerDay * factors.waste.paperWaste;
        const organicWasteEmissions = organicWastePerDay * factors.waste.organicWaste;
        
        const totalWasteEmissions = wasteBagsEmissions + plasticWasteEmissions + paperWasteEmissions + organicWasteEmissions;
        const recyclingOffset = totalWasteEmissions * (recyclingPercent / 100) * Math.abs(factors.waste.recyclingOffset);
        const compostOffset = totalWasteEmissions * (compostPercent / 100) * Math.abs(factors.waste.compostOffset);
        const wasteCo2e = totalWasteEmissions - recyclingOffset - compostOffset;
        
        totalCo2e += wasteCo2e;

        console.log('Waste calculation:', {
            wasteBags: wasteBagsEmissions.toFixed(2),
            plastic: plasticWasteEmissions.toFixed(2),
            paper: paperWasteEmissions.toFixed(2),
            organic: organicWasteEmissions.toFixed(2),
            recyclingOffset: recyclingOffset.toFixed(2),
            compostOffset: compostOffset.toFixed(2),
            netWasteCo2e: wasteCo2e.toFixed(2)
        });

        // Shopping - All values default to 0 if not provided (inputs are already daily)
        const shoppingSpendPerDay = safeParseFloat('shopping-spend');
        const electronicsPerDay = safeParseFloat('electronics');
        const clothingItemsPerDay = safeParseFloat('clothing-items');
        const furnitureItemsPerDay = safeParseFloat('furniture-items');
        const appliancesItemsPerDay = safeParseFloat('appliances-items');
        const booksItemsPerDay = safeParseFloat('books-items');
        const toysItemsPerDay = safeParseFloat('toys-items');
        const onlinePackagesPerDay = safeParseFloat('online-packages');
        
        const shoppingCo2e = shoppingSpendPerDay * factors.shopping.general;
        const electronicsCo2e = electronicsPerDay * factors.shopping.electronics;
        const clothingCo2e = clothingItemsPerDay * factors.shopping.clothing;
        const furnitureCo2e = furnitureItemsPerDay * factors.shopping.furniture;
        const appliancesCo2e = appliancesItemsPerDay * factors.shopping.appliances;
        const booksCo2e = booksItemsPerDay * factors.shopping.books;
        const toysCo2e = toysItemsPerDay * factors.shopping.toys;
        const shippingCo2e = onlinePackagesPerDay * factors.shopping.onlineShipping;
        
        const totalShoppingCo2e = shoppingCo2e + electronicsCo2e + clothingCo2e + furnitureCo2e +
            appliancesCo2e + booksCo2e + toysCo2e + shippingCo2e;
        
        totalCo2e += totalShoppingCo2e;

        console.log('Shopping calculation:', {
            general: shoppingCo2e.toFixed(2),
            electronics: electronicsCo2e.toFixed(2),
            clothing: clothingCo2e.toFixed(2),
            furniture: furnitureCo2e.toFixed(2),
            appliances: appliancesCo2e.toFixed(2),
            books: booksCo2e.toFixed(2),
            toys: toysCo2e.toFixed(2),
            shipping: shippingCo2e.toFixed(2),
            total: totalShoppingCo2e.toFixed(2)
        });

        // Convert to tonnes and store (daily values)
        const kgToTonnes = CONFIG_TO_USE.conversions?.kgToTonnes || 0.001;
        const totalTonnes = totalCo2e * kgToTonnes;
        
        console.log('Total calculation (daily):', {
            totalKgCo2e: totalCo2e.toFixed(2),
            totalTonnesCo2e: totalTonnes.toFixed(2)
        });
        
        // Ensure totalTonnes is a valid number
        const finalTotalTonnes = isNaN(totalTonnes) || totalTonnes < 0 ? 0 : totalTonnes;
        
        appState.currentCalculation = {
            co2e: finalTotalTonnes,
            category: 'mixed', // Mixed category since it includes all
            timestamp: new Date().toISOString(),
            breakdown: {
                transport: totalTransportCo2e * kgToTonnes,
                energy: totalEnergyCo2e * kgToTonnes,
                food: totalFoodCo2e * kgToTonnes,
                waste: wasteCo2e * kgToTonnes,
                shopping: totalShoppingCo2e * kgToTonnes
            }
        };

        // Get previous calculation for comparison
        const previousCalculation = getPreviousCalculation();
        
        // Display result with comparison
        console.log('About to display result:', finalTotalTonnes);
        displayCalculationResult(finalTotalTonnes, previousCalculation);
        
    } catch (error) {
        console.error('Error in calculateFootprint:', error);
        // Don't throw error, instead show a default result of 0
        console.warn('Calculation error, defaulting to 0:', error);
        const totalTonnes = 0;
        
        appState.currentCalculation = {
            co2e: totalTonnes,
            category: 'mixed',
            timestamp: new Date().toISOString(),
        };
        
        displayCalculationResult(totalTonnes);
        return false; // Return false to indicate error but don't throw
    }
    
    return true; // Success
}

// Get Previous Calculation for Comparison
function getPreviousCalculation() {
    const logs = api.getCarbonLogs();
    if (logs.length === 0) return null;
    
    // Get the most recent calculation
    const sortedLogs = logs.sort((a, b) => {
        const dateA = new Date(a.timestamp || a.date || 0);
        const dateB = new Date(b.timestamp || b.date || 0);
        return dateB - dateA;
    });
    
    return sortedLogs[0];
}

// Display Calculation Result
function displayCalculationResult(tonnes, previousCalculation = null) {
    console.log('Displaying result:', tonnes, 'Previous:', previousCalculation);
    
    const resultDiv = document.getElementById('calculationResult');
    const resultValue = document.getElementById('resultValue');
    const resultDescription = document.getElementById('resultDescription');
    
    if (!resultDiv || !resultValue) {
        console.error('Result display elements not found', {
            resultDiv: !!resultDiv,
            resultValue: !!resultValue
        });
        alert(`Your daily carbon footprint is ${tonnes.toFixed(2)} tCO₂e`);
        return;
    }
    
    // Ensure tonnes is a valid number
    const displayValue = isNaN(tonnes) || tonnes < 0 ? 0 : tonnes;
    
    console.log('Setting result value to:', displayValue.toFixed(2));
    resultValue.textContent = displayValue.toFixed(2);
    
    // Build description with comparison
    if (resultDescription) {
        let description = '';
        
        if (displayValue === 0) {
            description = 'Enter values in any category above to calculate your footprint. Empty fields default to 0.';
        } else {
            // Base description (converted to daily average)
            // Global average ~4.8 tCO₂e/year = ~0.013 tCO₂e/day
            if (displayValue < 0.013) {
                description = 'Great! This is below the global daily average of ~0.013 tCO₂e per person.';
            } else if (displayValue < 0.022) {
                description = 'This is close to the global daily average. Consider ways to reduce further.';
            } else {
                description = 'This is above the daily average. Explore our insights for reduction tips!';
            }
            
            // Add comparison if previous calculation exists
            if (previousCalculation && previousCalculation.co2e) {
                const previousValue = parseFloat(previousCalculation.co2e) || 0;
                const difference = displayValue - previousValue;
                const percentChange = previousValue > 0 ? ((difference / previousValue) * 100) : 0;
                
                if (Math.abs(difference) > 0.01) { // Only show if significant difference
                    if (difference < 0) {
                        description += ` 🎉 This is ${Math.abs(difference).toFixed(2)} tCO₂e less (${Math.abs(percentChange).toFixed(1)}% reduction) than your last calculation!`;
                    } else {
                        description += ` 📈 This is ${difference.toFixed(2)} tCO₂e more (${percentChange.toFixed(1)}% increase) than your last calculation.`;
                    }
                } else {
                    description += ' This matches your previous calculation.';
                }
            }
        }
        
        resultDescription.textContent = description;
        resultDescription.style.display = 'block';
    }
    
    // Force display styles - use !important to override any CSS
    resultDiv.style.setProperty('display', 'block', 'important');
    resultDiv.style.setProperty('visibility', 'visible', 'important');
    resultDiv.style.setProperty('opacity', '1', 'important');
    
    console.log('Result div display style:', resultDiv.style.display);
    
    // Scroll to result smoothly
    setTimeout(() => {
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
}

// Get Current Category
function getCurrentCategory() {
    const activeTab = document.querySelector('.calc-tab.active');
    return activeTab ? activeTab.getAttribute('data-category') : 'transport';
}

// Save Calculation
async function saveCalculation() {
    if (!appState.currentCalculation) {
        alert('No calculation to save. Please calculate your footprint first.');
        return;
    }

    const saveBtn = document.getElementById('saveCalculationBtn');
    const originalText = saveBtn ? saveBtn.textContent : 'Save to Dashboard';
    
    try {
        // Show loading state
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        const currentTimestamp = now.toISOString();
        const user_id = api.user?.id || null;
        const config = getConfig();
        const baseUrl = config.api?.baseUrl || 'http://localhost:5000/api';
        const CONFIG_TO_USE = getConfig();
        const factors = CONFIG_TO_USE.emissionFactors;

        // Get previous calculation for notes
        const previousCalculation = getPreviousCalculation();
        let notes = `Calculated footprint: ${appState.currentCalculation.co2e.toFixed(2)} tCO₂e/day`;
        
        if (previousCalculation && previousCalculation.co2e) {
            const previousValue = parseFloat(previousCalculation.co2e) || 0;
            const difference = appState.currentCalculation.co2e - previousValue;
            if (Math.abs(difference) > 0.01) {
                if (difference < 0) {
                    notes += ` (${Math.abs(difference).toFixed(2)} tCO₂e reduction from previous)`;
                } else {
                    notes += ` (${difference.toFixed(2)} tCO₂e increase from previous)`;
                }
            }
        }

        // Save to local storage (existing functionality)
        const logData = {
            category: appState.currentCalculation.category || 'mixed',
            co2e: appState.currentCalculation.co2e,
            value: appState.currentCalculation.co2e,
            notes: notes,
            timestamp: currentTimestamp,
            date: currentDate,
        };
        
        console.log('Saving calculation to local storage:', logData);
        const savedLog = await api.saveCarbonLog(logData);
        console.log('Calculation saved to local storage:', savedLog);
        
        tokenSystem.recordCalculation({
            currentTonnes: appState.currentCalculation.co2e,
            previousTonnes: previousCalculation?.co2e ?? null,
            date: currentDate,
            message: notes,
        });
        
        // Immediately update history from local storage to show the new entry
        updateHistoryFromStorage();

        // Save to CarbonBuddy API with actual input values from calculator
        const breakdown = appState.currentCalculation.breakdown || {};
        const kgToTonnes = 0.001;
        
        // Helper to get input values
        const getInputValue = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || 0 : 0;
        };
        
        // Helper function to save transport entry
        const saveTransportEntry = async (inputId, subcategory, factorKey, label, isKm = false) => {
            const value = isKm ? getInputValue(inputId) : getInputValue(inputId);
            if (value <= 0) return;
            
            const kmValue = isKm ? value : value * 1.60934; // Convert miles to km if needed
            const emissionsKg = (isKm ? value / 1.60934 : value) * factors.transport[factorKey];
            const co2eTonnes = emissionsKg * 0.001;
            
            const logData = {
                category: 'transport',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: `${label}: ${value.toFixed(2)} ${isKm ? 'km' : 'miles'}/day from calculator`,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: subcategory,
                amount: kmValue,
                units: 'km',
                emissions_kg: emissionsKg
            };
            await api.saveCarbonLog(logData);
            
            try {
                await fetch(`${baseUrl}/logEntry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user_id && { 'X-User-Id': user_id }),
                    },
                    body: JSON.stringify({
                        user_id: user_id,
                        category: 'transport',
                        subcategory: subcategory,
                        distance_km: kmValue,
                        amount: kmValue,
                        units: 'km',
                        date: currentDate,
                        emissions_kg: emissionsKg,
                        notes: `${label}: ${value.toFixed(2)} ${isKm ? 'km' : 'miles'}/day from calculator`,
                    }),
                });
            } catch (error) {
                console.error(`Error saving ${subcategory} entry:`, error);
            }
        };
        
        // Save all transport entries
        await saveTransportEntry('car-miles', 'car', 'car', 'Car (Gasoline)');
        await saveTransportEntry('electric-car-miles', 'electricCar', 'electricCar', 'Electric Car');
        await saveTransportEntry('hybrid-car-miles', 'hybridCar', 'hybridCar', 'Hybrid Car');
        await saveTransportEntry('motorcycle-miles', 'motorcycle', 'motorcycle', 'Motorcycle');
        await saveTransportEntry('metro-miles', 'metro', 'metro', 'Metro/Subway');
        await saveTransportEntry('bus-miles', 'bus', 'bus', 'Bus');
        await saveTransportEntry('train-miles', 'train', 'train', 'Train');
        await saveTransportEntry('tram-miles', 'tram', 'tram', 'Tram/Streetcar');
        await saveTransportEntry('taxi-miles', 'taxi', 'taxi', 'Taxi');
        await saveTransportEntry('rideshare-miles', 'rideshare', 'rideshare', 'Rideshare');
        await saveTransportEntry('bike-miles', 'bike', 'bike', 'Bicycle');
        await saveTransportEntry('walking-miles', 'walking', 'walking', 'Walking');
        
        // Save flight entries (in km)
        const flightShortKm = getInputValue('flight-short-km');
        if (flightShortKm > 0) {
            const emissionsKg = flightShortKm * factors.transport.flightShort;
            const co2eTonnes = emissionsKg * 0.001;
            const logData = {
                category: 'transport',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: `Short-haul flights: ${flightShortKm.toFixed(2)} km/day from calculator`,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: 'flightShort',
                amount: flightShortKm,
                units: 'km',
                emissions_kg: emissionsKg
            };
            await api.saveCarbonLog(logData);
        }
        
        const flightLongKm = getInputValue('flight-long-km');
        if (flightLongKm > 0) {
            const emissionsKg = flightLongKm * factors.transport.flightLong;
            const co2eTonnes = emissionsKg * 0.001;
            const logData = {
                category: 'transport',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: `Long-haul flights: ${flightLongKm.toFixed(2)} km/day from calculator`,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: 'flightLong',
                amount: flightLongKm,
                units: 'km',
                emissions_kg: emissionsKg
            };
            await api.saveCarbonLog(logData);
        }

        // Save energy entries - ELECTRICITY (inputs are already daily)
        const electricityPerDay = getInputValue('electricity');
        if (electricityPerDay > 0) {
            const renewablePercent = Math.min(100, Math.max(0, getInputValue('renewable-percent')));
            const electricityKg = electricityPerDay * factors.energy.electricity * (1 - renewablePercent / 100); // Daily emissions in kg
            const electricityCo2eTonnes = electricityKg * 0.001; // Convert kg to tonnes
            
            // Save to local storage for history display
            const electricityLogData = {
                category: 'energy',
                co2e: electricityCo2eTonnes,
                value: electricityCo2eTonnes,
                notes: `Electricity: ${electricityPerDay.toFixed(2)} kWh/day, ${renewablePercent}% renewable from calculator`,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: 'electricity',
                amount: electricityPerDay,
                units: 'kWh',
                emissions_kg: electricityKg
            };
            await api.saveCarbonLog(electricityLogData);
            
            try {
                await fetch(`${baseUrl}/logEntry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user_id && { 'X-User-Id': user_id }),
                    },
                    body: JSON.stringify({
                        user_id: user_id,
                        category: 'energy',
                        subcategory: 'electricity',
                        amount: electricityPerDay, // Daily kWh
                        units: 'kWh',
                        date: currentDate,
                        emissions_kg: electricityKg,
                        notes: `Electricity: ${electricityPerDay.toFixed(2)} kWh/day, ${renewablePercent}% renewable from calculator`,
                        emission_factor: factors.energy.electricity * (1 - renewablePercent / 100),
                    }),
                });
            } catch (error) {
                console.error('Error saving electricity entry:', error);
            }
        }

        // Helper function to save energy entry
        const saveEnergyEntry = async (inputId, subcategory, factorKey, label, units) => {
            const value = getInputValue(inputId);
            if (value <= 0) return;
            
            const emissionsKg = value * factors.energy[factorKey];
            const co2eTonnes = emissionsKg * 0.001;
            
            const logData = {
                category: 'energy',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: `${label}: ${value.toFixed(2)} ${units}/day from calculator`,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: subcategory,
                amount: value,
                units: units,
                emissions_kg: emissionsKg
            };
            await api.saveCarbonLog(logData);
            
            try {
                await fetch(`${baseUrl}/logEntry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user_id && { 'X-User-Id': user_id }),
                    },
                    body: JSON.stringify({
                        user_id: user_id,
                        category: 'energy',
                        subcategory: subcategory,
                        amount: value,
                        units: units,
                        date: currentDate,
                        emissions_kg: emissionsKg,
                        notes: `${label}: ${value.toFixed(2)} ${units}/day from calculator`,
                        emission_factor: factors.energy[factorKey],
                    }),
                });
            } catch (error) {
                console.error(`Error saving ${subcategory} entry:`, error);
            }
        };
        
        // Save all energy entries
        await saveEnergyEntry('gas', 'gas', 'gas', 'Natural gas', 'therms');
        await saveEnergyEntry('heating-oil', 'heatingOil', 'heatingOil', 'Heating oil', 'gallons');
        await saveEnergyEntry('propane', 'propane', 'propane', 'Propane', 'gallons');
        await saveEnergyEntry('coal', 'coal', 'coal', 'Coal', 'lbs');
        await saveEnergyEntry('solar-kwh', 'solar', 'solar', 'Solar', 'kWh');
        await saveEnergyEntry('wind-kwh', 'wind', 'wind', 'Wind', 'kWh');

        // Helper function to save food entry
        const saveFoodEntry = async (inputId, subcategory, factorKey, label, units, useLocalReduction = false) => {
            const value = getInputValue(inputId);
            if (value <= 0) return;
            
            const localFoodPercent = Math.min(100, Math.max(0, getInputValue('local-food')));
            const localReduction = useLocalReduction ? Math.max(0.8, 1 - (localFoodPercent / 100) * 0.2) : 1;
            const emissionsKg = value * factors.food[factorKey] * localReduction;
            const co2eTonnes = emissionsKg * 0.001;
            
            const notes = useLocalReduction 
                ? `${label}: ${value.toFixed(2)} ${units}/day, ${localFoodPercent}% local from calculator`
                : `${label}: ${value.toFixed(2)} ${units}/day from calculator`;
            
            const logData = {
                category: 'food',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: notes,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: subcategory,
                amount: value,
                units: units,
                emissions_kg: emissionsKg
            };
            await api.saveCarbonLog(logData);
            
            try {
                await fetch(`${baseUrl}/logEntry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user_id && { 'X-User-Id': user_id }),
                    },
                    body: JSON.stringify({
                        user_id: user_id,
                        category: 'food',
                        subcategory: subcategory,
                        amount: value,
                        units: units,
                        date: currentDate,
                        emissions_kg: emissionsKg,
                        notes: notes,
                        emission_factor: factors.food[factorKey] * localReduction,
                    }),
                });
            } catch (error) {
                console.error(`Error saving ${subcategory} entry:`, error);
            }
        };
        
        // Save all food entries
        await saveFoodEntry('beef-meals', 'beef', 'beefMeal', 'Beef meals', 'meals', true);
        await saveFoodEntry('chicken-meals', 'chicken', 'chickenMeal', 'Chicken meals', 'meals', true);
        await saveFoodEntry('fish-meals', 'fish', 'fishMeal', 'Fish meals', 'meals', true);
        await saveFoodEntry('meat-meals', 'meat', 'meatMeal', 'Meat meals', 'meals', true);
        await saveFoodEntry('vegetarian-meals', 'vegetarian', 'vegetarianMeal', 'Vegetarian meals', 'meals', true);
        await saveFoodEntry('vegan-meals', 'vegan', 'veganMeal', 'Vegan meals', 'meals', true);
        await saveFoodEntry('dairy-products', 'dairy', 'dairyServing', 'Dairy', 'servings', false);
        await saveFoodEntry('cheese-servings', 'cheese', 'cheese', 'Cheese', 'servings', false);
        await saveFoodEntry('eggs-servings', 'eggs', 'eggs', 'Eggs', 'servings', false);
        await saveFoodEntry('processed-food-meals', 'processedFood', 'processedFood', 'Processed food', 'meals', false);

        // Helper function to save shopping entry
        const saveShoppingEntry = async (inputId, subcategory, factorKey, label, units) => {
            const value = getInputValue(inputId);
            if (value <= 0) return;
            
            const emissionsKg = value * factors.shopping[factorKey];
            const co2eTonnes = emissionsKg * 0.001;
            
            const logData = {
                category: 'shopping',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: `${label}: ${value.toFixed(2)} ${units}/day from calculator`,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: subcategory,
                amount: value,
                units: units,
                emissions_kg: emissionsKg
            };
            await api.saveCarbonLog(logData);
            
            try {
                await fetch(`${baseUrl}/logEntry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user_id && { 'X-User-Id': user_id }),
                    },
                    body: JSON.stringify({
                        user_id: user_id,
                        category: 'shopping',
                        subcategory: subcategory,
                        amount: value,
                        units: units,
                        date: currentDate,
                        emissions_kg: emissionsKg,
                        notes: `${label}: ${value.toFixed(2)} ${units}/day from calculator`,
                        emission_factor: factors.shopping[factorKey],
                    }),
                });
            } catch (error) {
                console.error(`Error saving ${subcategory} entry:`, error);
            }
        };
        
        // Save all shopping entries
        await saveShoppingEntry('shopping-spend', 'general', 'general', 'Shopping', '$');
        await saveShoppingEntry('electronics', 'electronics', 'electronics', 'Electronics', 'items');
        await saveShoppingEntry('clothing-items', 'clothing', 'clothing', 'Clothing', 'items');
        await saveShoppingEntry('furniture-items', 'furniture', 'furniture', 'Furniture', 'items');
        await saveShoppingEntry('appliances-items', 'appliances', 'appliances', 'Appliances', 'items');
        await saveShoppingEntry('books-items', 'books', 'books', 'Books', 'items');
        await saveShoppingEntry('toys-items', 'toys', 'toys', 'Toys', 'items');
        await saveShoppingEntry('online-packages', 'onlineShipping', 'onlineShipping', 'Online shipping', 'packages');

        // Helper function to save waste entry
        const saveWasteEntry = async (inputId, subcategory, factorKey, label, units) => {
            const value = getInputValue(inputId);
            if (value <= 0) return;
            
            const recyclingPercent = Math.min(100, Math.max(0, getInputValue('recycling-percent')));
            const compostPercent = Math.min(100, Math.max(0, getInputValue('compost-percent')));
            const wasteEmissions = value * factors.waste[factorKey];
            const recyclingOffset = wasteEmissions * (recyclingPercent / 100) * Math.abs(factors.waste.recyclingOffset);
            const compostOffset = wasteEmissions * (compostPercent / 100) * Math.abs(factors.waste.compostOffset);
            const wasteKg = wasteEmissions - recyclingOffset - compostOffset;
            const co2eTonnes = wasteKg * 0.001;
            
            const notes = `${label}: ${value.toFixed(2)} ${units}/day, ${recyclingPercent}% recycling, ${compostPercent}% compost from calculator`;
            
            const logData = {
                category: 'other',
                co2e: co2eTonnes,
                value: co2eTonnes,
                notes: notes,
                timestamp: currentTimestamp,
                date: currentDate,
                subcategory: subcategory,
                amount: value,
                units: units,
                emissions_kg: wasteKg
            };
            await api.saveCarbonLog(logData);
            
            try {
                await fetch(`${baseUrl}/logEntry`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user_id && { 'X-User-Id': user_id }),
                    },
                    body: JSON.stringify({
                        user_id: user_id,
                        category: 'other',
                        subcategory: subcategory,
                        amount: value,
                        units: units,
                        date: currentDate,
                        emissions_kg: wasteKg,
                        notes: notes,
                        emission_factor: factors.waste[factorKey] * (1 - (recyclingPercent / 100) * Math.abs(factors.waste.recyclingOffset) / factors.waste[factorKey] - (compostPercent / 100) * Math.abs(factors.waste.compostOffset) / factors.waste[factorKey]),
                    }),
                });
            } catch (error) {
                console.error(`Error saving ${subcategory} entry:`, error);
            }
        };
        
        // Save all waste entries
        await saveWasteEntry('waste-bags', 'waste', 'wasteBag', 'Waste bags', 'bags');
        await saveWasteEntry('plastic-waste', 'plasticWaste', 'plasticWaste', 'Plastic waste', 'lbs');
        await saveWasteEntry('paper-waste', 'paperWaste', 'paperWaste', 'Paper waste', 'lbs');
        await saveWasteEntry('organic-waste', 'organicWaste', 'organicWaste', 'Organic waste', 'lbs');
        
        // Wait a moment for all API calls to complete, then update dashboard and history
        setTimeout(async () => {
            try {
                updateDashboard(); // Synchronous function
            } catch (error) {
                console.error('Error updating dashboard after save:', error);
                // Don't show alert here, just log - the save was successful
            }
            
            // Force refresh history - ensure it's updated with latest data from all saved entries
            // Get fresh logs after all individual entries have been saved
            const allLogs = api.getCarbonLogs();
            console.log('Total logs after all saves:', allLogs.length);
            
            if (allLogs.length > 0) {
                // Display history with all saved entries (matches PDF data)
                displayHistoryFromLocalLogs(allLogs);
                
                // Visual feedback
                const tableBody = document.getElementById('dailyHistoryTableBody');
                if (tableBody) {
                    tableBody.style.transition = 'opacity 0.3s ease';
                    tableBody.style.opacity = '0.8';
                    setTimeout(() => {
                        tableBody.style.opacity = '1';
                    }, 300);
                }
            } else {
                updateHistoryFromStorage();
            }
            
            // Also try to load from API in background (non-blocking) for sync
            setTimeout(async () => {
                try {
                    await loadHistory(); // This will try API first, then fallback to local
                } catch (error) {
                    console.warn('API history load failed, using local storage:', error);
                    // Re-display from local storage to ensure consistency
                    const logs = api.getCarbonLogs();
                    if (logs.length > 0) {
                        displayHistoryFromLocalLogs(logs);
                    }
                }
            }, 300);
            
            // Show success message
            if (saveBtn) {
                saveBtn.textContent = '✓ Saved!';
                saveBtn.style.background = 'var(--accent-primary)';
                saveBtn.style.color = 'white';
                
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.disabled = false;
                    saveBtn.style.background = '';
                    saveBtn.style.color = '';
                }, 2000);
            }
            
            // Final update to ensure history is current
            updateHistoryFromStorage();
            
            // Show notification with link to Detailed History board
            showNotification('Calculation saved! History updated. Click here to view.', 'success', () => {
                scrollToSection('history');
                // Final refresh when user clicks to view history
                setTimeout(() => {
                    updateHistoryFromStorage();
                    // Highlight the history table briefly to show it's been updated
                    const historyTable = document.getElementById('dailyHistoryTable');
                    if (historyTable) {
                        historyTable.style.transition = 'background-color 0.5s ease';
                        historyTable.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                        setTimeout(() => {
                            historyTable.style.backgroundColor = '';
                        }, 2000);
                    }
                }, 100);
            });
        }, 500); // Wait 500ms for API calls to complete
        
    } catch (error) {
        console.error('Error saving calculation:', error);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
        
        // Don't show alert for chart-related errors - those are non-critical
        const isChartError = error.message && (
            error.message.includes('Chart') || 
            error.message.includes('chart') ||
            error.message.includes('Chart.js')
        );
        
        if (!isChartError) {
            alert('Error saving calculation. Please try again. Error: ' + (error.message || error));
        } else {
            console.warn('Chart error during save (non-critical):', error.message);
            // Still show success since the data was saved
            showNotification('Calculation saved! Charts may take a moment to update.', 'success');
        }
    }
}

// Show Notification
function showNotification(message, type = 'info', onClick = null) {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? 'var(--accent-primary)' : 'var(--accent-danger)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
        cursor: ${onClick ? 'pointer' : 'default'};
    `;
    
    if (onClick) {
        notification.addEventListener('click', onClick);
        notification.style.cursor = 'pointer';
    }
    
    // Add animation style if not exists
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Dashboard Setup
function setupDashboard() {
    const exportBtn = document.getElementById('exportBtn');
    
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            handleExport();
        });
    }

    // Initialize charts
    initializeCharts();
}

function setupTokenSystem() {
    tokenSystem.init();
    const guideBtn = document.getElementById('tokenGuideBtn');
    if (guideBtn) {
        guideBtn.addEventListener('click', () => tokenSystem.showGuide());
    }
    const redeemBtn = document.getElementById('redeemTokensBtn');
    if (redeemBtn) {
        redeemBtn.addEventListener('click', () => {
            showNotification('Rewards marketplace launching soon. Stay tuned!', 'info');
        });
    }
}

// Initialize Charts
function initializeCharts() {
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded yet, using fallback charts');
        // Trend Chart
        const trendCtx = document.getElementById('trendChart');
        if (trendCtx) {
            drawTrendChart(trendCtx);
        }

        // Category Chart
        const categoryCtx = document.getElementById('categoryChart');
        if (categoryCtx) {
            drawCategoryChart(categoryCtx);
        }
        return;
    }

    // Chart.js is available, use it
    try {
        // Trend Chart
        const trendCtx = document.getElementById('trendChart');
        if (trendCtx) {
            drawTrendChart(trendCtx);
        }

        // Category Chart
        const categoryCtx = document.getElementById('categoryChart');
        if (categoryCtx) {
            drawCategoryChart(categoryCtx);
        }
    } catch (error) {
        console.error('Error initializing charts:', error);
        // Fallback to legacy charts
        const trendCtx = document.getElementById('trendChart');
        if (trendCtx) {
            drawLegacyTrendChart(trendCtx, api.getCarbonLogs());
        }
        const categoryCtx = document.getElementById('categoryChart');
        if (categoryCtx) {
            drawLegacyCategoryChart(categoryCtx, api.getCarbonLogs());
        }
    }
}

// Draw Trend Chart (simple canvas-based chart)
function drawTrendChart(canvas) {
    const logs = api.getCarbonLogs();

    if (typeof Chart === 'undefined') {
        drawLegacyTrendChart(canvas, logs);
        return;
    }

    const ctx = canvas.getContext('2d');
    const days = 14;
    const dataPoints = generateDailyData(logs, days);
    const labels = dataPoints.map(point => point.date);
    const values = dataPoints.map(point => Number((point.co2e || 0).toFixed(2)));
    const movingAverageWindow = Math.min(7, values.length);
    const movingAverageValues = values.map((value, index) => {
        const start = Math.max(0, index - movingAverageWindow + 1);
        const subset = values.slice(start, index + 1);
        const avg = subset.reduce((sum, val) => sum + val, 0) / subset.length;
        return Number(avg.toFixed(2));
    });
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#10b981';
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, colorWithAlpha(accentColor, 0.35));
    gradient.addColorStop(1, colorWithAlpha(accentColor, 0.02));

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Daily emissions',
                    data: values,
                    fill: true,
                    borderColor: accentColor,
                    backgroundColor: gradient,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: accentColor,
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.35,
                },
                {
                    label: '7-day moving average',
                    data: movingAverageValues,
                    borderColor: colorWithAlpha('#0f172a', 0.6),
                    borderDash: [6, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.25,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 20,
                    bottom: 10,
                    left: 0,
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: colorWithAlpha('#94a3b8', 0.3),
                    },
                    ticks: {
                        callback: (value) => `${Number(value).toFixed(1)} t`,
                        font: {
                            size: 11,
                        },
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#64748b',
                    },
                    title: {
                        display: true,
                        text: 'Daily emissions (tCO₂e)',
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#64748b',
                        font: {
                            weight: '600',
                        },
                    }
                },
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 7,
                        font: {
                            size: 11,
                        },
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#64748b',
                    },
                    title: {
                        display: true,
                        text: 'Last 14 days',
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#64748b',
                        font: {
                            weight: '600',
                        },
                    }
                },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                    },
                },
                title: {
                    display: true,
                    text: 'Daily CO₂ emissions trend',
                    align: 'start',
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') || '#0f172a',
                    font: {
                        size: 16,
                        weight: '600',
                    },
                    padding: {
                        bottom: 16,
                    },
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.parsed.y?.toFixed(2) || '0.00'} tCO₂e`,
                    },
                    backgroundColor: 'rgba(15, 23, 42, 0.85)',
                    titleFont: { weight: '600' },
                    padding: 12,
                },
            },
        },
    });
}

// Draw Category Chart (using Chart.js with readable legend)
function drawCategoryChart(canvas) {
    const logs = api.getCarbonLogs();
    const categoryData = {};
    logs.forEach(log => {
        const category = log.category || 'other';
        categoryData[category] = (categoryData[category] || 0) + (parseFloat(log.co2e) || 0);
    });

    const categories = Object.keys(categoryData);
    const values = Object.values(categoryData);

    if (typeof Chart === 'undefined') {
        drawLegacyCategoryChart(canvas, logs);
        renderCategoryLegend(categories, values, getConfig().ui.chartColors);
        return;
    }

    if (categories.length === 0 || values.reduce((sum, val) => sum + val, 0) === 0) {
        if (categoryChartInstance) {
            categoryChartInstance.destroy();
            categoryChartInstance = null;
        }
        renderCategoryLegend([], [], getConfig().ui.chartColors);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary');
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const colors = getConfig().ui.chartColors || ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: categories.map(formatCategoryLabel),
            datasets: [{
                data: values.map(value => Number(value.toFixed(3))),
                backgroundColor: categories.map((_, index) => colors[index % colors.length]),
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary') || '#ffffff',
                borderWidth: 2,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const dataset = context.dataset;
                            const total = dataset.data.reduce((sum, val) => sum + val, 0);
                            const value = context.parsed;
                            const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
                            return `${context.label}: ${value.toFixed(2)} tCO₂e (${percent}%)`;
                        },
                    },
                },
            },
        },
    });

    renderCategoryLegend(categories, values, colors);
}

function drawLegacyTrendChart(canvas, logs) {
    const ctx = canvas.getContext('2d');
    
    if (logs.length === 0) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary');
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    const days = 30;
    const data = generateDailyData(logs, days);

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color');
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary');
    ctx.lineWidth = 2;
    ctx.beginPath();

    const maxValue = Math.max(...data.map(d => d.co2e), 1);
    data.forEach((point, index) => {
        const x = padding + (index / (days - 1)) * chartWidth;
        const y = height - padding - (point.co2e / maxValue) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary');
    data.forEach((point, index) => {
        const x = padding + (index / (days - 1)) * chartWidth;
        const y = height - padding - (point.co2e / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function drawLegacyCategoryChart(canvas, logs) {
    const ctx = canvas.getContext('2d');
    
    if (logs.length === 0) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary');
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const categoryData = {};
    logs.forEach(log => {
        const category = log.category || 'other';
        categoryData[category] = (categoryData[category] || 0) + log.co2e;
    });

    const categories = Object.keys(categoryData);
    const values = Object.values(categoryData);
    const total = values.reduce((a, b) => a + b, 0);

    if (total === 0) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 3;
    const innerRadius = radius * 0.6;

    let currentAngle = -Math.PI / 2;
    const colors = getConfig().ui.chartColors;

    categories.forEach((category, index) => {
        const sliceAngle = (values[index] / total) * 2 * Math.PI;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
        ctx.closePath();
        ctx.fillStyle = colors[index % colors.length];
        ctx.fill();

        currentAngle += sliceAngle;
    });
}

function colorWithAlpha(color, alpha) {
    if (!color) return `rgba(16, 185, 129, ${alpha})`;
    const trimmed = color.trim();
    const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(16, 185, 129, ${alpha})`;
}

function formatCategoryLabel(value) {
    if (!value) return 'Other';
    const map = {
        transport: 'Transport',
        energy: 'Energy',
        food: 'Food',
        shopping: 'Shopping',
        waste: 'Waste',
        other: 'Other',
        power: 'Power',
    };
    return map[value] || value.charAt(0).toUpperCase() + value.slice(1);
}

function renderCategoryLegend(categories, values, colors) {
    const legend = document.getElementById('categoryLegend');
    if (!legend) return;

    if (!categories.length || values.every(value => value === 0)) {
        legend.innerHTML = '<p class="empty-message">No category data available yet. Save a calculation to populate this chart.</p>';
        return;
    }

    const total = values.reduce((sum, val) => sum + val, 0);
    legend.innerHTML = categories.map((category, index) => {
        const value = values[index];
        const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
        const color = colors[index % colors.length];
        return `
            <div class="chart-legend-item">
                <span class="chart-legend-swatch" style="background:${color};"></span>
                <span class="chart-legend-label">${formatCategoryLabel(category)}</span>
                <span class="chart-legend-value">${percent}%</span>
            </div>
        `;
    }).join('');
}

function formatNumber(value, decimals = 2) {
    const num = Number(value);
    if (Number.isNaN(num)) {
        return (0).toFixed(decimals);
    }
    return num.toFixed(decimals);
}

// Generate Daily Data
function generateDailyData(logs, days) {
    const data = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        const dayLogs = logs.filter(log => {
            if (!log.timestamp && !log.date) return false;
            const logDateStr = (log.timestamp || log.date).split('T')[0];
            return logDateStr === dateStr;
        });
        
        const dailyCo2e = dayLogs.reduce((sum, log) => sum + (log.co2e || 0), 0);
        data.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            co2e: dailyCo2e || 0,
        });
    }
    
    return data;
}

// Update Dashboard
function updateDashboard() {
    console.log('Updating dashboard...');
    const logs = api.getCarbonLogs();
    console.log('Carbon logs:', logs);
    
    // Calculate total CO2e (all time - using all logs for now)
    const totalCo2e = logs.reduce((sum, log) => sum + (parseFloat(log.co2e) || 0), 0);
    
    // Calculate daily CO2e (today)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const todayLogs = logs.filter(log => {
        if (!log.timestamp && !log.date) return false;
        const logDateStr = (log.timestamp || log.date).split('T')[0]; // Extract date part
        return logDateStr === todayStr;
    });
    
    const dailyCo2e = todayLogs.reduce((sum, log) => sum + (parseFloat(log.co2e) || 0), 0);
    console.log('Daily CO2e:', dailyCo2e);
    
    // Update KPI cards - use daily or total
    const monthlyCo2El = document.getElementById('monthlyCo2');
    if (monthlyCo2El) {
        monthlyCo2El.textContent = dailyCo2e > 0 ? dailyCo2e.toFixed(2) : totalCo2e.toFixed(2);
        // Update label to indicate daily
        const label = monthlyCo2El.parentElement?.querySelector('.kpi-label');
        if (label) {
            label.textContent = 'Daily CO₂e';
        }
    }

    // Calculate trees equivalent based on what we're displaying
    const displayCo2e = dailyCo2e > 0 ? dailyCo2e : totalCo2e;
    const treesEquivalent = Math.ceil(displayCo2e * getConfig().conversions.treesPerTonne);
    const treesEl = document.getElementById('treesEquivalent');
    if (treesEl) {
        treesEl.textContent = treesEquivalent;
    }

    // Calculate daily change (compare today with yesterday)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayLogs = logs.filter(log => {
        if (!log.timestamp && !log.date) return false;
        const logDateStr = (log.timestamp || log.date).split('T')[0];
        return logDateStr === yesterdayStr;
    });
    const yesterdayCo2e = yesterdayLogs.reduce((sum, log) => sum + (parseFloat(log.co2e) || 0), 0);
    const dailyChange = yesterdayCo2e > 0 ? (((dailyCo2e - yesterdayCo2e) / yesterdayCo2e) * 100) : 0;
    const weeklyChangeEl = document.getElementById('weeklyChange');
    if (weeklyChangeEl) {
        weeklyChangeEl.textContent = `${dailyChange >= 0 ? '+' : ''}${dailyChange.toFixed(1)}%`;
        weeklyChangeEl.className = dailyChange >= 0 ? 'kpi-change positive' : 'kpi-change negative';
        // Update label
        const changeLabel = weeklyChangeEl.parentElement?.querySelector('.kpi-label');
        if (changeLabel && changeLabel.textContent.includes('week')) {
            changeLabel.textContent = 'Change vs Yesterday';
        }
    }

    // Update goal progress if there's a goal (using daily values)
    const goal = JSON.parse(localStorage.getItem('currentGoal') || 'null');
    if (goal) {
        const goalProgress = Math.min(100, (dailyCo2e / (goal.percent / 100)) * 100);
        const goalProgressEl = document.getElementById('goalProgress');
        if (goalProgressEl) {
            goalProgressEl.textContent = `${goalProgress.toFixed(1)}%`;
        }
    }

    // Redraw charts
    initializeCharts();
    
    console.log('Dashboard updated successfully');
}

// Load Demo Data
function loadDemoData() {
    if (api.getCarbonLogs().length === 0) {
        const now = Date.now();
        const demoTemplate = [
            { category: 'transport', co2e: 2.6, daysAgo: 12, notes: 'Office commute' },
            { category: 'energy', co2e: 1.9, daysAgo: 11, notes: 'Heating usage' },
            { category: 'shopping', co2e: 0.7, daysAgo: 10, notes: 'Weekly groceries' },
            { category: 'transport', co2e: 1.4, daysAgo: 9, notes: 'Metro rides' },
            { category: 'food', co2e: 1.1, daysAgo: 8, notes: 'Dining out' },
            { category: 'energy', co2e: 2.2, daysAgo: 7, notes: 'AC usage' },
            { category: 'shopping', co2e: 1.6, daysAgo: 6, notes: 'Electronics upgrade' },
            { category: 'transport', co2e: 2.1, daysAgo: 5, notes: 'Weekend trip' },
            { category: 'energy', co2e: 1.5, daysAgo: 4, notes: 'Appliances runtime' },
            { category: 'shopping', co2e: 0.9, daysAgo: 3, notes: 'Household items' },
            { category: 'transport', co2e: 1.2, daysAgo: 2, notes: 'Errands' },
            { category: 'energy', co2e: 1.7, daysAgo: 1, notes: 'Evening heating' }
        ];

        const demoLogs = demoTemplate.map((entry, index) => ({
            id: `demo-${index + 1}`,
            ...entry,
            timestamp: new Date(now - entry.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        }));

        localStorage.setItem('carbonLogs', JSON.stringify(demoLogs));

        const hasTokenHistory = JSON.parse(localStorage.getItem('tokenHistory') || '[]').length > 0;
        if (!hasTokenHistory) {
            let syntheticPrevious = demoLogs[0].co2e + 1;
            demoLogs
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .forEach(log => {
                    tokenSystem.recordCalculation({
                        currentTonnes: log.co2e,
                        previousTonnes: syntheticPrevious,
                        date: log.timestamp.split('T')[0],
                        message: log.notes,
                    }, { silent: true });
                    syntheticPrevious = log.co2e + 0.2;
                });
        }
    }

    ensureDetailedBreakdown();
    updateDashboard();
}

// Insights Setup
function setupInsights() {
    generateInsights();
}

// Generate Insights
function generateInsights() {
    const logs = api.getCarbonLogs();
    const insightsGrid = document.getElementById('insightsGrid');
    if (!insightsGrid) return;

    insightsGrid.innerHTML = '';

    const insights = [
        {
            icon: '🚗',
            title: 'Reduce Car Travel',
            text: 'Consider carpooling, public transport, or cycling for shorter trips. This could reduce your transport emissions by up to 30%.',
            type: 'warning',
        },
        {
            icon: '⚡',
            title: 'Switch to Renewable Energy',
            text: 'Consider switching to a renewable energy provider. Even a 50% renewable mix can significantly reduce your energy footprint.',
            type: 'info',
        },
        {
            icon: '🍽️',
            title: 'Eat Less Meat',
            text: 'Reducing meat consumption by even one meal per week can make a significant difference in your carbon footprint.',
            type: 'info',
        },
        {
            icon: '♻️',
            title: 'Improve Recycling',
            text: 'Increase your recycling rate to reduce waste emissions. Aim for 80%+ recycling to maximize impact.',
            type: 'warning',
        },
    ];

    insights.forEach(insight => {
        const insightCard = document.createElement('div');
        insightCard.className = `insight-card ${insight.type || ''}`;
        insightCard.innerHTML = `
            <div class="insight-icon">${insight.icon}</div>
            <h3 class="insight-title">${insight.title}</h3>
            <p class="insight-text">${insight.text}</p>
            <a href="#calculator" class="insight-action">Learn More →</a>
        `;
        insightsGrid.appendChild(insightCard);
    });
}

// Goals Setup
function setupGoals() {
    const setGoalBtn = document.getElementById('setGoalBtn');
    
    if (setGoalBtn) {
        setGoalBtn.addEventListener('click', () => {
            setGoal();
        });
    }

    loadChallenges();
}

// Set Goal
function setGoal() {
    const goalPercent = parseFloat(document.getElementById('goal-percent').value);
    const goalDeadline = document.getElementById('goal-deadline').value;

    if (!goalPercent || !goalDeadline) {
        alert('Please fill in all fields');
        return;
    }

    const goal = {
        id: 'goal-' + Date.now(),
        percent: goalPercent,
        deadline: goalDeadline,
        createdAt: new Date().toISOString(),
    };

    localStorage.setItem('currentGoal', JSON.stringify(goal));
    updateDashboard();
    loadChallenges();
    alert('Goal set successfully!');
}

// Load Challenges
function loadChallenges() {
    const challengesContainer = document.getElementById('challengesContainer');
    if (!challengesContainer) return;

    const goal = JSON.parse(localStorage.getItem('currentGoal') || 'null');
    
    if (!goal) {
        challengesContainer.innerHTML = '<p>Set a goal to start tracking challenges!</p>';
        return;
    }

    const progress = calculateGoalProgress(goal);
    
    const challengeHTML = `
        <div class="challenge-item">
            <div class="challenge-title">Reduce emissions by ${goal.percent}%</div>
            <div class="challenge-progress">
                <div class="challenge-progress-bar" style="width: ${progress}%"></div>
            </div>
            <div style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                ${progress.toFixed(1)}% complete
            </div>
        </div>
    `;
    
    challengesContainer.innerHTML = challengeHTML;
}

// Calculate Goal Progress
function calculateGoalProgress(goal) {
    // Simplified progress calculation
    const logs = api.getCarbonLogs();
    // This would compare current vs baseline emissions
    return Math.min(50, Math.random() * 100); // Placeholder
}

// Premium Setup
function setupPremium() {
    const subscribeBtn = document.getElementById('subscribeBtn');
    
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', () => {
            handleSubscribe();
        });
    }
}

// Handle Subscribe
async function handleSubscribe() {
    try {
        const config = getConfig();
        const session = await api.createCheckoutSession(config.stripe.priceId);
        
        if (config.app.demoMode) {
            // In demo mode, simulate redirect
            setTimeout(() => {
                alert('Demo: Subscription successful! You now have premium access.');
                updateUI();
            }, 2000);
        } else {
            // Redirect to Stripe Checkout
            window.location.href = session.url;
        }
    } catch (error) {
        console.error('Subscription error:', error);
        alert('Error initiating subscription. Please try again.');
    }
}

// Profile Setup
function setupProfile() {
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const manageSubscriptionBtn = document.getElementById('manageSubscriptionBtn');
    
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', () => {
            saveProfile();
        });
    }

    if (manageSubscriptionBtn) {
        manageSubscriptionBtn.addEventListener('click', () => {
            manageSubscription();
        });
    }

    loadProfile();
}

// Load Profile
async function loadProfile() {
    try {
        const user = await api.getUserProfile();
        
        if (user) {
            document.getElementById('household-size').value = user.householdSize || 1;
            document.getElementById('location').value = user.location || '';
            document.getElementById('units').value = user.units || 'imperial';
            
            if (document.getElementById('currentPlan')) {
                document.getElementById('currentPlan').textContent = user.isPremium ? 'Premium' : 'Free';
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Save Profile
async function saveProfile() {
    const profileData = {
        householdSize: parseInt(document.getElementById('household-size').value) || 1,
        location: document.getElementById('location').value,
        units: document.getElementById('units').value,
    };

    try {
        await api.updateUserProfile(profileData);
        alert('Profile updated successfully!');
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile. Please try again.');
    }
}

// Manage Subscription
function manageSubscription() {
    if (getConfig().app.demoMode) {
        alert('Demo: Redirect to Stripe Customer Portal');
    } else {
        window.location.href = api.getStripeCustomerPortalUrl();
    }
}

// Export Handler - PDF Export
async function handleExport() {
    if (!appState.isPremium && !getConfig().app.demoMode) {
        alert('Premium subscription required for export. Please upgrade to premium.');
        return;
    }

    try {
        // Load jsPDF library dynamically if not already loaded
        if (typeof window.jspdf === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => {
                if (typeof window.jspdf !== 'undefined') {
                    generatePDF();
                } else {
                    alert('Failed to load PDF library. Please try again.');
                }
            };
            script.onerror = () => {
                alert('Failed to load PDF library. Please check your internet connection.');
            };
            document.head.appendChild(script);
        } else {
            generatePDF();
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting data. Please try again.');
    }
}

// Generate PDF Report
function generatePDF() {
    if (typeof window.jspdf === 'undefined') {
        alert('PDF library not loaded. Please try again.');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const logs = api.getCarbonLogs();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Colors
    const primaryColor = [16, 185, 129]; // #10b981
    const darkColor = [26, 26, 26]; // #1a1a1a
    const lightGray = [245, 245, 245];
    
    let yPos = 20;
    
    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Carbon Footprint Report', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${dateStr}`, 105, 30, { align: 'center' });
    
    yPos = 50;
    doc.setTextColor(...darkColor);
    
    // Summary Section
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, yPos);
    yPos += 10;
    
    // Calculate totals
    const totalCo2e = logs.reduce((sum, log) => sum + (parseFloat(log.co2e) || 0), 0);
    const categoryBreakdown = {};
    logs.forEach(log => {
        const cat = log.category || 'other';
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (parseFloat(log.co2e) || 0);
    });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total CO₂e: ${totalCo2e.toFixed(2)} tonnes`, 25, yPos);
    yPos += 7;
    doc.text(`Total Entries: ${logs.length}`, 25, yPos);
    yPos += 10;
    
    // Category Breakdown
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Category Breakdown', 20, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    Object.entries(categoryBreakdown).forEach(([category, value]) => {
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        const catName = category.charAt(0).toUpperCase() + category.slice(1);
        doc.text(`${catName}: ${value.toFixed(2)} tCO₂e`, 25, yPos);
        yPos += 6;
    });
    
    yPos += 5;
    
    // Detailed History Table
    if (logs.length > 0) {
        if (yPos > 200) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Detailed History', 20, yPos);
        yPos += 10;
        
        // Table header
        doc.setFillColor(...lightGray);
        doc.rect(20, yPos - 5, 170, 8, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Date', 22, yPos);
        doc.text('Category', 60, yPos);
        doc.text('CO₂e (t)', 120, yPos);
        doc.text('Notes', 145, yPos);
        yPos += 5;
        
        // Table rows
        doc.setFont('helvetica', 'normal');
        logs.slice(0, 30).forEach((log, index) => { // Limit to 30 entries per page
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
                // Redraw header
                doc.setFillColor(...lightGray);
                doc.rect(20, yPos - 5, 170, 8, 'F');
                doc.setFont('helvetica', 'bold');
                doc.text('Date', 22, yPos);
                doc.text('Category', 60, yPos);
                doc.text('CO₂e (t)', 120, yPos);
                doc.text('Notes', 145, yPos);
                yPos += 5;
            }
            
            const date = log.timestamp ? new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            const category = (log.category || 'other').charAt(0).toUpperCase() + (log.category || 'other').slice(1);
            const co2e = (parseFloat(log.co2e) || 0).toFixed(2);
            const notes = (log.notes || '').substring(0, 30); // Truncate long notes
            
            doc.setFontSize(8);
            doc.text(date, 22, yPos);
            doc.text(category, 60, yPos);
            doc.text(co2e, 120, yPos);
            doc.text(notes, 145, yPos);
            yPos += 6;
        });
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
        doc.text('Carbon Footprint Tracker', 105, 295, { align: 'center' });
    }
    
    // Save PDF
    const filename = `carbon-footprint-report-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    
    showNotification('PDF report generated successfully!', 'success');
}

// Auth Setup
function setupAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const loginModal = document.getElementById('loginModal');
    const signupModal = document.getElementById('signupModal');
    const loginModalClose = document.getElementById('loginModalClose');
    const signupModalClose = document.getElementById('signupModalClose');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const switchToSignup = document.getElementById('switchToSignup');
    const switchToLogin = document.getElementById('switchToLogin');

    // Open login modal
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('login');
        });
    }

    // Open signup modal
    if (signupBtn) {
        signupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('signup');
        });
    }

    // Close modals
    if (loginModalClose) {
        loginModalClose.addEventListener('click', () => {
            closeModal('login');
        });
    }

    if (signupModalClose) {
        signupModalClose.addEventListener('click', () => {
            closeModal('signup');
        });
    }

    // Close modal when clicking outside
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                closeModal('login');
            }
        });
    }

    if (signupModal) {
        signupModal.addEventListener('click', (e) => {
            if (e.target === signupModal) {
                closeModal('signup');
            }
        });
    }

    // Switch between login and signup
    if (switchToSignup) {
        switchToSignup.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('login');
            setTimeout(() => openModal('signup'), 200);
        });
    }

    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('signup');
            setTimeout(() => openModal('login'), 200);
        });
    }

    // Handle form submissions
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            await handleLogin(email, password);
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signupEmail').value;
            const name = document.getElementById('signupName').value;
            const password = document.getElementById('signupPassword').value;
            await handleSignup(email, password, name);
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (loginModal && loginModal.style.display !== 'none') {
                closeModal('login');
            }
            if (signupModal && signupModal.style.display !== 'none') {
                closeModal('signup');
            }
        }
    });

    // Check if user is logged in
    if (api.user) {
        updateAuthUI();
    }
}

// Open Modal
function openModal(type) {
    const modal = document.getElementById(`${type}Modal`);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus on first input
        setTimeout(() => {
            const firstInput = modal.querySelector('.input-field');
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }
}

// Close Modal
function closeModal(type) {
    const modal = document.getElementById(`${type}Modal`);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        // Clear form
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
    }
}

// Handle Login
async function handleLogin(email, password) {
    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const submitBtn = loginForm?.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent || 'Login';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
        }

        const result = await api.login(email, password);
        appState.userData = result.user;
        appState.isPremium = result.user.isPremium || false;
        updateUI();
        updateAuthUI();
        
        closeModal('login');
        showNotification('Login successful! Welcome back!', 'success');
        
        // Load user's data
        updateDashboard();
        
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Login failed. Please check your credentials and try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// Handle Signup
async function handleSignup(email, password, name) {
    if (!email || !name || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    const signupForm = document.getElementById('signupForm');
    const submitBtn = signupForm?.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent || 'Sign Up';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }

        const result = await api.signup(email, password, name);
        appState.userData = result.user;
        appState.isPremium = result.user.isPremium || false;
        updateUI();
        updateAuthUI();
        
        closeModal('signup');
        showNotification('Signup successful! Welcome to Carbon Tracker!', 'success');
        
        // Load user's data
        updateDashboard();
        
    } catch (error) {
        console.error('Signup error:', error);
        showNotification('Signup failed. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// Update Auth UI
function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');

    if (api.user) {
        // User is logged in
        if (loginBtn) {
            loginBtn.textContent = api.user.email || api.user.name || 'Account';
            loginBtn.style.display = 'inline-block';
        }
        if (signupBtn) {
            signupBtn.textContent = 'Logout';
            signupBtn.onclick = async (e) => {
                e.preventDefault();
                await handleLogout();
            };
            signupBtn.className = 'btn-secondary'; // Change to secondary button style
        }
    } else {
        // User is not logged in
        if (loginBtn) {
            loginBtn.textContent = 'Login';
            loginBtn.onclick = (e) => {
                e.preventDefault();
                openModal('login');
            };
        }
        if (signupBtn) {
            signupBtn.textContent = 'Sign Up';
            signupBtn.onclick = (e) => {
                e.preventDefault();
                openModal('signup');
            };
            signupBtn.className = 'btn-primary'; // Primary button style
        }
    }
}

// Handle Logout
async function handleLogout() {
    try {
        await api.logout();
        appState.userData = null;
        appState.isPremium = false;
        updateUI();
        updateAuthUI();
        showNotification('Logged out successfully', 'info');
        
        // Clear dashboard (or keep data, depending on your preference)
        // updateDashboard();
        
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Error during logout', 'error');
    }
}

// Load User Data
async function loadUserData() {
    try {
        const user = await api.getUserProfile();
        if (user) {
            appState.userData = user;
            appState.isPremium = user.isPremium || false;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Update UI
function updateUI() {
    // Update premium badges and gating
    const premiumElements = document.querySelectorAll('.premium-badge');
    premiumElements.forEach(el => {
        if (appState.isPremium || CONFIG.app.demoMode) {
            el.style.display = 'none';
        }
    });

    // Enable/disable premium features
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.disabled = !appState.isPremium && !getConfig().app.demoMode;
    }
}

// Listen for subscription updates
window.addEventListener('subscription-updated', (event) => {
    appState.isPremium = event.detail.isPremium || false;
    updateUI();
});

// Setup Breakdown Forms
function setupBreakdownForms() {
    // Transport form
    const addTransportBtn = document.getElementById('addTransportBtn');
    const transportForm = document.getElementById('transportForm');
    const saveTransportBtn = document.getElementById('saveTransportBtn');
    const cancelTransportBtn = document.getElementById('cancelTransportBtn');
    
    if (addTransportBtn && transportForm) {
        addTransportBtn.addEventListener('click', () => {
            transportForm.style.display = transportForm.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    if (cancelTransportBtn && transportForm) {
        cancelTransportBtn.addEventListener('click', () => {
            transportForm.style.display = 'none';
            document.getElementById('transport-vehicle').value = '';
            document.getElementById('transport-km').value = '';
            document.getElementById('transport-trips').value = '';
            document.getElementById('transport-emissions').value = '';
        });
    }
    
    if (saveTransportBtn) {
        saveTransportBtn.addEventListener('click', () => {
            saveTransportEntry();
        });
    }
    
    // Power form
    const addPowerBtn = document.getElementById('addPowerBtn');
    const powerForm = document.getElementById('powerForm');
    const savePowerBtn = document.getElementById('savePowerBtn');
    const cancelPowerBtn = document.getElementById('cancelPowerBtn');
    
    if (addPowerBtn && powerForm) {
        addPowerBtn.addEventListener('click', () => {
            powerForm.style.display = powerForm.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    if (cancelPowerBtn && powerForm) {
        cancelPowerBtn.addEventListener('click', () => {
            powerForm.style.display = 'none';
            document.getElementById('power-source').value = '';
            document.getElementById('power-kwh').value = '';
            document.getElementById('power-renewable').value = '';
            document.getElementById('power-peak').value = '';
            document.getElementById('power-emissions').value = '';
        });
    }
    
    if (savePowerBtn) {
        savePowerBtn.addEventListener('click', () => {
            savePowerEntry();
        });
    }
    
    // Shopping form
    const addShoppingBtn = document.getElementById('addShoppingBtn');
    const shoppingForm = document.getElementById('shoppingForm');
    const saveShoppingBtn = document.getElementById('saveShoppingBtn');
    const cancelShoppingBtn = document.getElementById('cancelShoppingBtn');
    
    if (addShoppingBtn && shoppingForm) {
        addShoppingBtn.addEventListener('click', () => {
            shoppingForm.style.display = shoppingForm.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    if (cancelShoppingBtn && shoppingForm) {
        cancelShoppingBtn.addEventListener('click', () => {
            shoppingForm.style.display = 'none';
            document.getElementById('shopping-item').value = '';
            document.getElementById('shopping-amount').value = '';
            document.getElementById('shopping-units').value = 'USD';
            document.getElementById('shopping-emissions').value = '';
        });
    }
    
    if (saveShoppingBtn) {
        saveShoppingBtn.addEventListener('click', () => {
            saveShoppingEntry();
        });
    }
    
    // Energy form
    const addEnergyBtn = document.getElementById('addEnergyBtn');
    const energyForm = document.getElementById('energyForm');
    const saveEnergyBtn = document.getElementById('saveEnergyBtn');
    const cancelEnergyBtn = document.getElementById('cancelEnergyBtn');
    
    if (addEnergyBtn && energyForm) {
        addEnergyBtn.addEventListener('click', () => {
            energyForm.style.display = energyForm.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    if (cancelEnergyBtn && energyForm) {
        cancelEnergyBtn.addEventListener('click', () => {
            energyForm.style.display = 'none';
            document.getElementById('energy-type').value = '';
            document.getElementById('energy-amount').value = '';
            document.getElementById('energy-units').value = 'kWh';
            document.getElementById('energy-emissions').value = '';
        });
    }
    
    if (saveEnergyBtn) {
        saveEnergyBtn.addEventListener('click', () => {
            saveEnergyEntry();
        });
    }
}

// Save Transport Entry
function saveTransportEntry() {
    const vehicle = document.getElementById('transport-vehicle').value.trim();
    const km = parseFloat(document.getElementById('transport-km').value) || 0;
    const trips = parseInt(document.getElementById('transport-trips').value) || 0;
    const emissions = parseFloat(document.getElementById('transport-emissions').value) || 0;
    
    if (!vehicle || km <= 0 || emissions <= 0) {
        showNotification('Please fill in all required fields (Vehicle, KM, Emissions)', 'error');
        return;
    }
    
    const breakdown = ensureDetailedBreakdown();
    if (!breakdown.transport.vehicles) {
        breakdown.transport.vehicles = [];
    }
    
    const avgKmPerTrip = trips > 0 ? km / trips : 0;
    const newVehicle = {
        vehicle: vehicle.toLowerCase(),
        total_km: km,
        trips: trips,
        avg_km_per_trip: avgKmPerTrip,
        total_emissions_kg: emissions
    };
    
    breakdown.transport.vehicles.push(newVehicle);
    breakdown.transport.total_km = (breakdown.transport.total_km || 0) + km;
    breakdown.transport.total_emissions_kg = (breakdown.transport.total_emissions_kg || 0) + emissions;
    
    saveDetailedBreakdown(breakdown);
    
    // Hide form and reset
    document.getElementById('transportForm').style.display = 'none';
    document.getElementById('transport-vehicle').value = '';
    document.getElementById('transport-km').value = '';
    document.getElementById('transport-trips').value = '';
    document.getElementById('transport-emissions').value = '';
    
    // Refresh display
    displayHistoryBreakdown({
        entries: [],
        detailed_breakdown: breakdown
    });
    
    showNotification('Transport entry saved successfully!', 'success');
}

// Save Power Entry
function savePowerEntry() {
    const source = document.getElementById('power-source').value.trim();
    const kwh = parseFloat(document.getElementById('power-kwh').value) || 0;
    const renewable = parseInt(document.getElementById('power-renewable').value) || 0;
    const peak = document.getElementById('power-peak').value.trim();
    const emissions = parseFloat(document.getElementById('power-emissions').value) || 0;
    
    if (!source || kwh <= 0 || emissions <= 0) {
        showNotification('Please fill in all required fields (Source, kWh, Emissions)', 'error');
        return;
    }
    
    const breakdown = ensureDetailedBreakdown();
    if (!breakdown.power.sources) {
        breakdown.power.sources = [];
    }
    
    const newSource = {
        source: source,
        usage_kwh: kwh,
        peak_window: peak || 'N/A',
        emissions_kg: emissions,
        renewable_pct: renewable
    };
    
    breakdown.power.sources.push(newSource);
    breakdown.power.total_kwh = (breakdown.power.total_kwh || 0) + kwh;
    breakdown.power.total_emissions_kg = (breakdown.power.total_emissions_kg || 0) + emissions;
    
    saveDetailedBreakdown(breakdown);
    
    // Hide form and reset
    document.getElementById('powerForm').style.display = 'none';
    document.getElementById('power-source').value = '';
    document.getElementById('power-kwh').value = '';
    document.getElementById('power-renewable').value = '';
    document.getElementById('power-peak').value = '';
    document.getElementById('power-emissions').value = '';
    
    // Refresh display
    displayHistoryBreakdown({
        entries: [],
        detailed_breakdown: breakdown
    });
    
    showNotification('Power entry saved successfully!', 'success');
}

// Save Shopping Entry
function saveShoppingEntry() {
    const item = document.getElementById('shopping-item').value.trim();
    const amount = parseFloat(document.getElementById('shopping-amount').value) || 0;
    const units = document.getElementById('shopping-units').value;
    const emissions = parseFloat(document.getElementById('shopping-emissions').value) || 0;
    
    if (!item || amount <= 0 || emissions <= 0) {
        showNotification('Please fill in all required fields (Item, Amount, Emissions)', 'error');
        return;
    }
    
    const breakdown = ensureDetailedBreakdown();
    if (!breakdown.shopping.items) {
        breakdown.shopping.items = [];
    }
    
    const newItem = {
        item: item,
        total_amount: amount,
        units: units,
        total_emissions_kg: emissions
    };
    
    breakdown.shopping.items.push(newItem);
    breakdown.shopping.total_spend = (breakdown.shopping.total_spend || 0) + (units === 'USD' ? amount : 0);
    breakdown.shopping.total_emissions_kg = (breakdown.shopping.total_emissions_kg || 0) + emissions;
    
    saveDetailedBreakdown(breakdown);
    
    // Hide form and reset
    document.getElementById('shoppingForm').style.display = 'none';
    document.getElementById('shopping-item').value = '';
    document.getElementById('shopping-amount').value = '';
    document.getElementById('shopping-units').value = 'USD';
    document.getElementById('shopping-emissions').value = '';
    
    // Refresh display
    displayHistoryBreakdown({
        entries: [],
        detailed_breakdown: breakdown
    });
    
    showNotification('Shopping entry saved successfully!', 'success');
}

// Save Energy Entry
function saveEnergyEntry() {
    const type = document.getElementById('energy-type').value.trim();
    const amount = parseFloat(document.getElementById('energy-amount').value) || 0;
    const units = document.getElementById('energy-units').value;
    const emissions = parseFloat(document.getElementById('energy-emissions').value) || 0;
    
    if (!type || amount <= 0 || emissions <= 0) {
        showNotification('Please fill in all required fields (Type, Amount, Emissions)', 'error');
        return;
    }
    
    const breakdown = ensureDetailedBreakdown();
    if (!breakdown.energy.types) {
        breakdown.energy.types = [];
    }
    
    const newType = {
        type: type,
        total_amount: amount,
        units: units,
        total_emissions_kg: emissions
    };
    
    breakdown.energy.types.push(newType);
    breakdown.energy.total_usage = (breakdown.energy.total_usage || 0) + (units === 'kWh' ? amount : 0);
    breakdown.energy.total_emissions_kg = (breakdown.energy.total_emissions_kg || 0) + emissions;
    
    saveDetailedBreakdown(breakdown);
    
    // Hide form and reset
    document.getElementById('energyForm').style.display = 'none';
    document.getElementById('energy-type').value = '';
    document.getElementById('energy-amount').value = '';
    document.getElementById('energy-units').value = 'kWh';
    document.getElementById('energy-emissions').value = '';
    
    // Refresh display
    displayHistoryBreakdown({
        entries: [],
        detailed_breakdown: breakdown
    });
    
    showNotification('Energy entry saved successfully!', 'success');
}

// History Setup
function setupHistory() {
    const refreshBtn = document.getElementById('refreshHistoryBtn');
    const loadSummaryBtn = document.getElementById('loadSummaryBtn');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            const originalText = refreshBtn.textContent;
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Resetting...';
            try {
                // Reset history - clear all data and set everything to 0
                resetHistory();
                showNotification('History reset successfully! All data cleared.', 'success');
            } catch (error) {
                console.error('Error resetting history:', error);
                showNotification('Error resetting history. Please try again.', 'error');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = originalText;
            }
        });
    }
    
    if (loadSummaryBtn) {
        loadSummaryBtn.addEventListener('click', async () => {
            const originalText = loadSummaryBtn.textContent;
            loadSummaryBtn.disabled = true;
            loadSummaryBtn.textContent = 'Loading...';
            try {
                await loadSummary();
            } catch (error) {
                console.error('Error loading summary:', error);
                showNotification('Error loading summary. Please try again.', 'error');
            } finally {
                loadSummaryBtn.disabled = false;
                loadSummaryBtn.textContent = originalText;
            }
        });
    }
    
    // Load history on page load
    loadHistory();
    
    // Setup breakdown form handlers
    setupBreakdownForms();
}

// Load History
async function loadHistory() {
    try {
        const user_id = api.user?.id || null;
        const config = getConfig();
        const baseUrl = config.api?.baseUrl || 'http://localhost:5000/api';
        
        const params = new URLSearchParams();
        if (user_id) params.append('user_id', user_id);
        
        try {
            const response = await fetch(`${baseUrl}/getHistory?${params.toString()}`);
            const result = await response.json();
            
            if (result.success && result.data && result.data.entries && result.data.entries.length > 0) {
                console.log('Loading history from API:', result.data);
                displayHistoryBreakdown(result.data);
                return;
            } else {
                console.log('API returned no data, falling back to local storage');
            }
        } catch (apiError) {
            console.warn('API call failed, using local storage:', apiError);
        }
        
        // Fallback to local storage - always try this to ensure data is shown
        const logs = api.getCarbonLogs();
        console.log('Loading from local storage, logs count:', logs.length);
        if (logs.length > 0) {
            displayHistoryFromLocalLogs(logs);
        } else {
            displayHistoryBreakdown({
                entries: [],
                detailed_breakdown: ensureDetailedBreakdown(),
            });
        }
    } catch (error) {
        console.error('Error loading history:', error);
        // Fallback to local storage
        const logs = api.getCarbonLogs();
        if (logs.length > 0) {
            displayHistoryFromLocalLogs(logs);
        } else {
            displayHistoryBreakdown({
                entries: [],
                detailed_breakdown: ensureDetailedBreakdown(),
            });
        }
    }
}

// Clear History Breakdown sections
function clearHistoryBreakdown() {
    const sections = [
        'transportBreakdownContent',
        'powerBreakdownContent',
        'shoppingBreakdownContent',
        'energyBreakdownContent'
    ];
    
    sections.forEach(sectionId => {
        const element = document.getElementById(sectionId);
        if (element) {
            element.innerHTML = '<p class="empty-message">No data available. Start logging your activities!</p>';
        }
    });
}

// Reset History - Clear all data and set everything to 0
function resetHistory() {
    // Clear local storage
    localStorage.removeItem('carbonLogs');
    
    // Clear the history table - show empty state with zeros
    const tableBody = document.getElementById('dailyHistoryTableBody');
    const tableHead = document.querySelector('#dailyHistoryTable thead tr');
    
    if (tableBody && tableHead) {
        // Get last 7 days for display
        const now = new Date();
        const displayDates = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            displayDates.push(dateStr);
        }
        
        // Build header
        let headerHTML = '<th>Category</th><th>Total</th>';
        displayDates.forEach(dateStr => {
            const date = new Date(dateStr);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();
            headerHTML += `<th>${dayName} ${dayNum}</th>`;
        });
        tableHead.innerHTML = headerHTML;
        
        // Build table with all zeros
        const categoryMap = {
            'transport': 'Travel',
            'energy': 'Energy',
            'food': 'Food',
            'waste': 'Waste',
            'shopping': 'Shopping',
            'other': 'Others'
        };
        
        const allCategories = ['transport', 'energy', 'food', 'waste', 'shopping', 'other'];
        let tableHTML = '';
        
        allCategories.forEach(cat => {
            const catName = categoryMap[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
            let rowHTML = `<tr>
                <td><strong>${catName}</strong></td>
                <td>0.00</td>`;
            
            displayDates.forEach(() => {
                rowHTML += '<td>0.00</td>';
            });
            
            rowHTML += '</tr>';
            tableHTML += rowHTML;
        });
        
        // Add Total row with zeros
        let totalRowHTML = `<tr class="total-row">
            <td><strong>Total</strong></td>
            <td><strong>0.00</strong></td>`;
        
        displayDates.forEach(() => {
            totalRowHTML += '<td><strong>0.00</strong></td>';
        });
        
        totalRowHTML += '</tr>';
        tableHTML += totalRowHTML;
        
        tableBody.innerHTML = tableHTML;
    }
    
    // Clear breakdown sections
    clearHistoryBreakdown();
    
    // Update dashboard to reflect cleared data
    updateDashboard();
    
    console.log('History reset - all data cleared');
}

// Display Daily History Table
function displayDailyHistoryTable(data) {
    const tableBody = document.getElementById('dailyHistoryTableBody');
    const tableHead = document.querySelector('#dailyHistoryTable thead tr');
    
    if (!tableBody || !tableHead) return;
    
    const entries = data.entries || [];
    
    if (entries.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" class="empty-message">No history data available. Start logging your activities!</td></tr>';
        return;
    }
    
    // Category mapping
    const categoryMap = {
        'transport': 'Travel',
        'energy': 'Energy',
        'food': 'Food',
        'waste': 'Waste',
        'shopping': 'Shopping',
        'other': 'Others'
    };
    
    // Get all unique dates from entries (last 30 days)
    const now = new Date();
    const dates = [];
    const dateSet = new Set();
    
    // Get dates from entries
    entries.forEach(entry => {
        const dateStr = entry.date || (entry.timestamp ? entry.timestamp.split('T')[0] : '');
        if (dateStr && !dateSet.has(dateStr)) {
            dateSet.add(dateStr);
            dates.push(dateStr);
        }
    });
    
    // Add last 30 days if we don't have enough data
    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        if (!dateSet.has(dateStr)) {
            dates.push(dateStr);
        }
    }
    
    // Sort dates
    dates.sort();
    
    // Get last 7 days for display (or all if less than 7)
    const displayDates = dates.slice(-7);
    
    // Build header with day columns
    let headerHTML = '<th>Category</th><th>Total</th>';
    displayDates.forEach(dateStr => {
        const date = new Date(dateStr);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();
        headerHTML += `<th>${dayName} ${dayNum}</th>`;
    });
    tableHead.innerHTML = headerHTML;
    
    // Organize data by category and date
    const categoryData = {};
    const allCategories = ['transport', 'energy', 'food', 'waste', 'shopping', 'other'];
    
    allCategories.forEach(cat => {
        categoryData[cat] = {
            total: 0,
            byDate: {}
        };
        displayDates.forEach(dateStr => {
            categoryData[cat].byDate[dateStr] = 0;
        });
    });
    
    // Process entries
    entries.forEach(entry => {
        const category = entry.category || 'other';
        const dateStr = entry.date || (entry.timestamp ? entry.timestamp.split('T')[0] : '');
        const emissions = parseFloat(entry.emissions_kg) || 0;
        
        if (categoryData[category]) {
            categoryData[category].total += emissions;
            if (dateStr && categoryData[category].byDate[dateStr] !== undefined) {
                categoryData[category].byDate[dateStr] += emissions;
            }
        }
    });
    
    // Build table rows
    let tableHTML = '';
    let grandTotal = 0;
    const grandTotalByDate = {};
    displayDates.forEach(dateStr => {
        grandTotalByDate[dateStr] = 0;
    });
    
    allCategories.forEach(cat => {
        const catName = categoryMap[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
        const data = categoryData[cat];
        grandTotal += data.total;
        
        let rowHTML = `<tr>
            <td><strong>${catName}</strong></td>
            <td>${data.total.toFixed(2)}</td>`;
        
        displayDates.forEach(dateStr => {
            const dayValue = data.byDate[dateStr] || 0;
            grandTotalByDate[dateStr] += dayValue;
            rowHTML += `<td>${dayValue.toFixed(2)}</td>`;
        });
        
        rowHTML += '</tr>';
        tableHTML += rowHTML;
    });
    
    // Add Total row
    let totalRowHTML = `<tr class="total-row">
        <td><strong>Total</strong></td>
        <td><strong>${grandTotal.toFixed(2)}</strong></td>`;
    
    displayDates.forEach(dateStr => {
        totalRowHTML += `<td><strong>${grandTotalByDate[dateStr].toFixed(2)}</strong></td>`;
    });
    
    totalRowHTML += '</tr>';
    tableHTML += totalRowHTML;
    
    tableBody.innerHTML = tableHTML;
}

// Display History Breakdown
function displayHistoryBreakdown(data) {
    // Display daily history table
    displayDailyHistoryTable(data);
    
    const detailed = hasDetailedSections(data.detailed_breakdown) ? data.detailed_breakdown : ensureDetailedBreakdown();
    
    // Transport Breakdown
    const transportContent = document.getElementById('transportBreakdownContent');
    if (transportContent) {
        const transportData = detailed.transport;
        if (transportData && transportData.vehicles && transportData.vehicles.length > 0) {
            let html = `<div class="breakdown-summary">
                <p><strong>Total Distance:</strong> ${formatNumber(transportData.total_km, 1)} km</p>
                <p><strong>Total Emissions:</strong> ${formatNumber(transportData.total_emissions_kg)} kg CO₂e</p>
            </div>
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Vehicle</th>
                        <th>Total KM</th>
                        <th>Trips</th>
                        <th>Avg KM/Trip</th>
                        <th>Emissions (kg CO₂e)</th>
                    </tr>
                </thead>
                <tbody>`;
            
            transportData.vehicles.forEach(vehicle => {
                html += `<tr>
                    <td>${vehicle.vehicle.charAt(0).toUpperCase() + vehicle.vehicle.slice(1)}</td>
                    <td>${formatNumber(vehicle.total_km, 1)}</td>
                    <td>${vehicle.trips}</td>
                    <td>${formatNumber(vehicle.avg_km_per_trip, 1)}</td>
                    <td>${formatNumber(vehicle.total_emissions_kg)}</td>
                </tr>`;
            });
            
            html += `</tbody></table>`;
            transportContent.innerHTML = html;
        } else {
            transportContent.innerHTML = '<p class="empty-message">No transport data available. Start logging your trips!</p>';
        }
    }
    
    // Power Breakdown
    const powerContent = document.getElementById('powerBreakdownContent');
    if (powerContent) {
        const powerData = detailed.power || detailed.food;
        if (powerData && ((powerData.sources && powerData.sources.length > 0) || (powerData.items && powerData.items.length > 0))) {
            if (powerData.sources && powerData.sources.length > 0) {
                let html = `<div class="breakdown-summary">
                    <p><strong>Total Usage:</strong> ${formatNumber(powerData.total_kwh || powerData.total_usage, 1)} kWh</p>
                    <p><strong>Total Emissions:</strong> ${formatNumber(powerData.total_emissions_kg)} kg CO₂e</p>
                </div>
                <table class="breakdown-table">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Usage (kWh)</th>
                            <th>Renewables</th>
                            <th>Emissions (kg CO₂e)</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                powerData.sources.forEach(source => {
                    html += `<tr>
                        <td>${source.source.charAt(0).toUpperCase() + source.source.slice(1)}${source.peak_window ? `<span class="breakdown-meta">Peak: ${source.peak_window}</span>` : ''}</td>
                        <td>${formatNumber(source.usage_kwh || source.total_amount, 1)}</td>
                        <td>${source.renewable_pct !== undefined ? `${source.renewable_pct}%` : '—'}</td>
                        <td>${formatNumber(source.emissions_kg || source.total_emissions_kg)}</td>
                    </tr>`;
                });
                
                html += `</tbody></table>`;
                powerContent.innerHTML = html;
            } else {
                let html = `<div class="breakdown-summary">
                    <p><strong>Total Emissions:</strong> ${formatNumber(powerData.total_emissions_kg)} kg CO₂e</p>
                </div>
                <table class="breakdown-table">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Amount</th>
                            <th>Units</th>
                            <th>Emissions (kg CO₂e)</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                powerData.items.forEach(item => {
                    html += `<tr>
                        <td>${item.item.charAt(0).toUpperCase() + item.item.slice(1)}</td>
                        <td>${formatNumber(item.total_amount, 2)}</td>
                        <td>${item.units}</td>
                        <td>${formatNumber(item.total_emissions_kg)}</td>
                    </tr>`;
                });
                
                html += `</tbody></table>`;
                powerContent.innerHTML = html;
            }
        } else {
            powerContent.innerHTML = '<p class="empty-message">No power data available. Connect a utility bill to get started!</p>';
        }
    }
    
    // Shopping Breakdown
    const shoppingContent = document.getElementById('shoppingBreakdownContent');
    if (shoppingContent) {
        if (detailed.shopping && detailed.shopping.items && detailed.shopping.items.length > 0) {
            let html = `<div class="breakdown-summary">
                <p><strong>Total Spend:</strong> $${formatNumber(detailed.shopping.total_spend || 0, 0)}</p>
                <p><strong>Total Emissions:</strong> ${formatNumber(detailed.shopping.total_emissions_kg)} kg CO₂e</p>
            </div>
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Amount</th>
                        <th>Units</th>
                        <th>Emissions (kg CO₂e)</th>
                    </tr>
                </thead>
                <tbody>`;
            
            detailed.shopping.items.forEach(item => {
                html += `<tr>
                    <td>${item.item.charAt(0).toUpperCase() + item.item.slice(1)}</td>
                    <td>${formatNumber(item.total_amount, item.units === 'USD' ? 0 : 2)}</td>
                    <td>${item.units}</td>
                    <td>${formatNumber(item.total_emissions_kg)}</td>
                </tr>`;
            });
            
            html += `</tbody></table>`;
            shoppingContent.innerHTML = html;
        } else {
            shoppingContent.innerHTML = '<p class="empty-message">No shopping data available. Start logging your purchases!</p>';
        }
    }
    
    // Energy Breakdown
    const energyContent = document.getElementById('energyBreakdownContent');
    if (energyContent) {
        if (detailed.energy && detailed.energy.types && detailed.energy.types.length > 0) {
            let html = `<div class="breakdown-summary">
                <p><strong>Total Usage:</strong> ${formatNumber(detailed.energy.total_usage || 0, 1)} kWh</p>
                <p><strong>Total Emissions:</strong> ${formatNumber(detailed.energy.total_emissions_kg)} kg CO₂e</p>
            </div>
            <table class="breakdown-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Units</th>
                        <th>Emissions (kg CO₂e)</th>
                    </tr>
                </thead>
                <tbody>`;
            
            detailed.energy.types.forEach(type => {
                html += `<tr>
                    <td>${type.type.charAt(0).toUpperCase() + type.type.slice(1)}</td>
                    <td>${formatNumber(type.total_amount, 1)}</td>
                    <td>${type.units}</td>
                    <td>${formatNumber(type.total_emissions_kg)}</td>
                </tr>`;
            });
            
            html += `</tbody></table>`;
            energyContent.innerHTML = html;
        } else {
            energyContent.innerHTML = '<p class="empty-message">No energy data available. Start logging your usage!</p>';
        }
    }
}

// Update History from Storage - Centralized function to ensure history is always updated
function updateHistoryFromStorage() {
    const logs = api.getCarbonLogs();
    console.log('Updating history from storage, logs count:', logs.length);
    
    if (logs.length > 0) {
        displayHistoryFromLocalLogs(logs);
        
        // Force a visual update of the history table
        const tableBody = document.getElementById('dailyHistoryTableBody');
        if (tableBody) {
            // Small visual feedback to show update
            tableBody.style.transition = 'opacity 0.2s ease';
            const originalOpacity = tableBody.style.opacity || '1';
            tableBody.style.opacity = '0.8';
            setTimeout(() => {
                tableBody.style.opacity = originalOpacity;
            }, 200);
        }
    } else {
        displayHistoryBreakdown({
            entries: [],
            detailed_breakdown: ensureDetailedBreakdown(),
        });
    }
}

// Display History from Local Logs (fallback)
function displayHistoryFromLocalLogs(logs) {
    if (!logs || logs.length === 0) {
        console.log('No logs to display');
        const tableBody = document.getElementById('dailyHistoryTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="100%" class="empty-message">No history data available. Start logging your activities!</td></tr>';
        }
        clearHistoryBreakdown();
        return;
    }
    
    // Convert local logs to history format and sort by date (newest first)
    const entries = logs.map(log => {
        const dateStr = log.date || (log.timestamp ? log.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]);
        return {
            category: log.category || 'other',
            date: dateStr,
            timestamp: log.timestamp || log.date || new Date().toISOString(),
            emissions_kg: (log.co2e || 0) * 1000, // Convert tonnes to kg
            subcategory: log.subcategory || 'general',
            amount: log.amount || 0,
            units: log.units || '',
            notes: log.notes || ''
        };
    });
    
    // Sort entries by date (newest first)
    entries.sort((a, b) => {
        const dateA = new Date(a.timestamp || a.date || 0);
        const dateB = new Date(b.timestamp || b.date || 0);
        return dateB - dateA; // Newest first
    });
    
    const historyData = {
        entries: entries,
        detailed_breakdown: ensureDetailedBreakdown()
    };
    
    // Display both the table and breakdown (even if breakdown is empty, it will clear old data)
    displayHistoryBreakdown(historyData);
    console.log('History updated with', entries.length, 'entries');
}

// Load Summary
async function loadSummary() {
    try {
        const user_id = api.user?.id || null;
        const config = getConfig();
        const baseUrl = config.api?.baseUrl || 'http://localhost:5000/api';
        
        const params = new URLSearchParams();
        if (user_id) params.append('user_id', user_id);
        
        try {
            const response = await fetch(`${baseUrl}/summary?${params.toString()}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                // Display summary in a modal or notification
                displaySummary(result.data, result.human_message);
                console.log('Summary data:', result.data);
                return;
            }
        } catch (apiError) {
            console.warn('API summary failed, generating from local data:', apiError);
        }
        
        // Fallback: Generate summary from local storage
        const logs = api.getCarbonLogs();
        if (logs.length > 0) {
            const localSummary = generateLocalSummary(logs);
            displaySummary(localSummary, 'Summary generated from your saved data');
        } else {
            showNotification('No data available to generate summary. Please save some calculations first.', 'info');
        }
    } catch (error) {
        console.error('Error loading summary:', error);
        showNotification('Error loading summary. Please try again.', 'error');
    }
}

// Generate Summary from Local Data
function generateLocalSummary(logs) {
    const totalCo2e = logs.reduce((sum, log) => sum + (parseFloat(log.co2e) || 0), 0);
    const categoryBreakdown = {};
    const dateRange = { earliest: null, latest: null };
    
    logs.forEach(log => {
        const cat = log.category || 'other';
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (parseFloat(log.co2e) || 0);
        
        const logDate = log.timestamp ? new Date(log.timestamp) : (log.date ? new Date(log.date) : null);
        if (logDate) {
            if (!dateRange.earliest || logDate < dateRange.earliest) {
                dateRange.earliest = logDate;
            }
            if (!dateRange.latest || logDate > dateRange.latest) {
                dateRange.latest = logDate;
            }
        }
    });
    
    return {
        total_co2e_tonnes: totalCo2e,
        total_entries: logs.length,
        category_breakdown: categoryBreakdown,
        date_range: dateRange,
        average_daily: dateRange.earliest && dateRange.latest ? 
            totalCo2e / Math.max(1, Math.ceil((dateRange.latest - dateRange.earliest) / (1000 * 60 * 60 * 24))) : 
            totalCo2e
    };
}

// Display Summary
function displaySummary(summaryData, message) {
    const summaryText = `
Carbon Footprint Summary

Total CO₂e: ${summaryData.total_co2e_tonnes?.toFixed(2) || '0.00'} tonnes
Total Entries: ${summaryData.total_entries || 0}
Average Daily: ${summaryData.average_daily?.toFixed(2) || '0.00'} tCO₂e/day

Category Breakdown:
${Object.entries(summaryData.category_breakdown || {})
    .map(([cat, val]) => `  ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${val.toFixed(2)} tCO₂e`)
    .join('\n')}

${message || ''}
    `.trim();
    
    // Create a modal or use alert for now
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'display: flex; position: fixed; z-index: 10000;';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>📊 Carbon Footprint Summary</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <pre style="white-space: pre-wrap; font-family: inherit; background: var(--bg-secondary); padding: 1rem; border-radius: 8px; line-height: 1.6;">${summaryText}</pre>
            </div>
            <div class="modal-actions" style="padding: 1rem; text-align: right;">
                <button class="btn-primary" onclick="this.closest('.modal').remove()">Close</button>
            </div>
        </div>
    `;
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Close on Escape
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
            document.body.style.overflow = '';
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Remove overflow when modal is closed
    modal.querySelector('.modal-close').addEventListener('click', () => {
        document.body.style.overflow = '';
    });
    modal.querySelector('.btn-primary').addEventListener('click', () => {
        document.body.style.overflow = '';
    });
}

// Tasks Setup
function setupTasks() {
    const refreshTasksBtn = document.getElementById('refreshTasksBtn');
    const setGoalBtn = document.getElementById('setGoalBtn');
    const setGoalSubmitBtn = document.getElementById('setGoalSubmitBtn');
    
    if (refreshTasksBtn) {
        refreshTasksBtn.addEventListener('click', () => {
            loadTasks(false); // Show cached tasks (same tasks)
        });
    }
    
    if (setGoalBtn) {
        setGoalBtn.addEventListener('click', () => {
            const goalCard = document.getElementById('goalCard');
            if (goalCard) {
                goalCard.style.display = goalCard.style.display === 'none' ? 'block' : 'none';
            }
        });
    }
    
    if (setGoalSubmitBtn) {
        setGoalSubmitBtn.addEventListener('click', () => {
            setGoal();
        });
    }
    
    // Load tasks on page load (use cached if available)
    loadTasks(false);
}

// Store tasks in app state
if (!appState.cachedTasks) {
    appState.cachedTasks = null;
}

// Load Tasks - Predefined tasks in random order
async function loadTasks(regenerate = false) {
    // Predefined tasks as requested
    const predefinedTasks = [
        {
            id: 'task_transport_no_car_day',
            category: 'transport',
            title: 'Try a "No Car Day" once per week',
            description: 'Choose one day per week to avoid using your car. Walk, cycle, or use public transport instead.',
            impact: 'Potential reduction: ~2-5 kg CO₂e per month',
            difficulty: 'easy',
            estimated_savings_kg: 3.5
        },
        {
            id: 'task_transport_carpool',
            category: 'transport',
            title: 'Carpool with friends, family, or coworkers',
            description: 'Share rides with others going to the same destination. Reduces emissions per person significantly.',
            impact: 'Potential reduction: ~3-8 kg CO₂e per month',
            difficulty: 'medium',
            estimated_savings_kg: 5.5
        },
        {
            id: 'task_energy_cold_water',
            category: 'energy',
            title: 'Wash clothes in cold water and line-dry instead of using a dryer',
            description: 'Use cold water for laundry and air-dry your clothes. Reduces energy consumption for heating and drying.',
            impact: 'Potential reduction: ~1-3 kg CO₂e per month',
            difficulty: 'easy',
            estimated_savings_kg: 2.0
        },
        {
            id: 'task_energy_ac_limit',
            category: 'energy',
            title: 'Limit AC use to 26°C or higher',
            description: 'Set your air conditioner to 26°C or higher. Every degree higher saves energy and reduces emissions.',
            impact: 'Potential reduction: ~2-4 kg CO₂e per month',
            difficulty: 'easy',
            estimated_savings_kg: 3.0
        },
        {
            id: 'task_energy_leaks',
            category: 'energy',
            title: 'Check for leaks in taps (wasted water = wasted energy)',
            description: 'Fix leaky taps and pipes. Wasted water means wasted energy used to pump and heat water.',
            impact: 'Potential reduction: ~0.5-1 kg CO₂e per month',
            difficulty: 'easy',
            estimated_savings_kg: 0.75
        },
        {
            id: 'task_food_plant_based',
            category: 'food',
            title: 'Have at least 2 plant-based meals per week',
            description: 'Replace 2 meat meals per week with plant-based alternatives. Beans, lentils, and vegetables have much lower emissions.',
            impact: 'Potential reduction: ~2-4 kg CO₂e per month',
            difficulty: 'easy',
            estimated_savings_kg: 3.0
        },
        {
            id: 'task_food_local',
            category: 'food',
            title: 'Buy local fruits & vegetables (reduces transport emissions)',
            description: 'Choose locally grown produce to reduce transportation emissions from shipping long distances.',
            impact: 'Potential reduction: ~1-2 kg CO₂e per month',
            difficulty: 'easy',
            estimated_savings_kg: 1.5
        },
        {
            id: 'task_food_no_waste',
            category: 'food',
            title: 'Avoid wasting food - use leftovers creatively',
            description: 'Plan meals, use leftovers, and compost food scraps. Food waste contributes significantly to emissions.',
            impact: 'Potential reduction: ~3-5 kg CO₂e per month',
            difficulty: 'medium',
            estimated_savings_kg: 4.0
        }
    ];
    
    // If we have cached tasks and not regenerating, use cached
    if (appState.cachedTasks && !regenerate) {
        displayTasks(appState.cachedTasks);
        return;
    }
    
    // Shuffle tasks randomly
    const shuffledTasks = [...predefinedTasks].sort(() => Math.random() - 0.5);
    
    // Calculate total potential savings
    const totalPotentialSavings = shuffledTasks.reduce((sum, task) => sum + (task.estimated_savings_kg || 0), 0);
    
    const tasksData = {
        tasks: shuffledTasks,
        total_tasks: shuffledTasks.length,
        total_potential_savings_kg: totalPotentialSavings,
        by_category: {
            transport: shuffledTasks.filter(t => t.category === 'transport'),
            energy: shuffledTasks.filter(t => t.category === 'energy'),
            food: shuffledTasks.filter(t => t.category === 'food'),
            shopping: [],
            general: []
        }
    };
    
    // Cache the tasks
    appState.cachedTasks = tasksData;
    displayTasks(tasksData);
}

// Display Tasks
function displayTasks(data) {
    const tasksGrid = document.getElementById('tasksGrid');
    const tasksSummary = document.getElementById('tasksSummary');
    const totalSavings = document.getElementById('totalPotentialSavings');
    
    if (!tasksGrid) return;
    
    if (totalSavings && data.total_potential_savings_kg !== undefined) {
        totalSavings.textContent = data.total_potential_savings_kg.toFixed(2);
        if (tasksSummary) tasksSummary.style.display = 'block';
    }
    
    if (!data.tasks || data.tasks.length === 0) {
        tasksGrid.innerHTML = '<p class="empty-message">No tasks available. Start logging activities to get personalized challenges!</p>';
        return;
    }
    
    let html = '';
    data.tasks.forEach(task => {
        const difficultyColors = {
            'easy': '#10b981',
            'medium': '#f59e0b',
            'hard': '#ef4444'
        };
        const difficultyColor = difficultyColors[task.difficulty] || '#6c757d';
        
        html += `
            <div class="task-card">
                <div class="task-header">
                    <h4>${task.title}</h4>
                    <span class="task-difficulty" style="background: ${difficultyColor}20; color: ${difficultyColor}; border: 1px solid ${difficultyColor};">
                        ${task.difficulty}
                    </span>
                </div>
                <p class="task-description">${task.description}</p>
                <div class="task-footer">
                    <div class="task-impact">
                        <strong>💡 Impact:</strong> ${task.impact}
                    </div>
                    ${task.estimated_savings_kg > 0 ? `
                        <div class="task-savings">
                            <strong>Potential Savings:</strong> ${task.estimated_savings_kg.toFixed(2)} kg CO₂e
                        </div>
                    ` : ''}
                    <span class="task-category">${task.category}</span>
                </div>
            </div>
        `;
    });
    
    tasksGrid.innerHTML = html;
}


