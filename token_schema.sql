-- SQL schema for tokenization subsystem

CREATE TABLE IF NOT EXISTS token_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    carbon_saved_kg REAL NOT NULL,
    tokens_earned REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_user_date
    ON token_ledger (user_id, date);

CREATE TABLE IF NOT EXISTS token_leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    display_name TEXT DEFAULT 'Eco Hero',
    lifetime_tokens REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS token_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge TEXT NOT NULL,
    unlocked_on DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_achievements_user
    ON token_achievements (user_id);

