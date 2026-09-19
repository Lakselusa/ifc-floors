/**
 * A one-off probe that reports what the viewer API actually returns for the loaded
 * models, so we can see why a scan found nothing instead of guessing.
 *
 * Every step is wrapped so that one failing call still leaves the rest of the report
 * readable. The output is plain text, meant to be copied out of the panel.
 */
import type { Viewer } from "./workspace.ts";

const CLASS_SPELLINGS = ["IFCBUILDINGSTOREY", "IfcBuildingStorey", "IfcBuildingStorey.1", "BuildingStorey"];

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
    say(`getModels() -> ${all.length} models, getModels("loaded") -> ${loaded.length}`);
    for (const model of all) {
      say(`  name=${model.name} state=${model.state} type=${model.type}`);
      say(`    id=${model.id}`);
      say(`    versionId=${model.versionId}`);
    }
  });

  const model = loaded[0] ?? undefined;
  if (!model) {
    say("No loaded models — stopping here.");
    return out.join("\n");
  }
  say(`\n--- probing model: ${model.name} ---`);

  // Does a plain object listing carry the class field at all?
  let firstObjectId: number | undefined;
  const listings: [string, Parameters<typeof api.getObjects>[0]][] = [
    ["flat", { modelObjectIds: [{ modelId: model.id }] }],
    ["recursive", { modelObjectIds: [{ modelId: model.id, recursive: true }] }],
    ["by versionId", { modelObjectIds: [{ modelId: model.versionId }] }],
  ];
  for (const [label, selector] of listings) {
    await attempt(`getObjects ${label}`, async () => {
      const result = await api.getObjects(selector);
      const objects = result.flatMap((entry) => entry.objects ?? []);
      const withClass = objects.filter((object) => object.class !== undefined).length;
      say(`getObjects ${label} -> ${objects.length} objects, ${withClass} of them have a class`);
      say(`  first three raw: ${JSON.stringify(objects.slice(0, 3))}`);
      const classes = [...new Set(objects.map((object) => object.class))].slice(0, 25);
      say(`  distinct class values (max 25): ${JSON.stringify(classes)}`);
      firstObjectId ??= objects[0]?.id;
    });
  }

  // Can the viewer filter by class server-side instead?
  for (const spelling of CLASS_SPELLINGS) {
    await attempt(`class filter ${spelling}`, async () => {
      const result = await api.getObjects({ parameter: { class: spelling } });
      const objects = result.flatMap((entry) => entry.objects ?? []);
      say(`getObjects parameter.class="${spelling}" -> ${objects.length} objects`);
      if (objects.length > 0) say(`  ids: ${JSON.stringify(objects.slice(0, 8).map((o) => o.id))}`);
    });
  }

  // What does the spatial tree above a normal object look like?
  if (firstObjectId !== undefined) {
    say(`\n--- hierarchy above object ${firstObjectId} ---`);
    for (const [name, type] of [["SpatialHierarchy", 1], ["SpatialContainment", 2], ["Containment", 3]] as const) {
      await attempt(`parents ${name}`, async () => {
        const parents = await api.getHierarchyParents(model.id, [firstObjectId!], type, true);
        say(`getHierarchyParents ${name} -> ${JSON.stringify(parents)}`);
      });
    }
    await attempt("getObjectProperties", async () => {
      const [properties] = await api.getObjectProperties(model.id, [firstObjectId!]);
      say(`getObjectProperties -> class=${properties?.class} product=${JSON.stringify(properties?.product)}`);
      say(`  position=${JSON.stringify(properties?.position)}`);
      say(`  property sets: ${JSON.stringify((properties?.properties ?? []).map((set) => set.name))}`);
    });
  }

  return out.join("\n");
}
