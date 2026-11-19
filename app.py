"""NotionCronoTool local web server.

Phase 0: the home page only checks that the app can read the
⏱ Sessions data source in Notion.
"""

import os

from dotenv import load_dotenv
from flask import Flask
from markupsafe import escape

from notion_api import NotionError, get_data_source_name

# Load NOTION_TOKEN and the data source IDs from the .env file.
load_dotenv()

app = Flask(__name__)


@app.route("/")
def home():
    """Show whether the connection to ⏱ Sessions works."""
    try:
        name = get_data_source_name(os.getenv("NOTION_SESSIONS_DS_ID"))
        message = f"Connectat a {name}"
    except NotionError as error:
        message = f"No connectat: {error}"
    return f"<!doctype html><meta charset='utf-8'><title>NotionCronoTool</title><h1>{escape(message)}</h1>"


if __name__ == "__main__":
    # Only reachable from this computer (localhost).
    app.run(host="127.0.0.1", port=5000, debug=True)
