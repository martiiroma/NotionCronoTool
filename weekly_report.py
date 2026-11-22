"""Planned versus actual hours for one week (Monday to Sunday).

Planned hours come from config/plan.toml; actual hours are the sum of the
"Hores" formula of every row of ⏱ Sessions that starts in the week.
"""

import os
from collections import Counter
from datetime import date, datetime, time, timedelta

from notion_api import list_week_sessions
from plan_config import get_groups, get_week_plan

OTHERS_GROUP = "Altres"
MONTHS = ["gen.", "febr.", "març", "abr.", "maig", "juny", "jul.", "ag.", "set.", "oct.", "nov.", "des."]


def monday_of(day: date) -> date:
    """The Monday of the week that contains this day."""
    return day - timedelta(days=day.weekday())


def build_week_report(any_day: date) -> dict:
    """Everything the weekly view needs, for the week that contains any_day."""
    monday = monday_of(any_day)
    next_monday = monday + timedelta(days=7)
    is_special, planned = get_week_plan(monday)

    data = list_week_sessions(
        os.getenv("NOTION_SESSIONS_DS_ID"), _local_midnight(monday), _local_midnight(next_monday)
    )
    actual, feelings, incomplete = _sum_sessions(data["sessions"])
    blocks = _all_blocks(data["blocks"], planned, actual)

    return {
        "start": monday.isoformat(),
        "previousStart": (monday - timedelta(days=7)).isoformat(),
        "nextStart": next_monday.isoformat(),
        "isCurrentWeek": monday == monday_of(date.today()),
        "rangeLabel": _range_label(monday, next_monday - timedelta(days=1)),
        "weekType": "Setmana especial" if is_special else "Setmana tipus",
        "groups": _build_groups(blocks, planned, actual, feelings),
        "incompleteRows": incomplete,
    }


def _local_midnight(day: date) -> datetime:
    """Midnight at the start of a day, with this computer's time zone."""
    return datetime.combine(day, time.min).astimezone()


def _sum_sessions(sessions: list[dict]) -> tuple[dict, dict, int]:
    """Add up the hours and count the feelings per block.

    Rows without a block or without hours (e.g. a manual row not finished)
    are not added; they are counted so the view can mention them.
    """
    actual: dict[str, float] = {}
    feelings: dict[str, Counter] = {}
    incomplete = 0
    for session in sessions:
        block, hours = session["block"], session["hours"]
        if not block or hours is None:
            incomplete += 1
            continue
        actual[block] = actual.get(block, 0) + hours
        if session["feeling"]:
            feelings.setdefault(block, Counter())[session["feeling"]] += 1
    return actual, feelings, incomplete


def _all_blocks(notion_blocks: list[str], planned: dict, actual: dict) -> list[str]:
    """Notion's blocks in Notion's order, then any other block found in the plan or the rows."""
    blocks = list(notion_blocks)
    for block in [*planned, *actual]:
        if block not in blocks:
            blocks.append(block)
    return blocks


def _build_groups(blocks: list[str], planned: dict, actual: dict, feelings: dict) -> list[dict]:
    """Groups in this order: those of plan.toml (PM, Dades), then "Altres"."""
    config_groups = get_groups()
    grouped = {block for group in config_groups.values() for block in group["blocks"]}

    groups = []
    for name, group in config_groups.items():
        members = [block for block in blocks if block in group["blocks"]]
        groups.append(_group(name, group.get("floor"), members, planned, actual, feelings))
    others = [block for block in blocks if block not in grouped]
    groups.append(_group(OTHERS_GROUP, None, others, planned, actual, feelings))
    return groups


def _group(name, floor, members, planned, actual, feelings) -> dict:
    rows = [_block_row(block, planned, actual, feelings) for block in members]
    return {
        "name": name,
        "floor": floor,
        "planned": round(sum(row["planned"] for row in rows), 2),
        "actual": round(sum(row["actual"] for row in rows), 2),
        "blocks": rows,
    }


def _block_row(block, planned, actual, feelings) -> dict:
    planned_hours = planned.get(block, 0)
    actual_hours = round(actual.get(block, 0), 2)
    return {
        "block": block,
        "planned": planned_hours,
        "actual": actual_hours,
        "diff": round(actual_hours - planned_hours, 2),
        "unplanned": block not in planned,
        "feeling": most_frequent_feeling(feelings.get(block)),
    }


def most_frequent_feeling(counts: Counter | None) -> str:
    """The feeling chosen most often; if two or more tie, all of them ("Plaer i Neutre")."""
    if not counts:
        return ""
    top = max(counts.values())
    winners = [feeling for feeling, count in counts.items() if count == top]
    return " i ".join(winners)


def _range_label(first: date, last: date) -> str:
    """'23–29 nov. 2026', or '30 nov. – 6 des. 2026' when the week spans two months."""
    if first.month == last.month:
        return f"{first.day}–{last.day} {MONTHS[last.month - 1]} {last.year}"
    first_part = f"{first.day} {MONTHS[first.month - 1]}"
    if first.year != last.year:
        first_part += f" {first.year}"
    return f"{first_part} – {last.day} {MONTHS[last.month - 1]} {last.year}"
