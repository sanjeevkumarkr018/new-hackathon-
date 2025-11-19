"""
Tokenization backend for Carbon Footprint Tracker.

Features:
    - Earn tokens when users save carbon emissions.
    - Track daily / weekly / monthly / lifetime totals.
    - Persist token history with anti-cheat validation.
    - Serve leaderboards and achievement progress.
    - Ready for JWT-based authentication hooks.
"""

from datetime import datetime, timedelta, date
from typing import Dict, Any

from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///tokens.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

TOKENS_PER_KG = 10
MAX_SAVINGS_PER_DAY = 1000  # kg, anti-cheat guard


class TokenLedger(db.Model):
    __tablename__ = "token_ledger"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(64), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    carbon_saved_kg = db.Column(db.Float, nullable=False)
    tokens_earned = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class LeaderboardEntry(db.Model):
    __tablename__ = "token_leaderboard"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(64), unique=True)
    display_name = db.Column(db.String(120), default="Eco Hero")
    lifetime_tokens = db.Column(db.Float, default=0)


class Achievement(db.Model):
    __tablename__ = "token_achievements"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(64), index=True, nullable=False)
    badge = db.Column(db.String(64), nullable=False)
    unlocked_on = db.Column(db.DateTime, default=datetime.utcnow)


def parse_user_id(payload: Dict[str, Any] | None = None) -> str:
    payload = payload or request.get_json(silent=True) or {}
    user_id = (
        request.headers.get("X-User-Id")
        or request.args.get("user_id")
        or payload.get("user_id")
    )
    if not user_id:
        raise ValueError("Missing user identifier.")
    return user_id


def validate_savings(carbon_saved_kg: float) -> None:
    if carbon_saved_kg < 0:
        raise ValueError("Carbon saved must be positive.")
    if carbon_saved_kg > MAX_SAVINGS_PER_DAY:
        raise ValueError("Reported savings exceed realistic thresholds.")


def summarize_tokens(user_id: str) -> Dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=6)
    month_start = today.replace(day=1)

    def aggregate(start: date | None = None) -> float:
        query = TokenLedger.query.filter_by(user_id=user_id)
        if start:
            query = query.filter(TokenLedger.date >= start)
        return sum(entry.tokens_earned for entry in query.all())

    return {
        "today": aggregate(today),
        "week": aggregate(week_start),
        "month": aggregate(month_start),
        "lifetime": aggregate(),
    }


def update_leaderboard(user_id: str, tokens_delta: float) -> None:
    entry = LeaderboardEntry.query.filter_by(user_id=user_id).first()
    if not entry:
        entry = LeaderboardEntry(user_id=user_id)
        db.session.add(entry)
    entry.lifetime_tokens += tokens_delta
    db.session.commit()


def check_achievements(user_id: str, lifetime_tokens: float) -> list[str]:
    badges = [
        ("green_starter", 100),
        ("eco_warrior", 1000),
        ("zero_carbon_hero", 10000),
    ]
    unlocked = []
    existing = {a.badge for a in Achievement.query.filter_by(user_id=user_id)}
    for badge, threshold in badges:
        if lifetime_tokens >= threshold and badge not in existing:
            db.session.add(Achievement(user_id=user_id, badge=badge))
            unlocked.append(badge)
    if unlocked:
        db.session.commit()
    return unlocked


@app.route("/earn-tokens", methods=["POST"])
def earn_tokens():
    payload = request.get_json(force=True)
    try:
        user_id = parse_user_id(payload)
        carbon_saved_kg = float(payload.get("carbon_saved_kg", 0))
        validate_savings(carbon_saved_kg)
    except (ValueError, TypeError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    tokens = round(carbon_saved_kg * TOKENS_PER_KG, 2)
    today = date.today()

    ledger_entry = TokenLedger(
        user_id=user_id,
        date=today,
        carbon_saved_kg=carbon_saved_kg,
        tokens_earned=tokens,
    )
    db.session.add(ledger_entry)
    db.session.commit()

    update_leaderboard(user_id, tokens)
    summary = summarize_tokens(user_id)
    unlocked = check_achievements(user_id, summary["lifetime"])

    return jsonify({
        "success": True,
        "tokens_earned": tokens,
        "carbon_saved_kg": carbon_saved_kg,
        "totals": summary,
        "unlocked": unlocked,
    })


@app.route("/get-tokens", methods=["GET"])
def get_tokens():
    try:
        user_id = parse_user_id()
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    history = (
        TokenLedger.query.filter_by(user_id=user_id)
        .order_by(TokenLedger.created_at.desc())
        .limit(50)
        .all()
    )
    summary = summarize_tokens(user_id)
    return jsonify({
        "success": True,
        "totals": summary,
        "history": [
            {
                "date": entry.date.isoformat(),
                "carbon_saved_kg": entry.carbon_saved_kg,
                "tokens_earned": entry.tokens_earned,
            }
            for entry in history
        ],
    })


@app.route("/leaderboard", methods=["GET"])
def leaderboard():
    top_entries = (
        LeaderboardEntry.query.order_by(LeaderboardEntry.lifetime_tokens.desc())
        .limit(20)
        .all()
    )
    return jsonify({
        "success": True,
        "leaders": [
            {
                "user_id": entry.user_id,
                "display_name": entry.display_name,
                "lifetime_tokens": entry.lifetime_tokens,
            }
            for entry in top_entries
        ],
    })


@app.route("/achievements", methods=["GET"])
def achievements():
    try:
        user_id = parse_user_id()
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    unlocked = Achievement.query.filter_by(user_id=user_id).all()
    return jsonify({
        "success": True,
        "achievements": [
            {"badge": entry.badge, "unlocked_on": entry.unlocked_on.isoformat()}
            for entry in unlocked
        ],
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=7000)

