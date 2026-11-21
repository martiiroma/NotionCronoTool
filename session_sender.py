"""Send finished sessions to Notion, with a local queue for when Notion is down.

If Notion does not answer, the session is saved in data/queue.json and sent
again later (the page asks for it every few minutes and when it opens).
"""

import json
import os
import re
import threading
from pathlib import Path

from notion_api import (
    FEELINGS,
    NotionError,
    NotionUnavailableError,
    create_session_page,
    find_schema_problems,
    get_data_source,
    get_data_source_name,
)

QUEUE_PATH = Path(__file__).parent / "data" / "queue.json"
MAX_NOTE_LENGTH = 5000

# A Notion id: 32 hexadecimal characters, with or without dashes.
NOTION_ID_PATTERN = re.compile(r"^[0-9a-fA-F]{8}-?([0-9a-fA-F]{4}-?){3}[0-9a-fA-F]{12}$")

# The server can handle two requests at once; this stops two of them
# from sending the queue at the same time (which would create duplicates).
_queue_lock = threading.Lock()


# ---------- Checking what the page sends ----------


def validate_session(payload, blocks: list[str]) -> dict:
    """Check the data sent by the page. Raises ValueError with a Catalan message."""
    if not isinstance(payload, dict):
        raise ValueError("Les dades de la sessió no són correctes.")

    block = payload.get("block")
    if block not in blocks:
        raise ValueError("El bloc de la sessió no és vàlid.")

    started_at = payload.get("startedAt")
    ended_at = payload.get("endedAt")
    if not (_is_number(started_at) and _is_number(ended_at) and ended_at > started_at):
        raise ValueError("Les hores de la sessió no són vàlides.")

    pause_minutes = payload.get("pauseMinutes", 0)
    if not _is_number(pause_minutes) or pause_minutes < 0:
        raise ValueError("Els minuts de pausa no són vàlids.")

    feeling = payload.get("feeling") or ""
    if feeling and feeling not in FEELINGS:
        raise ValueError("La sensació no és vàlida.")

    task_id = payload.get("taskId") or ""
    if task_id and not (isinstance(task_id, str) and NOTION_ID_PATTERN.match(task_id)):
        raise ValueError("La tasca no és vàlida.")

    note = str(payload.get("note") or "").strip()[:MAX_NOTE_LENGTH]
    return {
        "id": str(payload.get("id") or ""),
        "block": block,
        "startedAt": started_at,
        "endedAt": ended_at,
        "pauseMinutes": round(pause_minutes),
        "note": note,
        "feeling": feeling,
        "taskId": task_id,
    }


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


# ---------- Sending ----------


def check_sessions(blocks: list[str]) -> tuple[str, list[str]]:
    """Read ⏱ Sessions and return (its name, list of structure problems)."""
    data_source = get_data_source(os.getenv("NOTION_SESSIONS_DS_ID"))
    return get_data_source_name(data_source), find_schema_problems(data_source, blocks)


def _ensure_schema_matches(blocks: list[str]) -> None:
    """Refuse to write if ⏱ Sessions is not as expected."""
    _, problems = check_sessions(blocks)
    if problems:
        raise NotionError("⏱ Sessions no té l'estructura esperada: " + "; ".join(problems) + ".")


def send_session(session: dict, blocks: list[str]) -> str:
    """Send a session to Notion. Returns "sent", or "queued" if Notion is down.

    Raises NotionError for problems that waiting will not fix (token, structure...).
    """
    try:
        _ensure_schema_matches(blocks)
        create_session_page(os.getenv("NOTION_SESSIONS_DS_ID"), session)
        return "sent"
    except NotionUnavailableError:
        _add_to_queue(session)
        return "queued"


def flush_queue(blocks: list[str]) -> int:
    """Try to send the queued sessions. Returns how many are still waiting."""
    with _queue_lock:
        queue = _load_queue()
        if not queue:
            return 0
        try:
            _ensure_schema_matches(blocks)
        except NotionError:
            return len(queue)  # Notion is down or not ready: keep everything

        remaining = []
        for index, session in enumerate(queue):
            try:
                create_session_page(os.getenv("NOTION_SESSIONS_DS_ID"), session)
            except NotionUnavailableError:
                remaining += queue[index:]  # Notion stopped answering: try later
                break
            except NotionError:
                remaining.append(session)  # never lose a session
        _save_queue(remaining)
        return len(remaining)


def count_queued() -> int:
    return len(_load_queue())


# ---------- The queue file ----------


def _add_to_queue(session: dict) -> None:
    with _queue_lock:
        queue = _load_queue()
        if session["id"] and any(item.get("id") == session["id"] for item in queue):
            return  # already waiting (e.g. "Envia" pressed twice)
        queue.append(session)
        _save_queue(queue)


def _load_queue() -> list[dict]:
    if not QUEUE_PATH.exists():
        return []
    try:
        return json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def _save_queue(queue: list[dict]) -> None:
    """Write to a temporary file first, so a crash never leaves a half-written queue."""
    QUEUE_PATH.parent.mkdir(exist_ok=True)
    temporary = QUEUE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(queue, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(QUEUE_PATH)
