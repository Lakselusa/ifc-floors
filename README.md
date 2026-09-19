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

## Hosting it on GitHub Pages

GitHub Pages works for this: it serves over HTTPS, it sends `Access-Control-Allow-Origin: *`
so Trimble Connect can fetch the manifest, and it sets no framing headers, so the page can be
loaded in Trimble's iframe.

[The workflow](.github/workflows/deploy.yml) builds on every push to `main`, runs the tests,
and publishes `dist/`. The site is built with relative asset paths (`base: "./"` in
[vite.config.ts](vite.config.ts)) so it works at any repo sub-path, and
[scripts/write-manifest.mjs](scripts/write-manifest.mjs) fills the real deployment URL into
the manifest during the build. Nothing needs the repo name hard-coded anywhere.

One-time setup:

1. Create a **public** repo on GitHub (Pages on private repos needs a paid plan).
2. `git remote add origin https://github.com/<user>/<repo>.git` then `git push -u origin main`.
3. On GitHub: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
4. Push, or run the workflow by hand from the Actions tab. When it finishes, the Actions
   summary shows the published URL.

Your manifest then lives at `https://<user>.github.io/<repo>/manifest.json`.

## Installing it in Trimble Connect

In Trimble Connect: **Project Settings -> Apps & Capabilities -> Add Custom**, and paste the
manifest URL above. Open the 3D viewer, load your models, and the extension appears in the
side panel.

The icon is an SVG. If Trimble Connect refuses to display it, drop a PNG into `public/` and
point the manifest's `icon` field at that instead.

## Developing against a live project

`npm run dev` only serves on localhost, which Trimble Connect cannot reach. For live testing
either tunnel the dev server (`ngrok http https://localhost:5173`) and register a second
manifest pointing at the tunnel, or just push and let Pages redeploy - the build takes about a
minute.

## How the scan works

1. `getModels("loaded")` — the models actually in the viewer. Note that `getModels()` with
   no argument returns every file in the project, which is not the same thing.
2. `getObjects({ parameter: { class: "IFCBUILDINGSTOREY" } })` — finds the storeys in every
   loaded model in one call, already grouped by model. The class string is case sensitive.
   Asking for a model's objects without giving object ids returns nothing, so this filter is
   the only way to search.
3. `getObjectProperties(modelId, storeyIds)` — each storey's name and height.
4. `getObjects({ modelObjectIds: [{ modelId, objectRuntimeIds: [storeyId], recursive: true }] })`
   — everything underneath that storey. The hierarchy API is kept as a fallback.

Ticking a floor selects its objects. **Show only selected** calls `isolateEntities`, which is
the viewer's own "Show only selected objects". **Show all** resets visibility and clears the
selection. The panel rescans itself when a model is loaded or unloaded.

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
