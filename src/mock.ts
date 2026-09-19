/**
 * Stand-in storeys used when the page is opened outside Trimble Connect, so the UI
 * can be developed with `npm run dev` in a normal browser tab. Deliberately messy:
 * the two models disagree on naming and are a few millimetres apart, which is what
 * the grouping logic has to cope with in real projects.
 */
import type { Storey } from "./floors.ts";

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

export const mockStoreys: Storey[] = [
  { modelId: "concrete", modelName: "AR-Concrete.ifc", name: "01 Ground", elevation: 0, objectRuntimeIds: ids(100, 40) },
  { modelId: "pipes", modelName: "VVS-Pipes.ifc", name: "Level_1", elevation: 20, objectRuntimeIds: ids(900, 12) },
  { modelId: "concrete", modelName: "AR-Concrete.ifc", name: "02 Floor", elevation: 4000, objectRuntimeIds: ids(200, 38) },
  { modelId: "pipes", modelName: "VVS-Pipes.ifc", name: "Level_2", elevation: 4120, objectRuntimeIds: ids(920, 15) },
  { modelId: "concrete", modelName: "AR-Concrete.ifc", name: "03 Floor", elevation: 8000, objectRuntimeIds: ids(300, 36) },
  { modelId: "pipes", modelName: "VVS-Pipes.ifc", name: "Level_3", elevation: 8080, objectRuntimeIds: ids(940, 14) },
  { modelId: "concrete", modelName: "AR-Concrete.ifc", name: "04 Floor", elevation: 12000, objectRuntimeIds: ids(400, 35) },
  { modelId: "pipes", modelName: "VVS-Pipes.ifc", name: "Level_4", elevation: 12150, objectRuntimeIds: ids(960, 18) },
  { modelId: "concrete", modelName: "AR-Concrete.ifc", name: "Roof", elevation: null, objectRuntimeIds: ids(500, 9) },
];
