// NotionCronoTool - end-of-session modal and sending to Notion.
//
// When a session stops, this modal shows a summary. From here you can:
//   - "Envia a Notion": create the row in ⏱ Sessions,
//   - "Cancel·la": go back; the session stays pending and the note can be edited,
//   - "Descarta": throw the session away (after confirming).
// It uses `pending`, `config` and the helpers defined in app.js.

const FEELINGS = ["Peatge", "Neutre", "Plaer"];
const QUEUE_RETRY_MS = 2 * 60 * 1000; // try the local queue again every 2 minutes

let feelingSelect = null;
let modalBusy = false;

// ---------- Opening and closing ----------

function setUpEndModal() {
  const modal = ui("end-modal");
  feelingSelect = createGlassSelect(ui("feeling-select"), {
    placeholder: "Tria una sensació…",
    label: "Sensació",
    container: modal,
    onChange: (feeling) => {
      pending.feeling = feeling;
      saveState();
    },
  });
  feelingSelect.setOptions(FEELINGS);

  ui("modal-send").addEventListener("click", sendPendingSession);
  ui("modal-cancel").addEventListener("click", () => modal.close());
  ui("modal-discard").addEventListener("click", () => showDiscardConfirm(true));
  ui("modal-confirm-no").addEventListener("click", () => showDiscardConfirm(false));
  ui("modal-confirm-yes").addEventListener("click", discardPendingSession);
  ui("modal-note").addEventListener("input", onModalNoteInput);

  // Esc closes the modal (same as "Cancel·la"), except while sending.
  modal.addEventListener("cancel", (event) => {
    if (modalBusy) {
      event.preventDefault();
    }
  });
  modal.addEventListener("close", render);
}

function openEndModal() {
  if (!pending) {
    return;
  }
  const range = `${formatClockTime(pending.startedAt)}–${formatClockTime(pending.endedAt)}`;
  setText("modal-block", pending.block);
  setText("modal-duration", formatHoursMinutes(pending.activeMs));
  setText("modal-range", range);
  setText("modal-pause", `${pending.pauseMinutes} min`);
  setText("modal-limit-message", config.limitMessage);
  setHidden(ui("modal-limit-message"), !pending.reachedLimit);

  ui("modal-note").value = pending.note;
  feelingSelect.setValue(pending.feeling);
  showModalMessage("");
  showDiscardConfirm(false);
  setModalBusy(false);

  if (!ui("end-modal").open) {
    ui("end-modal").showModal();
  }
}

// The note can be edited both here and below the clock; keep both in sync.
function onModalNoteInput() {
  pending.note = ui("modal-note").value;
  ui("extra-note-input").value = pending.note;
  saveState();
}

function showDiscardConfirm(show) {
  setHidden(ui("modal-actions"), show);
  setHidden(ui("modal-confirm"), !show);
}

function showModalMessage(text, kind = "info") {
  setText("modal-message", text);
  ui("modal-message").dataset.kind = kind;
  setHidden(ui("modal-message"), text === "");
}

function setModalBusy(busy) {
  modalBusy = busy;
  for (const id of ["modal-send", "modal-cancel", "modal-discard"]) {
    setDisabled(ui(id), busy);
  }
  setText("modal-send", busy ? "Enviant…" : "Envia a Notion");
}

// ---------- Sending, discarding ----------

async function sendPendingSession() {
  if (!pending || modalBusy) {
    return;
  }
  setModalBusy(true);
  showModalMessage("");
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSessionPayload(pending)),
    });
    const result = await response.json();
    if (!response.ok) {
      showModalMessage(result.message, "error");
      return;
    }
    showQueueCount(result.queued);
    ui("end-modal").close();
    finishPendingSession(result.result); // "sent" or "queued"
  } catch {
    showModalMessage(
      "No s'ha pogut contactar amb el servidor de l'eina. Comprova que encara està en marxa.",
      "error"
    );
  } finally {
    setModalBusy(false);
  }
}

function buildSessionPayload(finished) {
  return {
    id: finished.id,
    block: finished.block,
    startedAt: finished.startedAt,
    endedAt: finished.endedAt,
    pauseMinutes: finished.pauseMinutes,
    note: finished.note,
    feeling: finished.feeling,
  };
}

function discardPendingSession() {
  ui("end-modal").close();
  finishPendingSession("discarded");
}

// ---------- Notion status and the local queue ----------

async function loadNotionStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    setText("notion-status", status.message);
    ui("notion-status").dataset.connected = String(status.connected);
    showQueueCount(status.queued);
  } catch {
    setText("notion-status", "No s'ha pogut comprovar la connexió amb Notion.");
    ui("notion-status").dataset.connected = "false";
  }
}

// Sessions that could not be sent are kept by the server in a local queue.
// Ask it to try again now and then.
async function flushQueue() {
  try {
    const response = await fetch("/api/queue/flush", { method: "POST" });
    const result = await response.json();
    showQueueCount(result.queued);
  } catch {
    // The server is not reachable right now; we will try again later.
  }
}

function showQueueCount(count) {
  const waiting = Number(count) || 0;
  setHidden(ui("queue-status"), waiting === 0);
  setText("queue-status", waiting === 1
    ? "1 sessió pendent d'enviar a Notion"
    : `${waiting} sessions pendents d'enviar a Notion`);
}

// Check the connection and retry the queue: on page load, every 2 minutes,
// and as soon as the browser says the internet is back.
function refreshConnection() {
  loadNotionStatus();
  flushQueue();
}

function startQueueRetries() {
  flushQueue();
  setInterval(refreshConnection, QUEUE_RETRY_MS);
  window.addEventListener("online", refreshConnection);
}
