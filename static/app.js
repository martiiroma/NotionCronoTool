// NotionCronoTool - phase 1: local stopwatch (nothing is sent to Notion yet).
//
// Key idea: we never count seconds one by one. We store the moment the
// session started and the total paused time, and compute the active time
// from the real clock. Browsers slow down timers in hidden tabs, so counting
// ticks would drift; reading the clock never does.

const TICK_MS = 250;
const CLOCK_CENTER = "100 116"; // centre of the main dial in the SVG
const SUBDIAL_CENTER = "100 144"; // centre of the hours sub-dial

// Settings from config/plan.toml (filled in by loadConfig).
const config = { title: "", blocks: [], limitMinutes: 180, limitMessage: "", backgroundVideo: "" };

// The current session. status is "idle", "running" or "paused".
const session = {
  status: "idle",
  block: "",
  initialNote: "",      // note written next to the block, before starting
  startedAt: null,      // ms timestamp when "Inicia" was pressed
  pauseStartedAt: null, // ms timestamp when the current pause began
  pausedMs: 0,          // total time of the pauses that have already ended
};

// The last finished session, shown as a summary (phase 2 will send it to Notion).
let lastSession = null;

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

function getPausedMs(now) {
  let paused = session.pausedMs;
  if (session.status === "paused") {
    paused += now - session.pauseStartedAt;
  }
  return paused;
}

function getActiveMs(now) {
  if (session.status === "idle") {
    return 0;
  }
  return now - session.startedAt - getPausedMs(now);
}

// Time to display: the running session, or the last finished one.
function getShownMs(now) {
  if (session.status === "idle" && lastSession) {
    return lastSession.activeMs;
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

  lastSession = null;
  ui("extra-note-input").value = "";
  askNotificationPermission();
  render();
}

function pauseSession() {
  if (session.status !== "running") {
    return;
  }
  session.status = "paused";
  session.pauseStartedAt = Date.now();
  render();
}

function resumeSession() {
  if (session.status !== "paused") {
    return;
  }
  session.pausedMs += Date.now() - session.pauseStartedAt;
  session.pauseStartedAt = null;
  session.status = "running";
  render();
}

// Stops the session. If it was stopped by the 3 h limit, the end time is
// the exact moment the limit was reached (the tab may have been asleep).
function stopSession(reachedLimit) {
  if (session.status === "idle") {
    return;
  }
  const now = Date.now();
  if (session.status === "paused") {
    session.pausedMs += now - session.pauseStartedAt;
  }
  const endedAt = reachedLimit ? session.startedAt + session.pausedMs + getLimitMs() : now;

  lastSession = {
    block: session.block,
    initialNote: session.initialNote,
    startedAt: session.startedAt,
    endedAt: endedAt,
    activeMs: endedAt - session.startedAt - session.pausedMs,
    pauseMinutes: Math.round(session.pausedMs / 60000),
    reachedLimit: reachedLimit,
  };

  session.status = "idle";
  session.startedAt = null;
  session.pauseStartedAt = null;
  session.pausedMs = 0;
  ui("initial-note-input").value = "";

  if (reachedLimit) {
    notifyLimitReached();
  }
  render();
}

// One action that starts, pauses or resumes depending on the state.
function toggleSession() {
  if (session.status === "idle" && !blockSelect.value) {
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
  if (session.status === "idle") {
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
  renderSummary(status);

  setAttr(ui("timer-card"), "data-status", status);
  setAttr(document.body, "data-status", status);
}

function renderStatusTexts(status, now) {
  const stateNames = { idle: "Aturat", running: "En marxa", paused: "EN PAUSA" };
  setText("card-state", stateNames[status]);

  if (status === "idle") {
    const block = blockSelect.value;
    setText("card-block", lastSession ? lastSession.block : block || "—");
    setText("card-initial-note", lastSession ? lastSession.initialNote : "");
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
  const isActive = status !== "idle";
  const primaryLabels = { idle: "Inicia", running: "Pausa", paused: "Reprèn" };

  setText("primary-label", primaryLabels[status]);
  setDisabled(ui("primary-button"), !isActive && !hasBlock);
  setDisabled(ui("stop-button"), !isActive);

  // Only one session at a time: block and initial note are locked while active.
  blockSelect.setDisabled(isActive);
  setDisabled(ui("initial-note-input"), isActive);

  const toggle = ui("work-toggle");
  setDisabled(toggle, !isActive && !hasBlock);
  setAttr(toggle, "aria-checked", String(status === "running"));
  const toggleLabels = { idle: "Inactiu", running: "Mode treball", paused: "En pausa" };
  setText("work-toggle-label", toggleLabels[status]);
}

function renderSummary(status) {
  const showSummary = status === "idle" && lastSession !== null;
  setHidden(ui("summary"), !showSummary);
  setHidden(ui("limit-message"), !(showSummary && lastSession.reachedLimit));

  if (!showSummary) {
    return;
  }
  setText("limit-message", config.limitMessage);
  const range = `${formatClockTime(lastSession.startedAt)}–${formatClockTime(lastSession.endedAt)}`;
  const finalNote = buildFinalNote(lastSession.initialNote, ui("extra-note-input").value);
  let summary =
    `Sessió acabada: ${formatDuration(lastSession.activeMs)} de treball (${range}), ` +
    `${lastSession.pauseMinutes} min de pausa.`;
  if (finalNote) {
    summary += `\nNota: ${finalNote}`;
  }
  setText("summary", summary);
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

async function loadNotionStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    setText("notion-status", status.message);
    ui("notion-status").dataset.connected = String(status.connected);
  } catch {
    setText("notion-status", "No s'ha pogut comprovar la connexió amb Notion.");
    ui("notion-status").dataset.connected = "false";
  }
}

function toggleExtraNote() {
  const noteInput = ui("extra-note-input");
  noteInput.hidden = !noteInput.hidden;
  setText("note-button", noteInput.hidden ? "Afegeix a la nota" : "Amaga la nota");
  if (!noteInput.hidden) {
    noteInput.focus();
  }
}

function connectEvents() {
  ui("primary-button").addEventListener("click", toggleSession);
  ui("work-toggle").addEventListener("click", toggleSession);
  ui("pusher-start").addEventListener("click", toggleSession);
  ui("stop-button").addEventListener("click", requestStop);
  ui("pusher-stop").addEventListener("click", requestStop);
  ui("note-button").addEventListener("click", toggleExtraNote);
}

async function init() {
  blockSelect = createGlassSelect(ui("block-select"), {
    placeholder: "Tria un bloc…",
    label: "Bloc",
    onChange: render,
  });
  connectEvents();
  buildMinuteTicks();
  try {
    await loadConfig();
  } catch {
    setText("status-line", "No s'ha pogut llegir la configuració (config/plan.toml).");
    return;
  }
  buildHourTicks();
  setUpBackgroundVideo();
  render();
  setInterval(tick, TICK_MS);
  requestAnimationFrame(animateClock);
  loadNotionStatus();
}

init();
