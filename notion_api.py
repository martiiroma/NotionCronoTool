"""Small wrapper around the official Notion client.

All calls to Notion go through this file, so the rest of the app
never has to deal with tokens, API versions or raw Notion errors.
"""

import os

import httpx
from notion_client import APIErrorCode, APIResponseError, Client, RequestTimeoutError

# Notion API version that the notion-client library (3.1.0) is built for.
# It is the first version that works with data sources.
NOTION_VERSION = "2025-09-03"


class NotionError(Exception):
    """An error with a message in Catalan, ready to show to the user."""


def get_client() -> Client:
    """Create a Notion client using the token from the .env file."""
    token = os.getenv("NOTION_TOKEN")
    if not token:
        raise NotionError("Falta el token de Notion al fitxer .env (NOTION_TOKEN).")
    return Client(auth=token, notion_version=NOTION_VERSION)


def get_data_source_name(data_source_id: str | None) -> str:
    """Return the name of a Notion data source, e.g. '⏱ Sessions'."""
    if not data_source_id:
        raise NotionError("Falta l'identificador de la base de dades al fitxer .env.")

    try:
        data_source = get_client().data_sources.retrieve(data_source_id=data_source_id)
    except APIResponseError as error:
        raise NotionError(_explain_api_error(error)) from error
    except (RequestTimeoutError, httpx.TransportError) as error:
        raise NotionError(
            "No s'ha pogut contactar amb Notion. Comprova la connexió a internet."
        ) from error

    # The title is a list of text pieces; join them into one plain string.
    return "".join(piece["plain_text"] for piece in data_source["title"])


def _explain_api_error(error: APIResponseError) -> str:
    """Translate a Notion API error into a clear message in Catalan."""
    if error.code == APIErrorCode.Unauthorized:
        return "Notion no accepta el token. Revisa NOTION_TOKEN al fitxer .env."
    if error.code == APIErrorCode.ObjectNotFound:
        return (
            "No es troba la base de dades. Revisa l'identificador al fitxer .env "
            "i que la integració hi tingui accés (Connexions)."
        )
    return "Notion ha retornat un error inesperat. Torna-ho a provar d'aquí a una estona."
