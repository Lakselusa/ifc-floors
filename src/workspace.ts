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

const STOREY_CLASS = "ifcbuildingstorey";

/**
 * Walks every loaded model and returns its building storeys with the ids of the
 * objects they contain.
 *
 * One pass per model: list the objects to find the storeys, read the storeys'
 * properties for name and elevation, then ask the spatial hierarchy which objects
 * sit under each storey.
 */
export async function scanStoreys(viewer: Viewer): Promise<Storey[]> {
  const models = await viewer.viewer.getModels("loaded");
  const storeys: Storey[] = [];

  for (const model of models) {
    const [modelObjects] = await viewer.viewer.getObjects({
      modelObjectIds: [{ modelId: model.id }],
    });
    const storeyIds = (modelObjects?.objects ?? [])
      .filter((object) => object.class?.toLowerCase() === STOREY_CLASS)
      .map((object) => object.id);

    if (storeyIds.length === 0) continue;

    const storeyProperties = await viewer.viewer.getObjectProperties(model.id, storeyIds);

    for (const storey of storeyProperties) {
      // getHierarchyChildren flattens results, so ask one storey at a time to keep
      // the mapping from storey to objects unambiguous. Models have few storeys.
      const children = await viewer.viewer.getHierarchyChildren(
        model.id,
        [storey.id],
        2 /* HierarchyType.SpatialContainment */,
        true /* recursive */,
      );

      storeys.push({
        modelId: model.id,
        modelName: model.name,
        name: storey.product?.name ?? `Storey ${storey.id}`,
        elevation: readElevation(storey),
        objectRuntimeIds: children.map((child) => child.id),
      });
    }
  }

  return storeys;
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
