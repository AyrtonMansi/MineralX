# CLAUDE.md — MineralX

Guidance for AI agents working in this repository. Read this before writing
code. Where this file and the code disagree, the code is reality — but flag
the mismatch rather than silently following either.

## What this repo is

**Two apps share one Next.js project. Do not blend their conventions.**

1. **Corporate site** (`/` — `app/page.tsx`, `components/*.tsx`, `lib/content.ts`)
   Investor-grade marketing site for MineralX Resources, an Australian gold
   exploration company. TypeScript + Tailwind + Framer Motion. Stable;
   changes are rare and mostly copy edits.

2. **Field-geology workspace** (`/mineralx` — `app/mineralx/`,
   `components/mineralx/`, `app/api/`) The active product: a MapLibre-GL
   globe map where geologists manage rock-chip samples, drill holes, tenement
   boundaries, Queensland government (GeoResGlobe) reference layers, a
   terrain-hydrology targeting model, and an **exploration targeting cycle**
   (promote a scored candidate → track it through a status pipeline → export
   field waypoints → auto-link samples → assess against assays → model
   hit-rate; pure logic in `target-tasking.js` + `project-store.js`, worklist
   UI in the Data drawer's Targets tab). Plain JS/JSX + a hand-rolled CSS
   design system in `components/mineralx/mineralx.css` (earthy glass-morphism
   — do NOT use Tailwind classes inside `components/mineralx/`).

Stack: Next.js 14.2 App Router · React 18 · MapLibre GL v5 (globe projection)
· proj4 · `"type": "module"`. Hosted on Vercel; pushes to the working branch
auto-deploy a preview.

## Commands

```bash
npm run dev              # dev server (port 3000)
npm run build            # production build — must stay clean, zero warnings
npm run lint             # eslint — must stay clean
npm run test:unit        # node --test (test/*.test.js), no framework dep
npm run test:e2e         # Playwright (e2e/*.spec.js) — builds & starts prod itself
npm test                 # both
npm run verify:endpoints # checks GEORES/GA service URLs against live services
```

Environment gotchas (all three have burned real time — check here first):
- `next build` and `next dev` fight over `.next/`. If dev serves 404 chunks
  or wasm ENOENT errors after a build, `rm -rf .next` and restart dev.
- Playwright's webServer reuses anything already on port 3000. A stale
  manually-started server (without the debug env) makes every e2e test time
  out on `__mxMapLoaded`. Kill port 3000 (`fuser -k 3000/tcp`) before runs.
- In sandboxed dev environments, outbound to `*.qld.gov.au`,
  `services.ga.gov.au`, `arcgisonline.com`, and `*.vercel.app` may be
  blocked (proxy 403s). This is the environment, not the app. Never "fix" it
  by deleting mocks or endpoints; verify externally via
  `npm run verify:endpoints` from CI or a normal machine.

## Hard rules

These are settled decisions. Do not re-litigate or "improve" them without
being asked.

1. **Never silently reproject or guess a coordinate zone.** CSV imports with
   projected-magnitude easting/northing (`isProjectedCoord`) must stop and
   return `needsProjection: true`; conversion happens only after the user
   confirms the coordinate system + zone in the ZonePicker. Supported grids
   are worldwide (`CRS_SYSTEMS`): GDA2020 MGA for Australia and WGS84 UTM
   north/south elsewhere — programs run in more than one country. A wrong
   guess puts a real drill hole on the wrong side of the planet. Covered by
   unit + e2e tests — keep them.
2. **Persistence is localStorage, on purpose.** A cloud backend was proposed
   and explicitly declined for now. Keep `saveStore()`'s boolean return, the
   save-failed banner, and the export-staleness nudge working. Do not add a
   database, auth, or any billable infrastructure unprompted. The store is
   versioned (`STORE_KEY` = `mx-store-v5`) with a forward migration chain
   (`migrateV2`→`migrateV3`→`migrateV4`); a new persisted field needs a
   version bump and a migration, both unit-tested, or existing users' data
   silently breaks.
3. **`/mineralx` is noindex-only** (`app/robots.ts` disallow). It stays
   publicly reachable — no feature flag, no auth gate, unless asked.
4. **The analysis caching guarantee:** the terrain analysis fetches
   elevation tiles + occurrences + historic mines **once per viewport run**;
   every layer toggle afterwards only adds/removes already-computed layers.
   Toggles must never trigger a network request. The e2e suite asserts this.
5. **Layer-tree node ids are persistence keys.** `'pub'`, `'flow'`,
   `occ:${commodity}`, `historicMines`, `chips:${pid}`, `holes:${pid}`,
   `targets:${pid}`, etc. live in users' localStorage expand/toggle state.
   Renaming a *label* is fine; renaming an *id* silently resets user state —
   don't, without a migration. Same for target statuses and the `-TG-` id
   prefix: they're written into stored targets.
6. **No invented geology.** No made-up resources, reserves, ounces, grades,
   partners or staff anywhere — site copy or workspace demo data (see the
   header of `lib/content.ts`). This extends to `/api/extract`: when
   `ANTHROPIC_API_KEY` is absent it returns a 503 with `notConfigured` —
   never a mocked extraction — and extracted rows with projected
   coordinates go to `skipped[]`, never auto-reprojected (rule 1 applies).
7. **Do not create pull requests unless explicitly asked.** Commit and push
   to the designated working branch.
8. **Every store mutation snapshots first.** All `api.*` mutations in
   `MineralXWorkspace.jsx` call `pushUndo(store)` before applying; Ctrl+Z /
   Ctrl+Shift+Z and the topbar buttons walk the history (capped at 20).
   A new mutation path without a snapshot silently breaks undo — the
   delete-confirm dialogs now promise "Undo with Ctrl+Z", so keep it true.

## MapLibre: lessons already paid for

Each of these was a real shipped bug. Re-read before touching map code.

- **Globe projection lives in the style spec** —
  `style: { projection: { type: 'globe' }, ... }`. MapLibre v5's Map
  constructor **silently ignores** a top-level `projection` option, leaving
  a flat Mercator map that looks superficially fine. The e2e suite asserts
  `getProjection().type === 'globe'` at load; keep that assertion.
- **CSS specificity vs `maplibre-gl.css`:** the map container carries both
  `.mx-map` and `.maplibregl-map`. MapLibre's own
  `.maplibregl-map { position: relative }` ties bare `.mx-map` rules and
  wins on load order, collapsing the container to height 0 (map falls back
  to a 300px canvas). Container rules must be scoped
  `.mx-workspace .mx-map` to out-specify it.
- **A failed raster tile crashes the globe render loop** ("reading 'bind'"
  every frame) — MapLibre uploads raster responses straight into WebGL
  textures and, unlike Leaflet's `<img>` tiles, cannot skip a broken one.
  Two established mitigations, keep both:
  - WMS overlays: on source error, tear the source *out of the style* and
    show the `wmsErrors` "unavailable" badge; toggling off clears the badge
    (that's the retry path). Never leave a known-bad raster source mounted.
  - Basemap (`/api/basemap` proxy): on upstream failure return a **200 with
    a real blank PNG**, never an error status with a text body.
- **Raster tiles need CORS or same-origin.** That's why the basemap goes
  through `/api/basemap` (edge runtime, hard-cached) instead of straight to
  Esri. Any new tile source must either provably send
  `Access-Control-Allow-Origin` or be proxied the same way. Test mocks that
  fulfill tile routes must set the CORS header (or target the same-origin
  proxy path) or the canvas stays blank.
- **Render-crash recovery** (window error listener → clear layer refs → bump
  `mapEpoch` to remount, capped at 3): a deliberate safety net, not cruft.

## Data-source integrity

- Every GeoResGlobe/GA service URL and WMS layer index was a **best guess**
  written from a sandbox that couldn't reach the live services. The single
  source of truth for vector candidates is `lib/geores-sources.js`
  (route files can't export extra symbols — Next's route type-checker
  rejects them); WMS layers live in `components/mineralx/layer-data.js`.
- `scripts/verify-endpoints.mjs` (+ the weekly `verify-endpoints.yml`
  workflow) checks the exact deployed lists against the live services.
  When a guess is confirmed wrong, fix the URL/index in those files only —
  the routes and panel pick it up automatically.
- ArcGIS field names upstream are unknown, so commodity/mine-type detection
  is deliberately fuzzy (`detectCommodity`, `detectMineType`). Don't replace
  the candidate-scanning with a single hardcoded field name.

## Testing

- **Unit** (`test/*.test.js`, `node:test`, zero framework): pure functions
  in `project-store.js` — coordinate safety above all. Anything touching
  reprojection or CSV parsing needs a unit test.
- **E2E** (`e2e/*.spec.js`, `@playwright/test`): runs against a **production
  build** (`npm run build && npm run start` via the config's webServer). The
  map exposes `window.__mxDebugMap` / `__mxMapLoaded` only when
  `NEXT_PUBLIC_MX_DEBUG=1` — set by `playwright.config.js` for the test run
  and never in a real deploy. Don't gate debug hooks on `NODE_ENV`; e2e
  builds *are* production builds.
- Shared mocks live in `e2e/helpers.js` — basemap tiles, terrarium
  elevation tiles (a synthetic ridge so D8 flow routing has real relief),
  and deterministic occurrence/mine responses. Reuse them.
- Set `PLAYWRIGHT_CHROMIUM_PATH` to a preinstalled Chromium where downloads
  aren't possible; CI installs its own.
- CI (`.github/workflows/ci.yml`) runs unit + build + e2e on every PR/push
  to main. Keep it green.

## How I like work done here

- **Stage risky changes.** Big changes (the Leaflet→MapLibre migration, the
  workspace decomposition) ship as a sequence of independently
  build-and-test-verified commits, not one big bang. Each commit leaves the
  suite green.
- **Verify in a real browser, not just tests.** Drive the actual flow with
  Playwright (screenshots, canvas readbacks when WebGL screenshots lie) and
  say plainly what you observed. "The build passed" is not verification.
- **Comments state constraints, not narration.** Write *why this must be so*
  ("MapLibre v5's constructor silently ignores `projection`"), never *what
  the next line does* or that a change is correct. Match the density and
  measured tone already in the files.
- **Commit messages are long-form and explanatory**: what changed, why, what
  bug it fixes and how it was caught, in full sentences. Read `git log` and
  match it.
- **Site copy lives in `lib/content.ts`** — never hardcode marketing text in
  site components. Tone: corporate, measured, factual.
- **Workspace code is plain JS/JSX; site code is TypeScript.** Follow the
  file you're in; don't convert either direction unprompted.
- When an upstream service, endpoint, or fact can't be verified from the
  current environment, **say so explicitly and build the verification
  mechanism** (script + CI) rather than claiming it works.

## Definition of done

Work is finished only when all of these pass, in this order:

1. `npm run build` — clean, zero new warnings.
2. `npm run lint` — clean.
3. `npm run test:unit` — all pass.
4. Port 3000 free, then `npm run test:e2e` — all pass (new behavior gets a
   new spec; a bug fix gets a test that would have caught it).
5. The affected flow exercised end-to-end in a browser, with the observed
   result reported honestly (including anything that only works because the
   sandbox mocked it — name what still needs checking on the live preview).
6. Committed with an explanatory message and pushed to the designated
   branch. Note the Vercel preview URL when the change is user-visible.

If any step is skipped, say which and why — never imply full verification.
