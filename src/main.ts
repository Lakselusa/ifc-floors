import { groupStoreysIntoLevels, objectIdsByModel, formatElevation, type Level, type Storey } from "./floors.ts";
import {
  connectToViewer,
  scanStoreys,
  readSelection,
  addToSelection,
  removeFromSelection,
  clearSelection,
  showOnly,
  showAll,
  type Selection,
  type Viewer,
} from "./workspace.ts";
import { mockStoreys } from "./mock.ts";
import { diagnose } from "./diagnose.ts";

const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const levelsEl = document.querySelector<HTMLUListElement>("#levels")!;
const reportEl = document.querySelector<HTMLTextAreaElement>("#report")!;
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh")!;
const isolateBtn = document.querySelector<HTMLButtonElement>("#isolate")!;
const resetBtn = document.querySelector<HTMLButtonElement>("#reset")!;
const diagnoseBtn = document.querySelector<HTMLButtonElement>("#diagnose")!;
const heightsBtn = document.querySelector<HTMLButtonElement>("#heights")!;

const HEIGHTS_KEY = "ifc-floors.showHeights";

/** Null when running standalone in a browser tab rather than inside Trimble Connect. */
let viewer: Viewer | null = null;
let levels: Level[] = [];
/** The levels in the order they appear on screen: top floor first, as on a section. */
let displayed: Level[] = [];
/**
 * Which level each object belongs to, per model. Built once per scan so that working out
 * how much of a floor is selected stays cheap on models with tens of thousands of objects.
 */
let owners = new Map<string, Map<number, string>>();
/** What the viewer currently has selected. The panel reflects this; it does not own it. */
let selection: Selection = new Map();
/** How many of each level's objects are in that selection. */
let selectedPerLevel = new Map<string, number>();
/** Anchor for shift-clicking a range, in display order. */
let anchor: number | null = null;
let showHeights = readStoredHeights();

function readStoredHeights(): boolean {
  try {
    return localStorage.getItem(HEIGHTS_KEY) === "true";
  } catch {
    return false; // private windows and blocked storage
  }
}

function setStatus(message: string): void {
  statusEl.textContent = message;
  statusEl.hidden = message === "";
}

type Fill = "none" | "some" | "all";

function fillOf(level: Level): Fill {
  const selected = selectedPerLevel.get(level.id) ?? 0;
  if (selected === 0) return "none";
  return selected >= level.objectCount ? "all" : "some";
}

function totalSelected(): number {
  let total = 0;
  for (const ids of selection.values()) total += ids.size;
  return total;
}

function render(): void {
  displayed = [...levels].reverse();
  levelsEl.replaceChildren(...displayed.map(buildRow));
  heightsBtn.setAttribute("aria-pressed", String(showHeights));
}

function buildRow(level: Level, index: number): HTMLLIElement {
  const fill = fillOf(level);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = fill === "all";
  checkbox.indeterminate = fill === "some";
  checkbox.tabIndex = -1;

  const name = document.createElement("span");
  name.className = "level-name";
  name.textContent = level.name;

  const meta = document.createElement("span");
  meta.className = "level-meta";
  const models = new Set(level.storeys.map((storey) => storey.modelName));
  meta.textContent =
    fill === "some"
      ? `${selectedPerLevel.get(level.id)} of ${level.objectCount} selected`
      : `${models.size} model${models.size === 1 ? "" : "s"} · ${level.objectCount} objects`;

  const label = document.createElement("label");
  label.append(checkbox, name);
  if (showHeights) {
    const height = document.createElement("span");
    height.className = "level-height";
    height.textContent = formatElevation(level.elevation);
    label.append(height);
  }
  label.append(meta);

  const row = document.createElement("li");
  row.append(label);
  // The checkbox is drawn from the viewer's selection rather than toggling itself, so a
  // shift-click can set a whole range without fighting the browser.
  row.addEventListener("click", (event) => {
    event.preventDefault();
    void onRowClick(index, event.shiftKey);
  });
  return row;
}

/**
 * Clicking a floor selects all of it, unless it is already fully selected, in which case
 * it deselects it. A partly selected floor — which is what you get after clicking a single
 * object in the viewer — fills up rather than emptying, so a second click completes it.
 */
