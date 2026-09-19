# Trimble Connect extension notes

Sources: `trimble-connect-workspace-api` npm package v0.3.34 (type definitions, checked 2026-09-19) and the
[Workspace API docs](https://components.connect.trimble.com/trimble-connect-workspace-api/index.html).
The 3D Viewer docs site (3d.connect.trimble.com) and docs.connect.trimble.com were not reachable/were behind a login when this was written.

## How an extension works
- A web page hosted at an HTTPS URL, loaded in an iframe by Trimble Connect.
- Described by a JSON manifest. The manifest URL must be CORS-enabled.
- Talks to Trimble Connect via `window.postMessage`, wrapped by the Workspace API.

## Manifest
```json
{
  "url": "https://your.host/index.html",
  "title": "Selection Inspector",
  "icon": "https://your.host/icon.png",
  "description": "Shows properties of selected 3D objects",
  "extensionType": ["3dviewer"]
}
```
`extensionType`: `"project"`, `"3dviewer"`, or both (then use `API.extension.getHost()` to tell them apart).

## Installing
Project Settings -> Apps & Capabilities -> Add Custom -> paste the manifest URL.

## Connecting
The IIFE build defines the global `TrimbleConnectWorkspace`:
```js
const API = await TrimbleConnectWorkspace.connect(window.parent, (event, data) => { ... });
```

## Selection and properties (ViewerAPI)
- Event `"viewer.onSelectionChanged"` -> `data` is `Selection` = `ModelObjectIds[]`.
- `API.viewer.getSelection(): Promise<Selection>`
- `ModelObjectIds = { modelId: string, objectRuntimeIds?: number[] }`
- `API.viewer.getObjectProperties(modelId, objectRuntimeIds): Promise<ObjectProperties[]>`
- `ObjectProperties = { id, class?, product?, properties?: PropertySet[], color?, position? }`
- `PropertySet = { name?, properties?: { name, value: string | number, ... }[] }`
- `getProperties` is deprecated; use `getObjectProperties`.

## Viewer API for floor filtering (verified against v0.3.34 type definitions, 2026-09-19)
```ts
getModels(state?: "loaded" | "unloaded"): Promise<ModelSpec[]>   // ModelSpec = { id, versionId, name, state, type, placement? }
getObjects(selector?: ObjectSelector, objectState?: ObjectState): Promise<ModelObjects[]>
getObjectProperties(modelId, objectRuntimeIds: number[]): Promise<ObjectProperties[]>
getHierarchyChildren(modelId, entityIds: number[], hierarchyType?: HierarchyType, recursive?: boolean): Promise<HierarchyEntity[]>
getHierarchyParents(modelId, entityIds: number[], hierarchyType?, recursive?, containedOnly?): Promise<HierarchyEntity[]>
setObjectState(selector: ObjectSelector | undefined, objectState: ObjectState): Promise<void>
setSelection(selector, mode: "add" | "remove" | "set"): Promise<void>
isolateEntities(modelEntities: IModelEntities[]): Promise<boolean>

ObjectSelector = { modelObjectIds?: ModelObjectIds[]; selected?: boolean; parameter?: EntityParameter }
ModelObjectIds  = { modelId: string; objectRuntimeIds?: number[]; recursive?: boolean }
EntityParameter = { class?: string; ... }      // server-side filter by IFC class
ObjectState     = { visible?: boolean | "reset"; color?: ColorRGBA | HexColor | "reset" }
HierarchyEntity = { id: number; fileId: string; name: string }
HierarchyType   = { Unknown:0, SpatialHierarchy:1, SpatialContainment:2, Containment:3, ElementAssembly:4,
                    Group:5, System:6, Zone:7, VoidsElement:8, FillsElement:9, ConnectsPortToElement:10,
                    ConnectsPorts:11, ServicesBuildings:12, Positions:13 }
```
Notes:
- `ObjectProperties.position` is in **metres**; `ModelPlacement.position` is in **millimetres**.
- `getHierarchyChildren` returns a flat list, so call it one storey at a time if you need to
  know which storey each object belongs to.
- `getObjects` with `modelObjectIds: [{ modelId }]` and no runtime ids returns all objects of that model.

## Viewer API behaviour verified against a real model (ARK_Modell.ifc, 2026-09-20)
- `getModels()` returns **every file in the project** (68 in the test project), not just what is in
  the viewer. Filter with `getModels("loaded")`. Other states seen: `notAssimilated`, `assimilated`.
- `ModelSpec.versionId` is `undefined` for most files. Use `ModelSpec.id`.
- `getObjects({ modelObjectIds: [{ modelId }] })` with no `objectRuntimeIds` returns **0 objects**.
  It is a lookup by id, not a way to list a model's contents.
- `getObjects({ modelObjectIds: [{ modelId, recursive: true }] })` with no ids **throws**
  (`can't access property "push", S.objectRuntimeIds is undefined`).
- `getObjects({ parameter: { class: "IFCBUILDINGSTOREY" } })` is the way to find storeys. It searches
  all loaded models at once and returns `ModelObjects[]` already grouped by `modelId`.
- The class string is **case sensitive and all caps**. `"IfcBuildingStorey"`, `"BuildingStorey"` and
  `"IfcBuildingStorey.1"` all return 0 results.
