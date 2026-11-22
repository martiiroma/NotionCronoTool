// NotionCronoTool - weekly view: planned vs actual hours.
//
// Left: week navigation and a table per block (also the accessible
// "table view" of the chart). Right: the stopwatch dial shows one group
// (PM, Dades, Altres) at a time; each block is a slice with two arcs:
// outer and pale = planned, inner and stronger = actual.
// Uses ui, setText, setAttr, setHidden from app.js.

const SVG_NS = "http://www.w3.org/2000/svg";
const DIAL_X = 100;
const DIAL_Y = 116;
const PLANNED_RADIUS = 72;
const ACTUAL_RADIUS = 60;
const HIT_RADIUS = 66;        // invisible, wider ring that catches the mouse
const SEGMENT_GAP_DEG = 3;    // small gap between slices
const MAX_ARC_DEG = 359.99;   // an SVG arc cannot draw a full circle in one piece

let weekData = null;
let weekStart = "";           // Monday shown ("" = the current week)
let selectedGroup = "PM";
let selectedBlock = "";
let weekRequestNumber = 0;    // ignores old answers when changing week quickly

// ---------- Formatting ----------

function formatHours(hours) {
  const text = hours.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text} h`;
}

function formatDiff(hours) {
  if (Math.abs(hours) < 0.05) {
    return "0,0 h";
  }
  return `${hours > 0 ? "+" : "−"}${formatHours(Math.abs(hours))}`;
}

function diffClass(hours) {
  return hours >= -0.05 ? "is-ahead" : "is-behind";
}

// ---------- Switching between Home and Week ----------

function showView(view) {
  const isWeek = view === "week";
  setAttr(document.body, "data-view", view); // the CSS adapts the layout to each view
  setAttr(ui("tab-home"), "aria-selected", String(!isWeek));
  setAttr(ui("tab-week"), "aria-selected", String(isWeek));
  setHidden(ui("home-left"), isWeek);
  setHidden(ui("timer-card"), isWeek);
  setHidden(ui("week-left"), !isWeek);
  setHidden(ui("week-card"), !isWeek);
  if (isWeek) {
    loadWeek(weekStart);
  }
}

// ---------- Loading a week ----------

async function loadWeek(start) {
  const requestNumber = ++weekRequestNumber;
  showWeekMessage("Carregant la setmana…");
  try {
    const query = start ? `?start=${encodeURIComponent(start)}` : "";
    const response = await fetch(`/api/week${query}`);
    const result = await response.json();
    if (requestNumber !== weekRequestNumber) {
      return;
    }
    if (!response.ok) {
      showWeekMessage(result.message, "error");
      return;
    }
    weekData = result.week;
    weekStart = weekData.start;
    selectedBlock = "";
    showWeekMessage("");
    renderWeek();
  } catch {
    if (requestNumber === weekRequestNumber) {
      showWeekMessage("No s'ha pogut carregar la setmana. Comprova la connexió a internet.", "error");
    }
  }
}

function showWeekMessage(text, kind = "info") {
  setText("week-message", text);
  ui("week-message").dataset.kind = kind;
  setHidden(ui("week-message"), text === "");
}

// ---------- Drawing ----------

function renderWeek() {
  setText("week-range", weekData.rangeLabel);
  setText("week-type", weekData.weekType);
  setDisabled(ui("week-today"), weekData.isCurrentWeek);

  // The note line always keeps its space, so the layout never jumps.
  const incomplete = weekData.incompleteRows;
  let note = "";
  if (incomplete === 1) {
    note = "1 fila sense bloc o sense hores no s'ha sumat.";
  } else if (incomplete > 1) {
    note = `${incomplete} files sense bloc o sense hores no s'han sumat.`;
  }
  setText("week-incomplete", note);

  renderWeekTable();
  renderGroupTabs();
  renderDial();
  renderLegend();
}

function renderWeekTable() {
  const body = ui("week-table-body");
  body.replaceChildren();
  for (const group of weekData.groups) {
    if (group.blocks.length === 0) {
      continue;
    }
    const floorNote = group.floor ? ` · mín. ${formatHours(group.floor)}` : "";
    body.append(tableRow(group.name, floorNote, group.planned, group.actual, "is-group"));
    for (const row of group.blocks) {
      const note = row.unplanned ? " · sense previsió" : "";
      body.append(tableRow(row.block, note, row.planned, row.actual, ""));
    }
  }
}

function tableRow(name, note, planned, actual, className) {
  const row = document.createElement("tr");
  row.className = className;

  const nameCell = document.createElement("th");
  nameCell.scope = "row";
  nameCell.textContent = name;
  if (note) {
    const small = document.createElement("small");
    small.textContent = note;
    nameCell.append(small);
  }
  row.append(nameCell);

  const diff = actual - planned;
  for (const [text, cls] of [[formatHours(planned), ""], [formatHours(actual), ""], [formatDiff(diff), diffClass(diff)]]) {
    const cell = document.createElement("td");
    cell.textContent = text;
    cell.className = cls;
    row.append(cell);
  }
  return row;
}

function renderGroupTabs() {
  for (const tab of document.querySelectorAll(".group-tab")) {
    setAttr(tab, "aria-selected", String(tab.dataset.group === selectedGroup));
  }
}

function getSelectedGroup() {
  return weekData.groups.find((group) => group.name === selectedGroup) || weekData.groups[0];
}

