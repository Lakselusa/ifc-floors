# Contributing

## Getting set up

You need Git and **Node 24**. The tests run TypeScript directly using a feature older Node
versions lack, so on Node 22 or below `npm test` fails with a confusing error while
everything else appears to work.

```sh
git clone https://github.com/Lakselusa/ifc-floors.git
cd ifc-floors
npm install
npm run dev
```

Open the HTTPS address it prints and accept the certificate warning — the certificate is
generated locally, so browsers do not recognise it.

Outside Trimble Connect the app detects it is not in an iframe and renders the mock
storeys in `src/mock.ts`. That covers the whole UI: the floor list, ticking, shift-ranges,
the heights toggle. Only the viewer API itself needs the real thing.

## The two environments

GitHub Pages serves one site per repository, so both environments share it:

| Branch | Where it lands | Manifest to register in Trimble |
| --- | --- | --- |
| `main` | `https://lakselusa.github.io/ifc-floors/` | `…/ifc-floors/manifest.json` |
| `dev` | `https://lakselusa.github.io/ifc-floors/dev/` | `…/ifc-floors/dev/manifest.json` |

The dev build is titled "IFC Floors (dev)" so the two are distinguishable in the side
panel when both are installed. Register the dev one in a sandbox project rather than a
live client project — a half-finished extension in a real project confuses people doing
real work.

Both branches are rebuilt on every deploy, whichever one was pushed, because publishing
replaces the whole site. A dev branch that fails to build is skipped and production still
deploys.

## Making a change

1. Branch off `main`.
2. Push and open a pull request. The tests and build run automatically.
3. Merge once they pass and someone has looked at it. Pages redeploys within a minute.

To try something in Trimble before it is merged, merge it into `dev` first and test
against the dev extension.

## Testing against a real model

`npm run dev` only serves on localhost, which Trimble's servers cannot reach, so a
localhost address can never be registered as an extension URL. Use the `dev` environment
instead.

## Investigating the viewer API

The API's type definitions describe the shape of each call, not its behaviour, and the
behaviour is frequently surprising — `getObjects` returns zero results rather than an
error when asked the wrong way, and the IFC class string is case sensitive.

`docs/trimble-connect-notes.md` records everything learned so far and is worth reading
before writing any viewer call. Each entry there cost a round trip through a real model.

When something is still unknown, extend the probe in `src/diagnose.ts` to print what the
call actually returns, deploy it to `dev`, and press **Diagnose** in the panel with a
relevant object selected. The report is selectable text, meant to be copied out. Add what
you learn to the notes file.

## Where things live

- `src/floors.ts` — the floor-clustering logic. Pure and unit tested; changes to the
  matching rules belong here and should come with a test.
- `src/workspace.ts` — every call to the viewer API.
- `src/main.ts` — UI wiring.
- `src/diagnose.ts` — the probe.
- `docs/trimble-connect-notes.md` — how the API actually behaves.
- `AGENTS.md` — the same ground rules, written for AI coding agents.
