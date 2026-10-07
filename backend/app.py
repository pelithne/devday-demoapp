import json
import os
from pathlib import Path
import sqlite3
from uuid import UUID

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException


def create_app(database_path=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 1024
    database = Path(database_path or os.environ.get("DATABASE_PATH", "/data/votes.db"))
    topics = json.loads(Path(__file__).with_name("topics.json").read_text())
    topic_ids = {topic["id"] for topic in topics}
    release = os.environ.get("RELEASE_VERSION", "local")
    database.parent.mkdir(parents=True, exist_ok=True)

    def connect():
        connection = sqlite3.connect(database, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    connection = connect()
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute(
            """CREATE TABLE IF NOT EXISTS votes (
                voter_id TEXT PRIMARY KEY,
                topic_id TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )"""
        )
        connection.commit()
    finally:
        connection.close()

    def state():
        connection = connect()
        try:
            rows = connection.execute(
                "SELECT topic_id, COUNT(*) AS votes FROM votes GROUP BY topic_id"
            ).fetchall()
            last_vote = connection.execute("SELECT MAX(updated_at) FROM votes").fetchone()[0]
        finally:
            connection.close()
        counts = {row["topic_id"]: row["votes"] for row in rows}
        return {
            "topics": [{**topic, "votes": counts.get(topic["id"], 0)} for topic in topics],
            "totalVotes": sum(counts.get(topic_id, 0) for topic_id in topic_ids),
            "lastVoteAt": last_vote,
            "release": release,
        }

    @app.after_request
    def response_headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(sqlite3.Error)
    def database_error(error):
        app.logger.exception("Vote database operation failed")
        return jsonify(error="The vote store is temporarily unavailable. Please try again."), 503

    @app.get("/healthz")
    def health():
        return jsonify(status="ok")

    @app.get("/readyz")
    def ready():
        connection = connect()
        try:
            connection.execute("SELECT 1 FROM votes LIMIT 1").fetchone()
        finally:
            connection.close()
        return jsonify(status="ready")

    @app.get("/api/state")
    def get_state():
        return jsonify(state())

    @app.post("/api/votes")
    def vote():
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(error="Send an object with voterId and topicId."), 400
        voter_id = data.get("voterId")
        topic_id = data.get("topicId")
        if not isinstance(voter_id, str):
            return jsonify(error="voterId must be a UUID."), 400
        try:
            voter_id = str(UUID(voter_id))
        except ValueError:
            return jsonify(error="voterId must be a UUID."), 400
        if not isinstance(topic_id, str) or topic_id not in topic_ids:
            return jsonify(error="Choose one of the current topics."), 400
        connection = connect()
        try:
            with connection:
                connection.execute(
                    """INSERT INTO votes (voter_id, topic_id) VALUES (?, ?)
                    ON CONFLICT(voter_id) DO UPDATE SET
                        topic_id=excluded.topic_id,
                        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')""",
                    (voter_id, topic_id),
                )
        finally:
            connection.close()
        return jsonify(state())

    return app
