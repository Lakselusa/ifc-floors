# Working on IFC Floors

A Trimble Connect 3D viewer extension that filters loaded IFC models down to a single
building storey. It runs in an iframe inside Trimble Connect and talks to the viewer
through `trimble-connect-workspace-api`.

## The seam

Keep viewer calls out of the logic:

- `src/floors.ts` — pure. Clusters storeys into levels. Every rule here is unit tested.
- `src/workspace.ts` — every call to the viewer API. Nothing else talks to Trimble.
- `src/main.ts` — UI wiring only.
- `src/diagnose.ts` — the probe (see below).

The viewer's selection is the single source of truth for what is ticked. The panel
reflects it rather than keeping its own list, which is what lets an object picked in the
3D view show its floor as partly ticked.

## Before writing any viewer API call

Read `docs/trimble-connect-notes.md`. It records how the API *behaves*, which the type
definitions do not tell you: which calls return nothing rather than erroring, which throw,
which strings are case sensitive, and which units each value arrives in. Every entry there
cost a round trip through a real model to learn.

## Answering a question about the API

The type definitions describe shape, not behaviour. When behaviour is unknown, extend the
probe in `src/diagnose.ts` to print what the call actually returns, ship it, and have the
user run it against a real model. Guessing from `.d.ts` has been wrong more often than
right here.

The probe is also the answer to "why did this model behave strangely" — it reports on
whatever the user has selected in the viewer.

## Verifying a change

`npm test` covers `src/floors.ts` and needs Node 24, which strips TypeScript natively.

Viewer behaviour cannot be tested locally at all. Opening the page outside an iframe falls
back to `src/mock.ts`, which exercises the UI but not the API. Confirming anything real
means: push, wait about a minute for Pages, and ask the user to reload Trimble with
Ctrl+F5 and report what they see. Say plainly that a change is unverified until they have.

## Shipping

`main` deploys to the site root, `dev` to `/dev/`. Both are live extensions the user may
have registered in Trimble, so treat a push to either as publishing.

Branch and open a pull request; see `CONTRIBUTING.md` for the human workflow.
