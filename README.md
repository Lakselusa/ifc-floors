# IFC Floors

A Trimble Connect 3D viewer extension that filters one or more loaded IFC models down to a
single building storey. Load a concrete model and a pipe model, tick "4th floor", and see
only that level of both.

## The idea

Each model carries its own `IfcBuildingStorey` objects. Their names almost never match
between disciplines — `04 Floor` in the structural model, `Level_4` in the MEP model — but
their elevations do, give or take a few millimetres. So the app clusters storeys by
elevation, not by name, and shows one row per real floor of the building.

## Layout

| File | What it does |
| --- | --- |
| [src/floors.ts](src/floors.ts) | Pure grouping logic — no API calls, fully unit tested |
| [src/workspace.ts](src/workspace.ts) | All Trimble Connect viewer calls |
| [src/main.ts](src/main.ts) | UI wiring |
| [src/mock.ts](src/mock.ts) | Fake storeys for developing outside Trimble Connect |
| [public/manifest.json](public/manifest.json) | Extension manifest |

## Running it

```sh
npm install
npm run dev     # https://localhost:5173 — self-signed cert
npm test        # unit tests for the grouping logic
npm run build   # typecheck + production build into dist/
```

Opened directly in a browser tab, the app detects it is not in an iframe and renders
[mock storeys](src/mock.ts) so you can work on the UI without a project. Inside Trimble
Connect it connects to the real viewer.

## Installing it in Trimble Connect

1. Deploy `dist/` somewhere over HTTPS. The manifest URL must be CORS-enabled.
2. Edit [public/manifest.json](public/manifest.json) so `url` and `icon` point at that host.
3. In Trimble Connect: **Project Settings → Apps & Capabilities → Add Custom**, and paste
   the manifest URL.
4. Open the 3D viewer, load your models, and the extension appears in the side panel.

For dev against a live project you need a public HTTPS URL, so tunnel the dev server
(`ngrok http https://localhost:5173` or similar) and point the manifest at the tunnel.

## How the scan works

For every loaded model:

1. `getModels("loaded")` → the models in the viewer.
2. `getObjects({ modelObjectIds: [{ modelId }] })` → every object, filtered locally to
   those whose `class` is `IFCBUILDINGSTOREY`.
3. `getObjectProperties(modelId, storeyIds)` → each storey's name and elevation.
4. `getHierarchyChildren(modelId, [storeyId], SpatialContainment, true)` → the objects
   contained in that storey.

Isolating a floor is `setObjectState(undefined, { visible: false })` followed by
`setObjectState({ modelObjectIds }, { visible: true })`.

## Known rough edges

- **Elevation source.** The app prefers the storey's world-space `position.z` (which already
  accounts for how each model is placed in the project) and falls back to the IFC `Elevation`
  property, which is building-relative and only comparable within one model. If two models
  are placed differently and neither exposes a position, they will not line up.
- **Tolerance is fixed at 500 mm.** Enough for a structural model measuring to top-of-slab
  against an MEP model measuring to finished floor. It is a parameter in
  `groupStoreysIntoLevels` but is not yet exposed in the UI.
- **Step 2 lists every object in the model** to find the storeys. Fine for a prototype;
  for very large models, filtering server-side via `getObjects({ parameter: { class } })`
  would be faster, but the exact class string casing needs checking against a real model first.
- **Objects outside any storey** (site geometry, some linked elements) are hidden by an
  isolate and are not listed anywhere.
