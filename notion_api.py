"""Small wrapper around the official Notion client.

All calls to Notion go through this file, so the rest of the app
never has to deal with tokens, API versions or raw Notion errors.
The tool only reads the data source structure and creates rows:
it never changes databases or properties.
"""

import os
import unicodedata
from datetime import datetime

import httpx
from notion_client import (
    APIErrorCode,
    APIResponseError,
    Client,
    RequestTimeoutError,
    RetryOptions,
    UnknownHTTPResponseError,
    collect_paginated_api,
)

# Notion API version that the notion-client library (3.1.0) is built for.
# It is the first version that works with data sources.
NOTION_VERSION = "2025-09-03"

# Give up quickly if Notion does not answer: the session goes to the local queue.
REQUEST_TIMEOUT_MS = 15_000
MAX_RETRIES = 1

# Notion accepts at most 2000 characters per piece of text.
MAX_TEXT_CHUNK = 2000

# Properties of ⏱ Sessions that the tool writes, with their Notion type.
SESSION_PROPERTIES = {
    "Sessió": "title",
    "Bloc": "select",
    "Franja": "date",
    "Pausa (min)": "number",
    "Sensació": "select",
    "Nota": "rich_text",
    "Origen": "select",
    "Tasca": "relation",
}
FEELINGS = ["Peatge", "Neutre", "Plaer"]
TOOL_ORIGIN = "Eina"

# Properties of ✅ Tasques that the tool reads (it never writes there).
TASK_PROPERTIES = {
    "Nom": "title",
    "Estat": "status",
}
# Tasks in these states are finished and are not offered in the selector.
HIDDEN_TASK_STATUSES = {"Fet", "Done", "Arxivat"}

# Errors where trying again later makes sense.
TEMPORARY_ERROR_CODES = {
    APIErrorCode.RateLimited,
    APIErrorCode.ConflictError,
    APIErrorCode.InternalServerError,
    APIErrorCode.ServiceUnavailable,
    APIErrorCode.GatewayTimeout,
}
UNAVAILABLE_MESSAGE = "Notion no respon ara mateix."


class NotionError(Exception):
    """An error with a message in Catalan, ready to show to the user."""


class NotionUnavailableError(NotionError):
    """Notion did not answer: it is worth trying again later."""


# ---------- Connection ----------


def get_client() -> Client:
    """Create a Notion client using the token from the .env file."""
    token = os.getenv("NOTION_TOKEN")
    if not token:
        raise NotionError("Falta el token de Notion al fitxer .env (NOTION_TOKEN).")
    return Client(
        auth=token,
        notion_version=NOTION_VERSION,
        timeout_ms=REQUEST_TIMEOUT_MS,
        retry=RetryOptions(max_retries=MAX_RETRIES),
    )


def _call_notion(request):
    """Run a request to Notion and turn its errors into NotionError."""
    try:
        return request(get_client())
    except APIResponseError as error:
        if error.code in TEMPORARY_ERROR_CODES:
            raise NotionUnavailableError(UNAVAILABLE_MESSAGE) from error
        raise NotionError(_explain_api_error(error)) from error
    except UnknownHTTPResponseError as error:
        if error.status >= 500:
            raise NotionUnavailableError(UNAVAILABLE_MESSAGE) from error
        raise NotionError("Notion ha retornat un error inesperat.") from error
    except (RequestTimeoutError, httpx.TransportError) as error:
        raise NotionUnavailableError(
            "No s'ha pogut contactar amb Notion. Comprova la connexió a internet."
        ) from error


def _explain_api_error(error: APIResponseError) -> str:
    """Translate a Notion API error into a clear message in Catalan."""
    if error.code == APIErrorCode.Unauthorized:
        return "Notion no accepta el token. Revisa NOTION_TOKEN al fitxer .env."
    if error.code in (APIErrorCode.ObjectNotFound, APIErrorCode.RestrictedResource):
        return (
            "No es troba la base de dades. Revisa l'identificador al fitxer .env "
            "i que la integració hi tingui accés (Connexions)."
        )
    if error.code == APIErrorCode.ValidationError:
        return "Notion no ha acceptat les dades de la sessió."
    return "Notion ha retornat un error inesperat. Torna-ho a provar d'aquí a una estona."


