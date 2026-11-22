"""Read the user's settings from config/plan.toml."""

import tomllib
from datetime import date
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config" / "plan.toml"
DEFAULT_WEEK = "default"


def load_plan() -> dict:
    """Read plan.toml and return its contents as a dictionary.

    The file is read on every call, so edits apply without restarting the server.
    """
    with CONFIG_PATH.open("rb") as file:
        return tomllib.load(file)


def get_ui_config() -> dict:
    """Return only the settings that the web page needs."""
    plan = load_plan()
    settings = plan["app"]
    return {
        "title": settings["title"],
        "limitMinutes": settings["session_limit_minutes"],
        "limitMessage": settings["limit_message"],
        "backgroundVideo": settings.get("background_video", ""),
        # Used only if Notion cannot be reached the very first time.
        "fallbackBlocks": list(plan["weeks"][DEFAULT_WEEK].keys()),
    }


def get_week_plan(monday: date) -> tuple[bool, dict[str, float]]:
    """Return (is it a special week?, planned hours per block) for a week."""
    weeks = load_plan()["weeks"]
    key = monday.isoformat()
    if key in weeks:
        return True, weeks[key]
    return False, weeks[DEFAULT_WEEK]


def get_groups() -> dict[str, dict]:
    """Return the groups, e.g. {"PM": {"blocks": [...], "floor": 10}}."""
    return load_plan().get("groups", {})