function renderDial() {
  const group = getSelectedGroup();
  const layer = ui("week-segments");
  layer.replaceChildren();
  ui("week-card").dataset.group = group.name;

  // Faint full rings behind the slices.
  layer.append(svgCircle(PLANNED_RADIUS, "dial-track"), svgCircle(ACTUAL_RADIUS, "dial-track"));

  setText("week-center-main", `${formatHours(group.actual).replace(" h", "")} / ${formatHours(group.planned)}`);
  setText("week-center-sub", floorText(group));

  const slices = group.blocks.filter((block) => Math.max(block.planned, block.actual) > 0);
  const total = slices.reduce((sum, block) => sum + Math.max(block.planned, block.actual), 0);
  if (total === 0) {
    setText("week-center-sub", "Sense hores aquesta setmana");
    return;
  }

  const gap = slices.length > 1 ? SEGMENT_GAP_DEG : 0;
  let angle = 0;
  for (const block of slices) {
    const size = Math.max(block.planned, block.actual);
    const sweep = (360 * size) / total;
    const start = angle + gap / 2;
    const usable = Math.min(sweep - gap, MAX_ARC_DEG);
    const isSelected = block.block === selectedBlock;
    const stateClass = selectedBlock && !isSelected ? " is-dimmed" : isSelected ? " is-selected" : "";

    if (block.planned > 0) {
      layer.append(svgArc(PLANNED_RADIUS, start, start + usable * (block.planned / size), "dial-planned" + stateClass));
    }
    if (block.actual > 0) {
      layer.append(svgArc(ACTUAL_RADIUS, start, start + usable * (block.actual / size), "dial-actual" + stateClass));
    }
    layer.append(hitArea(block, start, start + usable));
    angle += sweep;
  }
}

function floorText(group) {
  if (!group.floor) {
    return "sense mínim";
  }
  if (group.actual >= group.floor) {
    return `mínim de ${formatHours(group.floor)} assolit ✓`;
  }
  return `falten ${formatHours(group.floor - group.actual)} per al mínim`;
}

// ---------- SVG helpers ----------

// Angles in degrees, clockwise from 12 o'clock, like a clock.
function pointAt(radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: DIAL_X + radius * Math.cos(radians), y: DIAL_Y + radius * Math.sin(radians) };
}

function arcPathData(radius, startDeg, endDeg) {
  const start = pointAt(radius, startDeg);
  const end = pointAt(radius, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function svgArc(radius, startDeg, endDeg, className) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", arcPathData(radius, startDeg, endDeg));
  path.setAttribute("class", className);
  return path;
}

function svgCircle(radius, className) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", DIAL_X);
  circle.setAttribute("cy", DIAL_Y);
  circle.setAttribute("r", radius);
  circle.setAttribute("class", className);
  return circle;
}

// ---------- Hover, tooltip and click ----------

// A wide invisible arc over the slice: easier to hit than the thin arcs.
function hitArea(block, startDeg, endDeg) {
  const area = svgArc(HIT_RADIUS, startDeg, endDeg, "dial-hit");
  area.setAttribute("tabindex", "0");
  area.setAttribute("role", "button");
  area.setAttribute("aria-label",
    `${block.block}: ${formatHours(block.actual)} reals de ${formatHours(block.planned)} previstes`);

  const middle = pointAt(HIT_RADIUS, (startDeg + endDeg) / 2);
  const show = () => showTooltip(block, middle);
  area.addEventListener("mouseenter", show);
  area.addEventListener("focus", show);
  area.addEventListener("mouseleave", hideTooltip);
  area.addEventListener("blur", hideTooltip);
  area.addEventListener("click", () => selectBlock(block.block));
  area.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectBlock(block.block);
    }
  });
  return area;
}

// The tooltip sits at the middle of the slice (same place for mouse and keyboard).
function showTooltip(block, point) {
  const svg = ui("week-dial");
  const svgPoint = svg.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const onScreen = svgPoint.matrixTransform(svg.getScreenCTM());
  const card = ui("week-card").getBoundingClientRect();

  const tooltip = ui("week-tooltip");
  tooltip.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = block.block;
  tooltip.append(name, document.createElement("br"),
    `${formatHours(block.actual)} de ${formatHours(block.planned)}`);
  tooltip.style.left = `${onScreen.x - card.left}px`;
  tooltip.style.top = `${onScreen.y - card.top}px`;
  setHidden(tooltip, false);
}

function hideTooltip() {
  setHidden(ui("week-tooltip"), true);
}

function selectBlock(blockName) {
  selectedBlock = selectedBlock === blockName ? "" : blockName; // a second click closes it
  renderDial();
  renderLegend();
}

function renderLegend() {
  const block = getSelectedGroup().blocks.find((item) => item.block === selectedBlock);
  setHidden(ui("week-legend"), !block);
  setHidden(ui("week-hint"), Boolean(block));
  if (!block) {
    return;
  }
  setText("legend-block", block.block);
  setText("legend-hours",
    `Previst ${formatHours(block.planned)} · Real ${formatHours(block.actual)} · ${formatDiff(block.actual - block.planned)}`);
  setText("legend-feeling", block.feeling
    ? `Sensació més habitual: ${block.feeling}`
    : "Sense sensacions registrades");
}

function selectGroup(name) {
  selectedGroup = name;
  selectedBlock = "";
  hideTooltip();
  if (weekData) {
    renderGroupTabs();
    renderDial();
    renderLegend();
  }
}

// ---------- Start-up ----------

function setUpWeekView() {
  ui("tab-home").addEventListener("click", () => showView("home"));
  ui("tab-week").addEventListener("click", () => showView("week"));
  ui("week-prev").addEventListener("click", () => weekData && loadWeek(weekData.previousStart));
  ui("week-next").addEventListener("click", () => weekData && loadWeek(weekData.nextStart));
  ui("week-today").addEventListener("click", () => loadWeek(""));
  for (const tab of document.querySelectorAll(".group-tab")) {
    tab.addEventListener("click", () => selectGroup(tab.dataset.group));
  }
}
