// NotionCronoTool - the stopwatch.
//
// Key idea: we never count seconds one by one. We store the moment the
// session started and the total paused time, and compute the active time
// from the real clock. Browsers slow down timers in hidden tabs, so counting
// ticks would drift; reading the clock never does. It also means that after
// a page reload the time is still right.
//
// States: "idle" -> "running" <-> "paused" -> "pending" (waiting to be sent) -> "idle".
// The modal and the sending live in end-modal.js.

const TICK_MS = 250;
const CLOCK_CENTER = "100 116"; // centre of the main dial in the SVG
const SUBDIAL_CENTER = "100 144"; // centre of the hours sub-dial
const STORAGE_KEY = "notioncronotool.state";

// Settings from config/plan.toml (filled in by loadConfig).
const config = { title: "", blocks: [], limitMinutes: 180, limitMessage: "", backgroundVideo: "" };

// The current session.
const session = {
  status: "idle",
  block: "",
  initialNote: "",      // note written next to the block, before starting
  startedAt: null,      // ms timestamp when "Inicia" was pressed
  pauseStartedAt: null, // ms timestamp when the current pause began
  pausedMs: 0,          // total time of the pauses that have already ended
};

// A finished session waiting to be sent to Notion (status "pending").
let pending = null;

const TOAST_MS = 6000;
let toastTimer = null;

// Whether the "add to the note" box is open during a session.
let extraNoteOpen = false;

// Shortcut to get page elements by id.
const ui = (id) => document.getElementById(id);

// Glass dropdown for the blocks (created in init).
let blockSelect = null;

// ---------- Small helpers that only touch the page when something changes ----------
// Rewriting identical content still makes the browser repaint, which causes
// flicker on top of the blurred glass.

