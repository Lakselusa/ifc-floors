import { groupStoreysIntoLevels, objectIdsByModel, formatElevation, type Level, type Storey } from "./floors.ts";
import {
  connectToViewer,
  scanStoreys,
  showOnly,
  select,
  clearSelection,
  showAll,
  type Viewer,
} from "./workspace.ts";
import { mockStoreys } from "./mock.ts";
import { diagnose } from "./diagnose.ts";

const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const levelsEl = document.querySelector<HTMLUListElement>("#levels")!;
const reportEl = document.querySelector<HTMLTextAreaElement>("#report")!;
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh")!;
const isolateBtn = document.querySelector<HTMLButtonElement>("#isolate")!;
const showAllBtn = document.querySelector<HTMLButtonElement>("#show-all")!;
const diagnoseBtn = document.querySelector<HTMLButtonElement>("#diagnose")!;
const heightsBtn = document.querySelector<HTMLButtonElement>("#heights")!;

const HEIGHTS_KEY = "ifc-floors.showHeights";

/** Null when running standalone in a browser tab rather than inside Trimble Connect. */
let viewer: Viewer | null = null;
let levels: Level[] = [];
/** The levels in the order they appear on screen: top floor first, as on a section. */
let displayed: Level[] = [];
const ticked = new Set<string>();
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

function render(): void {
  displayed = [...levels].reverse();
  levelsEl.replaceChildren(...displayed.map(buildRow));
  heightsBtn.setAttribute("aria-pressed", String(showHeights));
}

function buildRow(level: Level, index: number): HTMLLIElement {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = ticked.has(level.id);
  checkbox.tabIndex = -1;

  const name = document.createElement("span");
  name.className = "level-name";
  name.textContent = level.name;

  const meta = document.createElement("span");
  meta.className = "level-meta";
  const models = new Set(level.storeys.map((storey) => storey.modelName));
  meta.textContent = `${models.size} model${models.size === 1 ? "" : "s"} · ${level.objectCount} objects`;

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
  // The checkbox is drawn from our state rather than toggling itself, so that a
  // shift-click can set a whole range in one go without fighting the browser.
  row.addEventListener("click", (event) => {
    event.preventDefault();
    toggle(index, event.shiftKey);
  });
  return row;
}

function toggle(index: number, extend: boolean): void {
  if (extend && anchor !== null) {
    const from = Math.min(anchor, index);
    const to = Math.max(anchor, index);
    for (let i = from; i <= to; i++) ticked.add(displayed[i]!.id);
  } else {
    const id = displayed[index]!.id;
    if (ticked.has(id)) ticked.delete(id);
    else ticked.add(id);
    anchor = index;
  }
  render();
  void syncSelection();
}

/** The objects on the ticked floors, grouped per model. */
function tickedObjects(): { byModel: Map<string, number[]>; total: number } {
  const chosen = levels.filter((level) => ticked.has(level.id));
  const byModel = objectIdsByModel(chosen);
  const total = [...byModel.values()].reduce((sum, ids) => sum + ids.length, 0);
  return { byModel, total };
}

/** Ticking a floor selects its objects in the viewer — no separate button needed. */
async function syncSelection(): Promise<void> {
  const { byModel, total } = tickedObjects();
  const models = byModel.size;
  setStatus(
    total === 0
      ? ticked.size === 0
        ? ""
        : "Those floors contain no objects. Press Diagnose."
      : `${total} objects selected across ${models} model${models === 1 ? "" : "s"}.`,
  );
  if (!viewer) return;
  if (total === 0) await clearSelection(viewer);
  else await select(viewer, byModel);
}

function loadStoreys(storeys: Storey[]): void {
  levels = groupStoreysIntoLevels(storeys);
  // Keep ticks that still refer to a floor that exists, so loading a second model
  // does not throw away what the user had chosen.
  const alive = new Set(levels.map((level) => level.id));
  for (const id of [...ticked]) if (!alive.has(id)) ticked.delete(id);
  anchor = null;
  reportEl.hidden = true;
  levelsEl.hidden = false;
  render();
  if (levels.length === 0) setStatus("No IfcBuildingStorey objects found in the loaded models.");
  else void syncSelection();
}

async function scan(): Promise<void> {
  if (!viewer) return;
  setStatus("Scanning loaded models…");
  try {
    loadStoreys(await scanStoreys(viewer));
  } catch (error) {
    setStatus(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Rescans after the viewer settles.
 *
 * Loading a model fires several state events in quick succession, and scanning on each
 * one would mean several redundant passes over every model.
 */
let rescanTimer: number | undefined;
function scheduleRescan(): void {
  window.clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(() => void scan(), 750);
}

refreshBtn.addEventListener("click", () => void scan());

isolateBtn.addEventListener("click", () => {
  const { byModel, total } = tickedObjects();
  if (ticked.size === 0) {
    setStatus("Tick at least one floor first.");
    return;
  }
  if (total === 0) {
    setStatus("Those floors contain no objects, so there is nothing to show. Press Diagnose.");
    return;
  }
  if (viewer) void showOnly(viewer, byModel);
});

showAllBtn.addEventListener("click", () => {
  reportEl.hidden = true;
  levelsEl.hidden = false;
  ticked.clear();
  anchor = null;
  render();
  setStatus("");
  if (viewer) {
    void showAll(viewer);
    void clearSelection(viewer);
  }
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
    });
    await scan();
  } catch (error) {
    setStatus(`Could not reach Trimble Connect: ${error instanceof Error ? error.message : String(error)}`);
  }
}

void start();
