import { test } from "node:test";
import assert from "node:assert/strict";
import { groupStoreysIntoLevels, objectIdsByModel, type Storey } from "./floors.ts";

function storey(modelId: string, name: string, elevation: number | null, ids: number[]): Storey {
  return { modelId, modelName: modelId, name, elevation, objectRuntimeIds: ids };
}

test("merges storeys from two models that sit at the same elevation", () => {
  const levels = groupStoreysIntoLevels([
    storey("concrete", "04 Floor", 12000, [1, 2]),
    storey("pipes", "Level_4", 12150, [7]),
    storey("concrete", "03 Floor", 8000, [3]),
  ]);

  assert.equal(levels.length, 2);
  assert.deepEqual(levels.map((l) => l.elevation), [8000, 12075]);
  assert.equal(levels[1]!.storeys.length, 2);
  assert.equal(levels[1]!.objectCount, 3);
});

test("keeps storeys apart when they are further apart than the tolerance", () => {
  const levels = groupStoreysIntoLevels(
    [storey("a", "L4", 12000, [1]), storey("b", "L4b", 12600, [2])],
    { toleranceMm: 500 },
  );
  assert.equal(levels.length, 2);
});

test("does not let a run of near-misses drift into one cluster", () => {
  const levels = groupStoreysIntoLevels(
    [
      storey("a", "x", 0, [1]),
      storey("b", "y", 400, [2]),
      storey("c", "z", 800, [3]),
    ],
    { toleranceMm: 500 },
  );
  assert.equal(levels.length, 2, "0 and 400 merge; 800 is beyond tolerance of the cluster start");
});

test("names a level after the name used by the most models", () => {
  const levels = groupStoreysIntoLevels([
    storey("a", "4. etasje", 12000, [1]),
    storey("b", "4. etasje", 12010, [2]),
    storey("c", "Level_4", 12020, [3]),
  ]);
  assert.equal(levels[0]!.name, "4. etasje");
});

test("buckets storeys with no elevation by name instead of dropping them", () => {
  const levels = groupStoreysIntoLevels([
    storey("a", "Roof", null, [9]),
    storey("b", "Roof", null, [10]),
    storey("c", "Ground", 0, [1]),
  ]);
  assert.equal(levels.length, 2);
  assert.equal(levels[1]!.elevation, null);
  assert.equal(levels[1]!.objectCount, 2);
});

test("keeps an object on the lowest floor that claims it, not on both", () => {
  // A wall running through two storeys is referenced by each of them.
  const levels = groupStoreysIntoLevels([
    storey("concrete", "L1", 0, [1, 2, 99]),
    storey("concrete", "L2", 4000, [3, 99]),
  ]);

  assert.deepEqual(levels[0]!.storeys[0]!.objectRuntimeIds, [1, 2, 99]);
  assert.deepEqual(levels[1]!.storeys[0]!.objectRuntimeIds, [3], "99 already belongs to L1");
  assert.equal(levels[0]!.objectCount, 3);
  assert.equal(levels[1]!.objectCount, 1);
});

test("does not deduplicate across different models", () => {
  // Runtime ids are only unique within a model, so the same number in two models is
  // two different objects.
  const levels = groupStoreysIntoLevels([
    storey("concrete", "L1", 0, [5]),
    storey("pipes", "L2", 4000, [5]),
  ]);
  assert.equal(levels[0]!.objectCount, 1);
  assert.equal(levels[1]!.objectCount, 1);
});

test("flattens selected levels into per-model id lists", () => {
  const levels = groupStoreysIntoLevels([
    storey("concrete", "L4", 12000, [1, 2]),
    storey("pipes", "L4", 12000, [7]),
  ]);
  const byModel = objectIdsByModel(levels);
  assert.deepEqual([...byModel.entries()], [["concrete", [1, 2]], ["pipes", [7]]]);
});