function setText(id, text) {
  const element = ui(id);
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function setAttr(element, name, value) {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

function setDisabled(element, disabled) {
  if (element.disabled !== disabled) {
    element.disabled = disabled;
  }
}

function setHidden(element, hidden) {
  if (element.hidden !== hidden) {
    element.hidden = hidden;
  }
}

// ---------- Time calculations ----------

function getLimitMs() {
  return config.limitMinutes * 60 * 1000;
}

function isActive() {
  return session.status === "running" || session.status === "paused";
}

function getPausedMs(now) {
  let paused = session.pausedMs;
  if (session.status === "paused") {
    paused += now - session.pauseStartedAt;
  }
  return paused;
}

function getActiveMs(now) {
  if (!isActive()) {
    return 0;
  }
  return now - session.startedAt - getPausedMs(now);
}

// Time to display: the pending session, or the running one (0 when idle).
function getShownMs(now) {
  if (pending) {
    return pending.activeMs;
  }
  return getActiveMs(now);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

// "1 h 25 min", "40 min", "2 h"
function formatHoursMinutes(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function formatClockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
}

// ---------- Notes ----------

// Joins the note written before starting and the one added during the
// session. If only one of them has text, the result is just that one.
function buildFinalNote(initialNote, extraNote) {
  return [initialNote, extraNote]
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join("\n");
}

// ---------- Saving in the browser (so a reload never loses a session) ----------

function saveState() {
  const state = {
    session: session,
    pending: pending,
    extraNote: pending ? "" : ui("extra-note-input").value,
    extraNoteOpen: extraNoteOpen,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked (e.g. private window): the tool still works, without recovery.
  }
}

function restoreState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return;
  }
  if (!saved || !saved.session) {
    return;
  }
  Object.assign(session, saved.session);
  pending = saved.pending || null;
  if (session.status === "pending" && !pending) {
    session.status = "idle"; // safety net for a damaged save
  }
  extraNoteOpen = Boolean(saved.extraNoteOpen);
  ui("extra-note-input").value = pending ? pending.note : saved.extraNote || "";
  blockSelect.setValue(pending ? pending.block : session.block);
}

// ---------- Session actions ----------

function startSession() {
  if (session.status !== "idle" || !blockSelect.value) {
    return;
  }
  session.status = "running";
  session.block = blockSelect.value;
  session.initialNote = ui("initial-note-input").value.trim();
  session.startedAt = Date.now();
  session.pauseStartedAt = null;
  session.pausedMs = 0;

  extraNoteOpen = false;
  ui("extra-note-input").value = "";
  askNotificationPermission();
  saveState();
  render();
}

function pauseSession() {
  if (session.status !== "running") {
    return;
  }
  session.status = "paused";
  session.pauseStartedAt = Date.now();
  saveState();
  render();
}

function resumeSession() {
  if (session.status !== "paused") {
    return;
  }
  session.pausedMs += Date.now() - session.pauseStartedAt;
  session.pauseStartedAt = null;
  session.status = "running";
  saveState();
  render();
}

// Stops the session and opens the review modal. If it was stopped by the
// 3 h limit, the end time is the exact moment the limit was reached
// (the tab may have been asleep, or even closed).
function stopSession(reachedLimit) {
  if (!isActive()) {
    return;
  }
  const now = Date.now();
  if (session.status === "paused") {
    session.pausedMs += now - session.pauseStartedAt;
  }
  const endedAt = reachedLimit ? session.startedAt + session.pausedMs + getLimitMs() : now;

  pending = {
    id: newSessionId(),
    block: session.block,
    startedAt: session.startedAt,
    endedAt: endedAt,
    activeMs: endedAt - session.startedAt - session.pausedMs,
    pauseMinutes: Math.round(session.pausedMs / 60000),
    reachedLimit: reachedLimit,
    note: buildFinalNote(session.initialNote, ui("extra-note-input").value),
    feeling: "",
    taskId: "",   // optional task of ✅ Tasques (chosen in the modal)
    taskName: "",
  };

  session.status = "pending";
  session.initialNote = "";
  session.startedAt = null;
  session.pauseStartedAt = null;
  session.pausedMs = 0;
  ui("initial-note-input").value = "";
  ui("extra-note-input").value = pending.note; // the merged note, editable

  if (reachedLimit) {
    notifyLimitReached();
  }
  saveState();
  render();
  openEndModal();
}

// Called by end-modal.js when the pending session is sent, queued or discarded.
// The whole screen goes back to zero, ready for a new session, and a short
// message confirms what happened.
function finishPendingSession(outcome) {
  const messages = {
    sent: `Sessió de ${pending.block} enviada a Notion ✓`,
    queued: "Notion no respon: la sessió s'ha guardat i s'enviarà sola quan torni.",
    discarded: "Sessió descartada. No s'ha enviat res.",
  };
  showToast(messages[outcome]);

  pending = null;
  session.status = "idle";
  session.block = "";
  extraNoteOpen = false;
  ui("extra-note-input").value = "";
  ui("initial-note-input").value = "";
  blockSelect.setValue("");
  saveState();
  render();
}

function showToast(text) {
  setText("toast", text);
  setHidden(ui("toast"), false);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setHidden(ui("toast"), true), TOAST_MS);
}

