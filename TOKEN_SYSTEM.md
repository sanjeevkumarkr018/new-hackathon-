# Token & Achievement System – Integration Guide

This document explains how to wire the new Impact Token features into the existing Carbon Footprint Tracker (CFT) stack.

## Frontend

### Components
* `index.html`
  * Adds the **Impact Tokens** section with KPI cards, charts, history list, leaderboard, achievements, and a redemption placeholder.
* `styles.css`
  * Introduces glassmorphism-friendly styles, progress bars, history cards, and responsive tweaks.
* `app.js`
  * Defines a `tokenSystem` singleton that:
    * Calculates token payouts when footprint entries show a reduction vs. the previous log.
    * Manages streaks, achievements, motivational copy, and leaderboards.
    * Renders animated coin drops and Chart.js visualizations.
    * Stores token totals and history in `localStorage` so the UI works offline/demo-mode.

### Integration Steps
1. Ensure `Chart.js` is loaded before `app.js` (already done via CDN include).
2. The calculator already calls `tokenSystem.recordCalculation` after saving each aggregate log.
3. To hook into backend data, replace calls to `tokenSystem.recordCalculation` with responses from the new `/earn-tokens` API, or hydrate `tokenSystem` with remote history during initialization.

## Backend

### Files
* `token_api.py` – Flask microservice with endpoints:
  * `POST /earn-tokens`
  * `GET /get-tokens`
  * `GET /leaderboard`
  * `GET /achievements`
  * `GET /health`
* `token_schema.sql` – SQL schema (SQLite/MySQL/Postgres compatible).
* `token_sample.json` – Example payload for testing clients.

### Running the service
```bash
python -m venv .venv && source .venv/bin/activate
pip install flask flask_sqlalchemy
python token_api.py  # starts on http://localhost:7000
```

### Recommended Deployment
1. Drop `token_api.py` into your backend repo or convert it to a Blueprint/Django app.
2. Replace the SQLite URI with your production database.
3. Hook the endpoints behind your existing JWT middleware (the helper `parse_user_id` is a placeholder where you can decode/verify tokens).
4. Schedule a daily task to snapshot leaders if you want weekly prizes.

## Database Schema Highlights
```sql
token_ledger      -- per-entry history (date, carbon_saved_kg, tokens)
token_leaderboard -- aggregates for fast leaderboard reads
token_achievements-- unlocked badge tracking
```

## Example Workflow
1. User logs a new activity → frontend posts reduction to `/earn-tokens`.
2. Backend validates savings, awards tokens, persists history.
3. Response updates UI (totals, history, achievements).
4. Leaderboard endpoint populates the “Top community impact” card.

## Anti-Cheat
* Server rejects negative savings and anything > 1000 kg/day.
* Extend validation by comparing with baseline energy audits or IoT data when available.

## Redeem Placeholder
The token section includes a disabled “Redeem” button. Replace the click handler in `setupTokenSystem()` with your redemption flow once rewards are finalized.

