/**
 * A probe that reports what the viewer API actually returns, so a scan that finds
 * nothing can be explained rather than guessed at.
 *
 * Every step is wrapped so one failing call still leaves the rest of the report
 * readable. The output is plain text, meant to be copied out of the panel.
 *
 * Already established by earlier runs, and worth not re-testing:
 * - getObjects with a model id but no object ids returns nothing; it is a lookup, not a listing.
 * - getObjects with `recursive: true` and no object ids throws.
 * - The class filter is the way to search, and wants "IFCBUILDINGSTOREY" in capitals.
 */
import type { Viewer } from "./workspace.ts";

const STOREY_CLASS = "IFCBUILDINGSTOREY";

export async function diagnose(viewer: Viewer): Promise<string> {
  const out: string[] = [];
  const say = (line: string) => out.push(line);
  const attempt = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      say(`${label}: THREW ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const api = viewer.viewer;
  let loaded: Awaited<ReturnType<typeof api.getModels>> = [];

  await attempt("getModels", async () => {
    const all = await api.getModels();
    loaded = await api.getModels("loaded");
    say(`${all.length} models in project, ${loaded.length} loaded in the viewer:`);
    for (const model of loaded) {
      say(`  ${model.name}  id=${model.id} versionId=${model.versionId} state=${model.state}`);
    }
  });

  // If something is selected, say everything we can about it. This is how to investigate
  // an object the scan never placed on a floor: select it in the viewer, then press
  // Diagnose, and the report shows what the model says it belongs to.
  await attempt("selected object", async () => {
    const current = await api.getSelection();
    const first = (current ?? []).find((entry) => (entry.objectRuntimeIds ?? []).length > 0);
    const objectId = first?.objectRuntimeIds?.[0];
    if (!first || objectId === undefined) {
      say("\nNothing selected in the viewer — select an object to have it examined here.");
      return;
    }
    say(`\n--- selected object ${objectId} in model ${first.modelId} ---`);
    const [properties] = await api.getObjectProperties(first.modelId, [objectId]);
    say(`  class=${properties?.class} product=${JSON.stringify(properties?.product)}`);
    say(`  position=${JSON.stringify(properties?.position)}`);
    say(`  property sets=${JSON.stringify((properties?.properties ?? []).map((set) => set.name))}`);
    for (const [label, type] of [["SpatialContainment", 2], ["SpatialHierarchy", 1], ["Containment", 3]] as const) {
      const parents = await api.getHierarchyParents(first.modelId, [objectId], type, true);
      say(`  parents via ${label}: ${JSON.stringify(parents)}`);
    }
  });

  const storeysByModel = new Map<string, number[]>();
  await attempt("class filter", async () => {
    const found = await api.getObjects({ parameter: { class: STOREY_CLASS } });
    say(`\nclass filter "${STOREY_CLASS}" -> ${found.length} model(s) with matches`);
    for (const entry of found) {
      const ids = (entry.objects ?? []).map((object) => object.id);
      storeysByModel.set(entry.modelId, ids);
      const known = loaded.find((model) => model.id === entry.modelId);
      say(`  modelId=${entry.modelId} (${known ? known.name : "NOT IN LOADED LIST"}) -> ${ids.length} storeys`);
    }
  });

  const [modelId, storeyIds] = [...storeysByModel.entries()][0] ?? [];
  if (!modelId || !storeyIds || storeyIds.length === 0) {
    say("\nNo storeys to probe further.");
    return out.join("\n");
  }

  // Do the storeys carry a usable name and height?
  await attempt("getObjectProperties", async () => {
    const properties = await api.getObjectProperties(modelId, storeyIds);
    say(`\ngetObjectProperties -> ${properties.length} results`);
    for (const storey of properties.slice(0, 3)) {
      say(`  id=${storey.id} class=${storey.class}`);
      say(`    product=${JSON.stringify(storey.product)}`);
      say(`    position=${JSON.stringify(storey.position)}`);
      say(`    property sets=${JSON.stringify((storey.properties ?? []).map((set) => set.name))}`);
      for (const set of storey.properties ?? []) {
        for (const property of set.properties ?? []) {
          if (/elev|height|niv|hoyd|høyd/i.test(property.name)) {
            say(`    height-ish property: ${set.name}.${property.name} = ${JSON.stringify(property.value)}`);
          }
        }
      }
    }
  });

  // How do we get at what is inside a storey?
  const storeyId = storeyIds[0]!;
  await attempt("getObjects recursive from storey", async () => {
    const nested = await api.getObjects({
      modelObjectIds: [{ modelId, objectRuntimeIds: [storeyId], recursive: true }],
    });
    const objects = nested.flatMap((entry) => entry.objects ?? []);
    say(`
getObjects recursive from storey ${storeyId} -> ${objects.length} objects`);
    say(`  first three: ${JSON.stringify(objects.slice(0, 3))}`);
  });
  say(`\nhierarchy children of storey ${storeyId}:`);
  for (const [name, type] of [["SpatialContainment", 2], ["SpatialHierarchy", 1], ["Containment", 3]] as const) {
    await attempt(`  ${name}`, async () => {
      const children = await api.getHierarchyChildren(modelId, [storeyId], type, true);
      say(`  ${name} (type ${type}) -> ${children.length} children`);
      if (children.length > 0) say(`    first three: ${JSON.stringify(children.slice(0, 3))}`);
    });
  }

  return out.join("\n");
}
