/**
 * Everything that talks to the Trimble Connect 3D viewer lives here, so that
 * `floors.ts` stays pure and testable and the UI never touches the API directly.
 */
import * as Workspace from "trimble-connect-workspace-api";
import type { Storey } from "./floors.ts";

export type Viewer = Awaited<ReturnType<typeof Workspace.connect>>;

/** Connects to the host Trimble Connect window. Only works inside the extension iframe. */
export async function connectToViewer(): Promise<Viewer> {
  return Workspace.connect(window.parent, () => {}, 30_000);
}

/**
 * The viewer matches this spelling only — "IfcBuildingStorey" returns nothing.
 * Verified against a real model through the Diagnose probe.
 */
const STOREY_CLASS = "IFCBUILDINGSTOREY";

/** Hierarchy types worth trying when looking for the objects inside a storey. */
const CONTAINMENT_TYPES = [2 /* SpatialContainment */, 1 /* SpatialHierarchy */, 3 /* Containment */];

/**
 * Finds every building storey in the loaded models, with the objects each one contains.
 *
 * Note that `getObjects` is a lookup, not a listing: called with a model id and no object
 * ids it returns nothing at all. The class filter is what actually searches, and it
 * searches every loaded model at once, returning results already grouped by model.
 */
export async function scanStoreys(viewer: Viewer): Promise<Storey[]> {
  const models = await viewer.viewer.getModels("loaded");
  const modelsById = new Map(models.map((model) => [model.id, model]));

  const found = await viewer.viewer.getObjects({ parameter: { class: STOREY_CLASS } });
  const storeys: Storey[] = [];

  for (const entry of found) {
    const model = modelsById.get(entry.modelId);
    if (!model) continue; // a model that is in the project but not in the viewer

    const storeyIds = (entry.objects ?? []).map((object) => object.id);
    if (storeyIds.length === 0) continue;

    const storeyProperties = await viewer.viewer.getObjectProperties(model.id, storeyIds);

    for (const storey of storeyProperties) {
      storeys.push({
        modelId: model.id,
        modelName: model.name,
        name: storey.product?.name ?? `Storey ${storey.id}`,
        elevation: readElevation(storey),
        objectRuntimeIds: await childrenOf(viewer, model.id, storey.id),
      });
    }
  }

  return storeys;
}

/**
 * Returns the objects sitting under a storey.
 *
 * Which hierarchy type holds that relationship varies between exports, so try the
 * likely ones in turn and take the first that yields anything. Asking one storey at a
 * time keeps the mapping unambiguous, since the API flattens its results.
 */
async function childrenOf(viewer: Viewer, modelId: string, storeyId: number): Promise<number[]> {
  for (const hierarchyType of CONTAINMENT_TYPES) {
    const children = await viewer.viewer.getHierarchyChildren(modelId, [storeyId], hierarchyType, true);
    if (children.length > 0) return children.map((child) => child.id);
  }
  return [];
}

/**
 * Reads a storey's height in millimetres.
 *
 * Prefers the object's viewer position because that is world space and therefore
 * already accounts for how each model is placed in the project — two models with
 * different internal origins still line up. Falls back to the IFC `Elevation`
 * property, which is relative to the building and so only comparable within one model.
 */
function readElevation(storey: { position?: { z?: number }; properties?: unknown }): number | null {
  const z = storey.position?.z;
  if (typeof z === "number" && Number.isFinite(z)) return z * 1000; // position is in metres

  const sets = (storey.properties ?? []) as {
    properties?: { name?: string; value?: string | number }[];
  }[];
  for (const set of sets) {
    for (const property of set.properties ?? []) {
      if (property.name?.toLowerCase() === "elevation") {
        const value = typeof property.value === "string" ? Number(property.value) : property.value;
        if (typeof value === "number" && Number.isFinite(value)) return value;
      }
    }
  }
  return null;
}

/** Hides everything, then shows only the given objects. */
export async function isolate(viewer: Viewer, byModel: Map<string, number[]>): Promise<void> {
  await viewer.viewer.setObjectState(undefined, { visible: false });
  const modelObjectIds = [...byModel.entries()].map(([modelId, objectRuntimeIds]) => ({
    modelId,
    objectRuntimeIds,
  }));
  if (modelObjectIds.length > 0) {
    await viewer.viewer.setObjectState({ modelObjectIds }, { visible: true });
  }
}

/** Restores the viewer's default visibility for every object. */
export async function showAll(viewer: Viewer): Promise<void> {
  await viewer.viewer.setObjectState(undefined, { visible: "reset" });
}