# ---------- Reading the structure (read-only) ----------


def get_data_source(data_source_id: str | None) -> dict:
    """Return a Notion data source (its name and properties)."""
    if not data_source_id:
        raise NotionError("Falta l'identificador de la base de dades al fitxer .env.")
    return _call_notion(lambda notion: notion.data_sources.retrieve(data_source_id=data_source_id))


def get_data_source_name(data_source: dict) -> str:
    """The title is a list of text pieces; join them into one plain string."""
    return "".join(piece["plain_text"] for piece in data_source["title"])


def find_schema_problems(data_source: dict, blocks: list[str]) -> list[str]:
    """Compare ⏱ Sessions with what the tool expects.

    Returns a list of problems in Catalan (empty if everything matches).
    This matters because Notion would silently CREATE a select option that
    does not exist, and the tool must never change the database.
    """
    properties = data_source["properties"]
    problems = _property_problems(properties, SESSION_PROPERTIES)
    problems += _missing_options(properties, "Bloc", blocks)
    problems += _missing_options(properties, "Sensació", FEELINGS)
    problems += _missing_options(properties, "Origen", [TOOL_ORIGIN])
    return problems


def _property_problems(properties: dict, expected: dict) -> list[str]:
    """Check that each expected property exists and has the right type."""
    problems = []
    for name, expected_type in expected.items():
        prop = properties.get(name)
        if prop is None:
            problems.append(f"falta la propietat «{name}»")
        elif prop["type"] != expected_type:
            problems.append(f"la propietat «{name}» no és del tipus esperat")
    return problems


def get_block_options(data_source: dict) -> list[str]:
    """The options of the "Bloc" property, in the order they have in Notion."""
    prop = data_source["properties"].get("Bloc")
    if prop is None or prop["type"] != "select":
        return []
    return [option["name"] for option in prop["select"]["options"]]


def _missing_options(properties: dict, name: str, wanted: list[str]) -> list[str]:
    prop = properties.get(name)
    if prop is None or prop["type"] != "select":
        return []
    existing = {option["name"] for option in prop["select"]["options"]}
    return [f"l'opció «{option}» no existeix a «{name}»" for option in wanted if option not in existing]


# ---------- Reading the sessions of a week (read-only) ----------


def list_week_sessions(data_source_id: str | None, start: datetime, end: datetime) -> dict:
    """Read the rows of ⏱ Sessions whose Franja starts between start and end.

    Includes both "Manual" and "Eina" rows. Returns the block options (Notion
    order) and, for each row, its block, its hours (the "Hores" formula, so
    the totals match Notion) and its feeling.
    """
    data_source = get_data_source(data_source_id)
    properties = data_source["properties"]
    hours = properties.get("Hores")
    if hours is None or hours["type"] != "formula":
        raise NotionError("⏱ Sessions no té la fórmula «Hores» que la vista setmanal necessita.")

    week_filter = {
        "and": [
            {"property": "Franja", "date": {"on_or_after": start.isoformat()}},
            {"property": "Franja", "date": {"before": end.isoformat()}},
        ]
    }
    rows = _call_notion(
        lambda notion: collect_paginated_api(
            notion.data_sources.query, data_source_id=data_source_id, filter=week_filter, page_size=100
        )
    )
    sessions = [_session_from_row(row) for row in rows if row.get("object") == "page"]
    return {"blocks": get_block_options(data_source), "sessions": sessions}


