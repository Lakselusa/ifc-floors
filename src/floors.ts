/**
 * Pure logic for turning per-model IFC storeys into a single cross-model list of levels.
 *
 * The problem this solves: a concrete model and a pipe model of the same building each
 * carry their own IfcBuildingStorey objects. The names rarely match ("04 Floor" vs
 * "Level_4" vs "E4"), but the elevations nearly always do, give or take a few
 * millimetres. So we cluster on elevation and treat the names as labels only.
 */

/** One IfcBuildingStorey as it exists inside a single model. */
export interface Storey {
  modelId: string;
  modelName: string;
  /** Storey name as authored in that model. */
  name: string;
  /** Elevation in project units (millimetres in most IFC exports). Null if we could not read one. */
  elevation: number | null;
  /** Viewer runtime ids of every object belonging to this storey. */
  objectRuntimeIds: number[];
}

/** A storey elevation shared by one or more models — what the user ticks in the UI. */
export interface Level {
  /** Stable key for UI state. */
  id: string;
  /** Human label, e.g. "4. etasje". The height is kept separate so the UI can hide it. */
  name: string;
  /** Mean elevation of the cluster, or null for the unplaced bucket. */
  elevation: number | null;
  /** The per-model storeys that landed on this level. */
  storeys: Storey[];
  /** Total object count across all models on this level. */
  objectCount: number;
}

export interface GroupOptions {
  /**
   * How far apart two storeys' elevations can be and still count as the same level.
   * Default 500 — generous enough for a structural model measuring to top-of-slab
   * while an MEP model measures to finished floor.
   */
  toleranceMm?: number;
}

/**
 * Clusters storeys from any number of models into shared levels, ordered bottom to top.
 *
 * Storeys with no readable elevation are grouped by name instead and sorted last, so a
 * partially broken export still shows up in the UI rather than silently vanishing.
 */
export function groupStoreysIntoLevels(storeys: Storey[], options: GroupOptions = {}): Level[] {
  const tolerance = options.toleranceMm ?? 500;

  const placed = storeys.filter((s): s is Storey & { elevation: number } => s.elevation !== null);
  const unplaced = storeys.filter((s) => s.elevation === null);

  const sorted = [...placed].sort((a, b) => a.elevation - b.elevation);

  const clusters: (Storey & { elevation: number })[][] = [];
  for (const storey of sorted) {
    const current = clusters[clusters.length - 1];
    // Compare against the cluster's first member, not the previous storey, so a long
    // run of slightly-increasing elevations cannot drift into one giant cluster.
    if (current && storey.elevation - current[0]!.elevation <= tolerance) {
      current.push(storey);
    } else {
      clusters.push([storey]);
    }
  }

  const levels: Level[] = clusters.map((cluster) => {
    const elevation = mean(cluster.map((s) => s.elevation));
    return {
      id: `elev:${Math.round(elevation)}`,
      name: pickLabel(cluster),
      elevation,
      storeys: cluster,
      objectCount: countObjects(cluster),
    };
  });

  const byName = new Map<string, Storey[]>();
  for (const storey of unplaced) {
    const existing = byName.get(storey.name);
    if (existing) existing.push(storey);
    else byName.set(storey.name, [storey]);
  }
  for (const [name, cluster] of byName) {
    levels.push({
      id: `name:${name}`,
      name,
      elevation: null,
      storeys: cluster,
      objectCount: countObjects(cluster),
    });
  }

  return dedupeAcrossLevels(levels);
}

/**
 * Makes sure no object is counted on two floors.
 *
 * IFC lets an element be referenced by several storeys — a wall running through two
 * floors is the usual case — and the viewer reports it under each. Left alone, selecting
 * one floor marks its neighbours as partly selected too, which is baffling to look at.
 * Each object is therefore kept on the lowest floor that claims it and dropped from the
 * rest, so the floors partition the model rather than overlapping it.
 */
function dedupeAcrossLevels(levels: Level[]): Level[] {
  const seen = new Map<string, Set<number>>();
  return levels.map((level) => {
    const storeys = level.storeys.map((storey) => {
      let seenForModel = seen.get(storey.modelId);
      if (!seenForModel) {
        seenForModel = new Set<number>();
        seen.set(storey.modelId, seenForModel);
      }
      const objectRuntimeIds: number[] = [];
      for (const id of storey.objectRuntimeIds) {
        if (seenForModel.has(id)) continue;
        seenForModel.add(id);
        objectRuntimeIds.push(id);
      }
      return { ...storey, objectRuntimeIds };
    });
    return { ...level, storeys, objectCount: countObjects(storeys) };
  });
}

/**
 * Picks the display name for a cluster: the name used by the most models, ties broken
 * by whichever name is alphabetically first so the label does not jitter between runs.
 */
function pickLabel(cluster: Storey[]): string {
  const counts = new Map<string, number>();
  for (const storey of cluster) {
    counts.set(storey.name, (counts.get(storey.name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

function countObjects(cluster: Storey[]): number {
  return cluster.reduce((total, s) => total + s.objectRuntimeIds.length, 0);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Renders a height the way a drawing would, e.g. "+12000" or "-3500". */
export function formatElevation(mm: number | null): string {
  if (mm === null) return "no height";
  const sign = mm < 0 ? "-" : "+";
  return `${sign}${Math.abs(Math.round(mm))}`;
}

/** Flattens the selected levels into the per-model id lists the viewer API expects. */
export function objectIdsByModel(levels: Level[]): Map<string, number[]> {
  const byModel = new Map<string, number[]>();
  for (const level of levels) {
    for (const storey of level.storeys) {
      const existing = byModel.get(storey.modelId);
      if (existing) existing.push(...storey.objectRuntimeIds);
      else byModel.set(storey.modelId, [...storey.objectRuntimeIds]);
    }
  }
  return byModel;
}