async function onRowClick(index: number, extend: boolean): Promise<void> {
  const level = displayed[index];
  if (!level || !viewer) return;

  let chosen: Level[];
  let add: boolean;
  if (extend && anchor !== null) {
    const from = Math.min(anchor, index);
    const to = Math.max(anchor, index);
    chosen = displayed.slice(from, to + 1);
    add = true;
  } else {
    chosen = [level];
    add = fillOf(level) !== "all";
    anchor = index;
  }

  const byModel = objectIdsByModel(chosen);
  if (add) await addToSelection(viewer, byModel);
  else await removeFromSelection(viewer, byModel);
  await refreshSelection();
}

/** Re-reads the viewer's selection and redraws the ticks to match. */
async function refreshSelection(): Promise<void> {
  if (!viewer) return;
  selection = await readSelection(viewer);
  recount();
  render();

  const total = totalSelected();
  let placed = 0;
  for (const count of selectedPerLevel.values()) placed += count;

  if (total === 0) {
    setStatus("");
  } else if (placed === total) {
    setStatus(`${total} objects selected.`);
  } else {
    setStatus(`${total} selected — ${total - placed} of them belong to no floor.`);
  }
}

function recount(): void {
  selectedPerLevel = new Map();
  for (const [modelId, ids] of selection) {
    const ownersForModel = owners.get(modelId);
    if (!ownersForModel) continue;
    for (const id of ids) {
      const levelId = ownersForModel.get(id);
      if (levelId === undefined) continue;
      selectedPerLevel.set(levelId, (selectedPerLevel.get(levelId) ?? 0) + 1);
    }
  }
}

function loadStoreys(storeys: Storey[]): void {
  levels = groupStoreysIntoLevels(storeys);
  owners = new Map();
  for (const level of levels) {
    for (const storey of level.storeys) {
      let ownersForModel = owners.get(storey.modelId);
      if (!ownersForModel) {
        ownersForModel = new Map();
        owners.set(storey.modelId, ownersForModel);
      }
      for (const id of storey.objectRuntimeIds) ownersForModel.set(id, level.id);
    }
  }
  anchor = null;
  reportEl.hidden = true;
  levelsEl.hidden = false;
  recount();
  render();
  if (levels.length === 0) setStatus("No IfcBuildingStorey objects found in the loaded models.");
}

async function scan(): Promise<void> {
  if (!viewer) return;
  setStatus("Scanning loaded models…");
  try {
    loadStoreys(await scanStoreys(viewer));
    await refreshSelection();
  } catch (error) {
    setStatus(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Both handlers below wait for the viewer to settle. Loading a model fires several state
 * events in a row, and dragging a selection box fires one per object.
 */
let rescanTimer: number | undefined;
function scheduleRescan(): void {
  window.clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(() => void scan(), 750);
}

let selectionTimer: number | undefined;
function scheduleSelectionRefresh(): void {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(() => void refreshSelection(), 150);
}

refreshBtn.addEventListener("click", () => void scan());

isolateBtn.addEventListener("click", () => {
  if (totalSelected() === 0) {
    setStatus("Select a floor, or an object in the model, first.");
    return;
  }
  if (viewer) void showOnly(viewer, selection);
});

resetBtn.addEventListener("click", () => {
  reportEl.hidden = true;
  levelsEl.hidden = false;
  anchor = null;
  setStatus("");
  const live = viewer;
  if (!live) return;
  void (async () => {
    await showAll(live);
    await clearSelection(live);
    await refreshSelection();
  })();
});

heightsBtn.addEventListener("click", () => {
  showHeights = !showHeights;
  try {
    localStorage.setItem(HEIGHTS_KEY, String(showHeights));
  } catch {
    // Not worth bothering the user about; the toggle still works for this session.
  }
  render();
});

diagnoseBtn.addEventListener("click", async () => {
  if (!viewer) {
    setStatus("Diagnose only works inside Trimble Connect.");
    return;
  }
  setStatus("Probing the viewer API…");
  reportEl.value = await diagnose(viewer);
  reportEl.hidden = false;
  levelsEl.hidden = true;
  reportEl.select();
  setStatus("Report below is selected — press Ctrl+C to copy it.");
});

async function start(): Promise<void> {
  if (window.parent === window) {
    loadStoreys(mockStoreys);
    setStatus("Standalone preview — showing mock floors, not a live model.");
    return;
  }
  try {
    viewer = await connectToViewer((name) => {
      if (name === "viewer.onModelStateChanged" || name === "viewer.onModelReset") scheduleRescan();
      if (name === "viewer.onSelectionChanged") scheduleSelectionRefresh();
    });
    await scan();
  } catch (error) {
    setStatus(`Could not reach Trimble Connect: ${error instanceof Error ? error.message : String(error)}`);
  }
}

void start();
