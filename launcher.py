"""Start NotionCronoTool for daily use (start.bat runs this file).

- If the tool is already running, it only opens the browser.
- Otherwise it starts the server (without debug mode) and opens the
  browser as soon as the server answers.

For programming, keep using `python app.py` (debug mode, auto-reload).
"""

import logging
import threading
import time
import urllib.request
import webbrowser

HOST = "127.0.0.1"
PORT = 5000
URL = f"http://localhost:{PORT}"
WAIT_STEP_S = 0.25
WAIT_STEPS = 60  # up to 15 seconds


def tool_is_running() -> bool:
    """True if NotionCronoTool already answers on this computer."""
    try:
        with urllib.request.urlopen(f"{URL}/api/config", timeout=1) as response:
            return response.status == 200
    except OSError:
        return False


def open_browser_when_ready() -> None:
    """Wait until the server answers, then open the page."""
    for _ in range(WAIT_STEPS):
        if tool_is_running():
            webbrowser.open(URL)
            return
        time.sleep(WAIT_STEP_S)
    print(f"  No he pogut obrir el navegador sol. Obre'l tu a: {URL}")


def main() -> None:
    if tool_is_running():
        print("  L'eina ja està en marxa: obro el navegador.")
        webbrowser.open(URL)
        return

    # Imported here: only when we really start the server.
    from app import app

    # Hide the line the server prints for every request (too noisy for daily use).
    logging.getLogger("werkzeug").setLevel(logging.WARNING)

    print()
    print("  ⏱  NotionCronoTool en marxa")
    print(f"     Adreça: {URL}")
    print("     No tanquis aquesta finestra mentre facis servir l'eina.")
    print("     Per aturar-la, tanca la finestra o prem Ctrl+C.")
    print()

    threading.Thread(target=open_browser_when_ready, daemon=True).start()
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