function newSessionId() {
  return window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

// One action that starts, pauses or resumes depending on the state.
function toggleSession() {
  if (session.status === "pending" || (session.status === "idle" && !blockSelect.value)) {
    return;
  }
  pressPusher("pusher-start");
  if (session.status === "idle") {
    startSession();
  } else if (session.status === "running") {
    pauseSession();
  } else {
    resumeSession();
  }
}

function requestStop() {
  if (!isActive()) {
    return;
  }
  pressPusher("pusher-stop");
  stopSession(false);
}

// Small animation: the stopwatch button sinks for a moment.
function pressPusher(id) {
  const pusher = ui(id);
  pusher.classList.add("pressed");
  setTimeout(() => pusher.classList.remove("pressed"), 150);
}

// ---------- Browser notifications (only for the 3 h limit) ----------

function askNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function notifyLimitReached() {
  const canNotify = "Notification" in window && Notification.permission === "granted";
  if (document.hidden && canNotify) {
    new Notification("NotionCronoTool", { body: config.limitMessage });
  }
}

// ---------- Screen updates ----------

function render() {
  const now = Date.now();
  const status = session.status;
  const hasBlock = Boolean(blockSelect.value);

  setText("elapsed", formatDuration(getShownMs(now)));

  renderStatusTexts(status, now);
  renderControls(status, hasBlock);
  renderNoteArea(status);
  renderLimitMessage(status);

  setAttr(ui("timer-card"), "data-status", status);
  setAttr(document.body, "data-status", status);
}

function renderStatusTexts(status, now) {
  const stateNames = { idle: "Aturat", running: "En marxa", paused: "EN PAUSA", pending: "Pendent d'enviar" };
  setText("card-state", stateNames[status]);

  if (status === "pending") {
    setText("card-block", pending.block);
    setText("card-initial-note", "");
    setText("status-line", `${pending.block} · pendent d'enviar a Notion`);
    document.title = `Pendent d'enviar · ${pending.block}`;
    return;
  }

  if (status === "idle") {
    const block = blockSelect.value;
    setText("card-block", block || "—");
    setText("card-initial-note", "");
    setText("status-line", block ? `${block} · a punt per començar` : "Tria un bloc per començar");
    document.title = "NotionCronoTool";
    return;
  }

  setText("card-block", session.block);
  setText("card-initial-note", session.initialNote);
  const since = formatClockTime(session.startedAt);
  setText("status-line", status === "running"
    ? `${session.block} · en marxa des de les ${since}`
    : `${session.block} · en pausa`);

  // The tab title shows the time, useful when the tab is in the background.
  const prefix = status === "paused" ? "⏸ " : "";
  document.title = `${prefix}${formatDuration(getActiveMs(now))} · ${session.block}`;
}

function renderControls(status, hasBlock) {
  const active = isActive();
  const canStart = status === "idle" && hasBlock;
  const primaryLabels = { idle: "Inicia", running: "Pausa", paused: "Reprèn", pending: "Inicia" };

  setText("primary-label", primaryLabels[status]);
  setDisabled(ui("primary-button"), !active && !canStart);
  setDisabled(ui("stop-button"), !active);

  // Only one session at a time: block and initial note are locked
  // while a session is active or waiting to be sent.
  blockSelect.setDisabled(status !== "idle");
  setDisabled(ui("initial-note-input"), status !== "idle");

  const toggle = ui("work-toggle");
  setDisabled(toggle, !active && !canStart);
  setAttr(toggle, "aria-checked", String(status === "running"));
  const toggleLabels = { idle: "Inactiu", running: "Mode treball", paused: "En pausa", pending: "Inactiu" };
  setText("work-toggle-label", toggleLabels[status]);
}

// During a session: optional box to add to the note.
// While pending: the merged note is always visible and editable.
function renderNoteArea(status) {
  const noteInput = ui("extra-note-input");
  const active = isActive();

  setHidden(ui("note-button"), !active);
  setText("note-button", extraNoteOpen ? "Amaga la nota" : "Afegeix a la nota");
  setHidden(ui("review-button"), status !== "pending");

  if (status === "pending") {
    setHidden(noteInput, false);
    setAttr(noteInput, "placeholder", "Nota final (opcional)");
  } else {
    setHidden(noteInput, !(active && extraNoteOpen));
    setAttr(noteInput, "placeholder", "Afegeix-hi el que vulguis…");
  }
}

// The "3 hours" message stays on the card while the session waits to be sent.
function renderLimitMessage(status) {
  const reachedLimit = status === "pending" && pending.reachedLimit;
  setHidden(ui("limit-message"), !reachedLimit);
  if (reachedLimit) {
    setText("limit-message", config.limitMessage);
  }
}

// ---------- Analog stopwatch ----------

// Main dial: 60 tick marks, one per minute.
function buildMinuteTicks() {
  drawTicks(ui("clock-ticks"), 60, 100, 116, 70, (i) => (i % 5 === 0 ? 8 : 4), (i) => (i % 5 === 0 ? 2 : 1));
}

// Hours sub-dial: one mark per hour of the limit (3 marks for 3 h).
function buildHourTicks() {
  const hours = Math.max(1, Math.round(config.limitMinutes / 60));
  ui("subdial-ticks").replaceChildren();
  drawTicks(ui("subdial-ticks"), hours, 100, 144, 15, () => 5, () => 1.5);
}

function drawTicks(group, count, cx, cy, outerRadius, lengthOf, widthOf) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    const innerRadius = outerRadius - lengthOf(i);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", cx + innerRadius * Math.sin(angle));
    line.setAttribute("y1", cy - innerRadius * Math.cos(angle));
    line.setAttribute("x2", cx + outerRadius * Math.sin(angle));
    line.setAttribute("y2", cy - outerRadius * Math.cos(angle));
    line.setAttribute("stroke-width", widthOf(i));
    group.append(line);
  }
}

