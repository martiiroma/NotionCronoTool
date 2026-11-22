"""NotionCronoTool local web server.

Serves the stopwatch page and small JSON endpoints that the page calls.
"""

import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from notion_api import NotionError, list_open_tasks
from plan_config import get_ui_config
from session_sender import check_sessions, count_queued, flush_queue, send_session, validate_session
from weekly_report import build_week_report

# Load NOTION_TOKEN and the data source IDs from the .env file.
load_dotenv()

app = Flask(__name__)


@app.route("/")
def home():
    """Show the stopwatch page."""
    return render_template("index.html")


@app.route("/api/config")
def config():
    """Give the page its settings from plan.toml (limit, messages, video)."""
    return jsonify(get_ui_config())


@app.route("/api/status")
def notion_status():
    """Tell the page whether ⏱ Sessions is reachable and well formed, and give its blocks."""
    queued = count_queued()
    try:
        name, problems, blocks = check_sessions([])
    except NotionError as error:
        return jsonify(connected=False, message=f"No connectat: {error}", queued=queued, blocks=[])
    if problems:
        message = f"{name}: no s'hi enviarà res fins que ho arreglis a Notion: " + "; ".join(problems) + "."
        return jsonify(connected=False, message=message, queued=queued, blocks=blocks)
    return jsonify(connected=True, message=f"Connectat a {name}", queued=queued, blocks=blocks)


@app.route("/api/tasks")
def tasks():
    """List the open tasks of ✅ Tasques, for the task selector."""
    try:
        return jsonify(ok=True, tasks=list_open_tasks(os.getenv("NOTION_TASKS_DS_ID")))
    except NotionError as error:
        return jsonify(ok=False, message=str(error)), 502


@app.route("/api/week")
def week():
    """Planned vs actual hours for the week that contains ?start=YYYY-MM-DD (default: today)."""
    try:
        day = date.fromisoformat(request.args.get("start", "")) if request.args.get("start") else date.today()
    except ValueError:
        return jsonify(ok=False, message="La data de la setmana no és vàlida."), 400
    try:
        return jsonify(ok=True, week=build_week_report(day))
    except NotionError as error:
        return jsonify(ok=False, message=str(error)), 502


@app.post("/api/sessions")
def create_session():
    """Receive a finished session from the page and send it to Notion."""
    try:
        session = validate_session(request.get_json(silent=True))
    except ValueError as error:
        return jsonify(ok=False, message=str(error)), 400
    try:
        result = send_session(session)
    except NotionError as error:
        return jsonify(ok=False, message=str(error)), 502
    return jsonify(ok=True, result=result, queued=count_queued())


@app.post("/api/queue/flush")
def retry_queue():
    """Try again to send the sessions that are waiting in the local queue."""
    return jsonify(queued=flush_queue())


if __name__ == "__main__":
    # Only reachable from this computer (localhost).
    app.run(host="127.0.0.1", port=5000, debug=True)