def _session_from_row(row: dict) -> dict:
    properties = row["properties"]
    block = (properties.get("Bloc", {}).get("select") or {}).get("name")
    feeling = (properties.get("Sensació", {}).get("select") or {}).get("name")
    formula = properties.get("Hores", {}).get("formula") or {}
    hours = formula.get("number") if formula.get("type") == "number" else None
    return {"block": block, "hours": hours, "feeling": feeling}


# ---------- Reading the tasks (read-only) ----------


def list_open_tasks(data_source_id: str | None) -> list[dict]:
    """Return the tasks of ✅ Tasques that are not finished, sorted by name.

    Each task is {"id": ..., "name": ...}. We filter here in Python instead of
    asking Notion to filter: a Notion filter on a state that does not exist
    would fail, while this way it simply has no effect.
    """
    data_source = get_data_source(data_source_id)
    problems = _property_problems(data_source["properties"], TASK_PROPERTIES)
    if problems:
        raise NotionError("✅ Tasques no té l'estructura esperada: " + "; ".join(problems) + ".")

    # Notion gives at most 100 rows per call: collect_paginated_api asks for all pages.
    rows = _call_notion(
        lambda notion: collect_paginated_api(
            notion.data_sources.query, data_source_id=data_source_id, page_size=100
        )
    )
    tasks = [_task_from_row(row) for row in rows if row.get("object") == "page"]
    open_tasks = [task for task in tasks if task["status"] not in HIDDEN_TASK_STATUSES]
    open_tasks.sort(key=lambda task: _sort_key(task["name"]))
    return [{"id": task["id"], "name": task["name"]} for task in open_tasks]


def _task_from_row(row: dict) -> dict:
    properties = row["properties"]
    name = "".join(piece["plain_text"] for piece in properties["Nom"]["title"]).strip()
    status = (properties["Estat"].get("status") or {}).get("name", "")
    return {"id": row["id"], "name": name or "(sense nom)", "status": status}


def _sort_key(text: str) -> str:
    """Alphabetical order that ignores accents and capitals («Àlgebra» next to «Algorisme»)."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()


# ---------- Creating a session row ----------


def create_session_page(data_source_id: str | None, session: dict) -> None:
    """Create one row in ⏱ Sessions from a finished session."""
    properties = build_session_properties(session)
    _call_notion(
        lambda notion: notion.pages.create(
            parent={"type": "data_source_id", "data_source_id": data_source_id},
            properties=properties,
        )
    )


def build_session_properties(session: dict) -> dict:
    """Turn a session into the property format that Notion expects."""
    start = _to_local_datetime(session["startedAt"])
    end = _to_local_datetime(session["endedAt"])
    properties = {
        "Sessió": {"title": _text(f"{session['block']} · {start:%d/%m}")},
        "Bloc": {"select": {"name": session["block"]}},
        "Franja": {
            "date": {
                "start": start.isoformat(timespec="seconds"),
                "end": end.isoformat(timespec="seconds"),
            }
        },
        "Pausa (min)": {"number": session["pauseMinutes"]},
        "Origen": {"select": {"name": TOOL_ORIGIN}},
    }
    if session["note"]:
        properties["Nota"] = {"rich_text": _text(session["note"])}
    if session["feeling"]:
        properties["Sensació"] = {"select": {"name": session["feeling"]}}
    # .get(): sessions queued before phase 3 have no taskId.
    if session.get("taskId"):
        properties["Tasca"] = {"relation": [{"id": session["taskId"]}]}
    return properties


def _to_local_datetime(timestamp_ms: float) -> datetime:
    """Browser timestamps are milliseconds; add this computer's time zone."""
    return datetime.fromtimestamp(timestamp_ms / 1000).astimezone()


def _text(content: str) -> list[dict]:
    """Split a text into the pieces of at most 2000 characters that Notion accepts."""
    return [
        {"type": "text", "text": {"content": content[i : i + MAX_TEXT_CHUNK]}}
        for i in range(0, len(content), MAX_TEXT_CHUNK)
    ]