// Seconds hand sweeps; the outer ring fills up to the current minute mark
// (and starts again every hour); the hours hand makes one turn per session limit.
function renderClock() {
  const ms = getShownMs(Date.now());
  const secondsAngle = ((ms / 1000) % 60) * 6;
  const minutesDone = Math.floor(ms / 60000) % 60;
  const hoursAngle = Math.min(1, ms / getLimitMs()) * 360;

  setAttr(ui("second-hand"), "transform", `rotate(${secondsAngle.toFixed(1)} ${CLOCK_CENTER})`);
  setAttr(ui("hour-hand"), "transform", `rotate(${hoursAngle.toFixed(1)} ${SUBDIAL_CENTER})`);
  setAttr(ui("clock-progress"), "stroke-dashoffset", String(100 - (minutesDone / 60) * 100));
}

// Smooth animation of the hands (the browser pauses it when the tab is hidden).
function animateClock() {
  renderClock();
  requestAnimationFrame(animateClock);
}

// Runs several times per second: refreshes the texts and checks the limit.
function tick() {
  if (session.status === "running" && getActiveMs(Date.now()) >= getLimitMs()) {
    stopSession(true);
    return;
  }
  render();
}

// ---------- Background video ----------

function setUpBackgroundVideo() {
  const prefersLessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!config.backgroundVideo || prefersLessMotion) {
    return; // keep the gradient background
  }
  const video = ui("bg-video");
  video.src = `/static/media/${encodeURIComponent(config.backgroundVideo)}`;
  video.addEventListener("error", () => { video.hidden = true; });
  video.addEventListener("canplay", () => { video.hidden = false; }, { once: true });
  video.play().catch(() => {});

  // Save computer resources: pause the video when the tab is not visible.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  });
}

// ---------- Start-up ----------

async function loadConfig() {
  const response = await fetch("/api/config");
  Object.assign(config, await response.json());
  setText("title", config.title);
  blockSelect.setOptions(config.blocks);
}

function toggleExtraNote() {
  extraNoteOpen = !extraNoteOpen;
  saveState();
  render();
  if (extraNoteOpen) {
    ui("extra-note-input").focus();
  }
}

// The note box below the clock: while pending, it edits the final note.
function onNoteInput() {
  if (pending) {
    pending.note = ui("extra-note-input").value;
  }
  saveState();
}

function connectEvents() {
  ui("primary-button").addEventListener("click", toggleSession);
  ui("work-toggle").addEventListener("click", toggleSession);
  ui("pusher-start").addEventListener("click", toggleSession);
  ui("stop-button").addEventListener("click", requestStop);
  ui("pusher-stop").addEventListener("click", requestStop);
  ui("note-button").addEventListener("click", toggleExtraNote);
  ui("extra-note-input").addEventListener("input", onNoteInput);
  ui("review-button").addEventListener("click", openEndModal);
}

async function init() {
  blockSelect = createGlassSelect(ui("block-select"), {
    placeholder: "Tria un bloc…",
    label: "Bloc",
    onChange: render,
  });
  setUpEndModal();
  connectEvents();
  buildMinuteTicks();
  try {
    await loadConfig();
  } catch {
    setText("status-line", "No s'ha pogut llegir la configuració (config/plan.toml).");
    return;
  }
  buildHourTicks();
  restoreState();
  setUpBackgroundVideo();
  render();
  setInterval(tick, TICK_MS);
  requestAnimationFrame(animateClock);
  loadNotionStatus();
  startQueueRetries();
}

init();
