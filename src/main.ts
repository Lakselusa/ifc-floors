import { groupStoreysIntoLevels, objectIdsByModel, type Level, type Storey } from "./floors.ts";
import { connectToViewer, scanStoreys, isolate, showAll, type Viewer } from "./workspace.ts";
import { mockStoreys } from "./mock.ts";
import { diagnose } from "./diagnose.ts";

const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const levelsEl = document.querySelector<HTMLUListElement>("#levels")!;
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh")!;
const isolateBtn = document.querySelector<HTMLButtonElement>("#isolate")!;
const showAllBtn = document.querySelector<HTMLButtonElement>("#show-all")!;
const diagnoseBtn = document.querySelector<HTMLButtonElement>("#diagnose")!;
const reportEl = document.querySelector<HTMLTextAreaElement>("#report")!;

/** Null when running standalone in a browser tab rather than inside Trimble Connect. */
let viewer: Viewer | null = null;
let levels: Level[] = [];
const selected = new Set<string>();

function setStatus(message: string): void {
  statusEl.textContent = message;
  statusEl.hidden = message === "";
}

function render(): void {
  levelsEl.replaceChildren(
    // Top floor first: it matches how people read a building section.
    ...[...levels].reverse().map((level) => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(level.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selected.add(level.id);
        else selected.delete(level.id);
      });

      const name = document.createElement("span");
      name.className = "level-name";
      name.textContent = level.label;

      const meta = document.createElement("span");
      meta.className = "level-meta";
      const models = new Set(level.storeys.map((s) => s.modelName));
      meta.textContent = `${models.size} model${models.size === 1 ? "" : "s"} · ${level.objectCount} objects`;

      const label = document.createElement("label");
      label.append(checkbox, name, meta);

      const item = document.createElement("li");
      item.append(label);
      return item;
    }),
  );
}

async function loadStoreys(storeys: Storey[]): Promise<void> {
  levels = groupStoreysIntoLevels(storeys);
  selected.clear();
  render();
  setStatus(levels.length === 0 ? "No IfcBuildingStorey objects found in the loaded models." : "");
}

async function scan(): Promise<void> {
  if (!viewer) return;
  setStatus("Scanning loaded models…");
  try {
    await loadStoreys(await scanStoreys(viewer));
  } catch (error) {
    setStatus(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

refreshBtn.addEventListener("click", () => void scan());

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

isolateBtn.addEventListener("click", () => {
  const chosen = levels.filter((level) => selected.has(level.id));
  if (chosen.length === 0) {
    setStatus("Tick at least one floor first.");
    return;
  }
  const byModel = objectIdsByModel(chosen);
  if (!viewer) {
    setStatus(`Standalone mode: would isolate ${[...byModel.values()].flat().length} objects.`);
    return;
  }
  setStatus("");
  void isolate(viewer, byModel);
});

showAllBtn.addEventListener("click", () => {
  reportEl.hidden = true;
  levelsEl.hidden = false;
  selected.clear();
  render();
  setStatus("");
  if (viewer) void showAll(viewer);
});

async function start(): Promise<void> {
  if (window.parent === window) {
    // Opened directly in a browser tab — run on mock data so the UI is workable
    // without a Trimble Connect project.
    setStatus("Standalone preview — showing mock floors, not a live model.");
    await loadStoreys(mockStoreys);
    return;
  }
  try {
    viewer = await connectToViewer();
    await scan();
  } catch (error) {
    setStatus(`Could not reach Trimble Connect: ${error instanceof Error ? error.message : String(error)}`);
  }
}

void start();
