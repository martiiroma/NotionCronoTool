"""NotionCronoTool local web server.

Serves the stopwatch page and small JSON endpoints that the page calls.
"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template

from notion_api import NotionError, get_data_source_name
from plan_config import get_ui_config

# Load NOTION_TOKEN and the data source IDs from the .env file.
load_dotenv()

app = Flask(__name__)


@app.route("/")
def home():
    """Show the stopwatch page."""
    return render_template("index.html")


@app.route("/api/config")
def config():
    """Give the page its settings from plan.toml (blocks, limit, messages)."""
    return jsonify(get_ui_config())


@app.route("/api/status")
def notion_status():
    """Tell the page whether the connection to ⏱ Sessions works."""
    try:
        name = get_data_source_name(os.getenv("NOTION_SESSIONS_DS_ID"))
        return jsonify(connected=True, message=f"Connectat a {name}")
    except NotionError as error:
        return jsonify(connected=False, message=f"No connectat: {error}")


if __name__ == "__main__":
    # Only reachable from this computer (localhost).
    app.run(host="127.0.0.1", port=5000, debug=True)
