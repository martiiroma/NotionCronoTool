// NotionCronoTool - phase 1: local stopwatch (nothing is sent to Notion yet).
//
// Key idea: we never count seconds one by one. We store the moment the
// session started and the total paused time, and compute the active time
// from the real clock. Browsers slow down timers in hidden tabs, so counting
// ticks would drift; reading the clock never does.

const TICK_MS = 250;

// Settings from config/plan.toml (filled in by loadConfig).
const config = { title: "", blocks: [], limitMinutes: 180, limitMessage: "" };

// The current session. status is "idle", "running" or "paused".
const session = {
  status: "idle",
  block: "",
  description: "",
  startedAt: null,      // ms timestamp when "Inicia" was pressed
  pauseStartedAt: null, // ms timestamp when the current pause began
  pausedMs: 0,          // total time of the pauses that have already ended
};

// The last finished session, shown as a summary (phase 2 will send it to Notion).
let lastSession = null;

// Shortcut to get page elements by id.
const ui = (id) => document.getElementById(id);

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

// ---------- Session actions ----------

function startSession() {
  if (session.status !== "idle" || !ui("block-select").value) {
    return;
  }
  session.status = "running";
  session.block = ui("block-select").value;
  session.description = ui("description-input").value.trim();
  session.startedAt = Date.now();
  session.pauseStartedAt = null;
  session.pausedMs = 0;

  lastSession = null;
  ui("note-input").value = "";
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
    description: session.description,
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
  ui("description-input").value = "";

  if (reachedLimit) {
    notifyLimitReached();
  }
  render();
}

// One button that starts, pauses or resumes depending on the state.
function toggleSession() {
  if (session.status === "idle") {
    startSession();
  } else if (session.status === "running") {
    pauseSession();
  } else {
    resumeSession();
  }
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
  const hasBlock = Boolean(ui("block-select").value);

  // Time shown: the running session, or the last finished one.
  const shownMs = status === "idle" && lastSession ? lastSession.activeMs : getActiveMs(now);
  ui("elapsed").textContent = formatDuration(shownMs);

  renderStatusTexts(status, now);
  renderControls(status, hasBlock);
  renderSummary(status);

  ui("timer-card").dataset.status = status;
  document.body.dataset.status = status;
}

function renderStatusTexts(status, now) {
  const stateNames = { idle: "Aturat", running: "En marxa", paused: "EN PAUSA" };
  ui("card-state").textContent = stateNames[status];

  if (status === "idle") {
    const block = ui("block-select").value;
    ui("card-block").textContent = lastSession ? lastSession.block : block || "—";
    ui("status-line").textContent = block ? `${block} · a punt per començar` : "Tria un bloc per començar";
    document.title = "NotionCronoTool";
    return;
  }

  ui("card-block").textContent = session.block;
  const since = formatClockTime(session.startedAt);
  ui("status-line").textContent = status === "running"
    ? `${session.block} · en marxa des de les ${since}`
    : `${session.block} · en pausa`;

  // The tab title shows the time, useful when the tab is in the background.
  const prefix = status === "paused" ? "⏸ " : "";
  document.title = `${prefix}${formatDuration(getActiveMs(now))} · ${session.block}`;
}

function renderControls(status, hasBlock) {
  const isActive = status !== "idle";
  const primaryLabels = { idle: "▶ Inicia", running: "⏸ Pausa", paused: "▶ Reprèn" };

  ui("primary-button").textContent = primaryLabels[status];
  ui("primary-button").disabled = !isActive && !hasBlock;
  ui("stop-button").disabled = !isActive;

  // Only one session at a time: block and description are locked while active.
  ui("block-select").disabled = isActive;
  ui("description-input").disabled = isActive;

  const toggle = ui("work-toggle");
  toggle.disabled = !isActive && !hasBlock;
  toggle.setAttribute("aria-checked", String(status === "running"));
  const toggleLabels = { idle: "Mode treball", running: "Mode treball", paused: "En pausa" };
  ui("work-toggle-label").textContent = toggleLabels[status];
}

function renderSummary(status) {
  const showSummary = status === "idle" && lastSession !== null;
  ui("summary").hidden = !showSummary;
  ui("limit-message").hidden = !(showSummary && lastSession.reachedLimit);

  if (!showSummary) {
    return;
  }
  ui("limit-message").textContent = config.limitMessage;
  const range = `${formatClockTime(lastSession.startedAt)}–${formatClockTime(lastSession.endedAt)}`;
  ui("summary").textContent =
    `Sessió acabada: ${formatDuration(lastSession.activeMs)} de treball (${range}), ` +
    `${lastSession.pauseMinutes} min de pausa.`;
}

// Runs several times per second: refreshes the time and checks the limit.
function tick() {
  if (session.status === "running" && getActiveMs(Date.now()) >= getLimitMs()) {
    stopSession(true);
    return;
  }
  render();
}

// ---------- Start-up ----------

async function loadConfig() {
  const response = await fetch("/api/config");
  Object.assign(config, await response.json());

  ui("title").textContent = config.title;
  for (const block of config.blocks) {
    const option = document.createElement("option");
    option.value = block;
    option.textContent = block;
    ui("block-select").append(option);
  }
}

async function loadNotionStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    ui("notion-status").textContent = status.message;
    ui("notion-status").dataset.connected = String(status.connected);
  } catch {
    ui("notion-status").textContent = "No s'ha pogut comprovar la connexió amb Notion.";
  }
}

function connectEvents() {
  ui("primary-button").addEventListener("click", toggleSession);
  ui("work-toggle").addEventListener("click", toggleSession);
  ui("stop-button").addEventListener("click", () => stopSession(false));
  ui("block-select").addEventListener("change", render);
  ui("note-button").addEventListener("click", () => {
    ui("note-input").hidden = !ui("note-input").hidden;
    if (!ui("note-input").hidden) {
      ui("note-input").focus();
    }
  });
}

async function init() {
  connectEvents();
  try {
    await loadConfig();
  } catch {
    ui("status-line").textContent = "No s'ha pogut llegir la configuració (config/plan.toml).";
    return;
  }
  render();
  setInterval(tick, TICK_MS);
  loadNotionStatus();
}

init();
