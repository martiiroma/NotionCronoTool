"""Read the user's settings from config/plan.toml."""

import tomllib
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config" / "plan.toml"


def load_plan() -> dict:
    """Read plan.toml and return its contents as a dictionary.

    The file is read on every call, so edits apply without restarting the server.
    """
    with CONFIG_PATH.open("rb") as file:
        return tomllib.load(file)


def get_ui_config() -> dict:
    """Return only the settings that the web page needs."""
    settings = load_plan()["app"]
    return {
        "title": settings["title"],
        "blocks": settings["blocks"],
        "limitMinutes": settings["session_limit_minutes"],
        "limitMessage": settings["limit_message"],
        "backgroundVideo": settings.get("background_video", ""),
    }
