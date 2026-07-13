# MineralX Resources — Corporate Website

A premium, dark corporate website for **MineralX Resources**, an Australian
mining and exploration company focused on disciplined gold exploration and
development in Queensland.

Single-page, investor-grade marketing site built for speed, clarity and easy
content editing.

## Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion (subtle, reduced-motion aware)
- **Hosting:** Vercel
- **Domain:** mineral-x.com.au

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # lint
```

## Project Structure

```
app/
  layout.tsx           Root layout, fonts, SEO metadata, JSON-LD
  page.tsx             Homepage composition (section order)
  globals.css          Design tokens + shared component classes
  opengraph-image.tsx  Auto-generated Open Graph / social image
  icon.tsx             Auto-generated favicon
  robots.ts            robots.txt
  sitemap.ts           sitemap.xml
components/
  Preloader.tsx        Loading screen (wordmark reveal + progress)
  Navbar.tsx           Sticky nav with scroll state + mobile menu
  Hero.tsx             Full-bleed hero (preserved concept)
  TerrainBackground.tsx Generated aerial-survey hero backdrop
  Overview.tsx         Company overview + credentials strip
  OperatingFocus.tsx   Three operating-focus cards
  Queensland.tsx       Operating region section
  Capability.tsx       Six capability blocks
  Investors.tsx        Investors / partnerships + disclaimer
  Contact.tsx          Contact section + enquiry form
  Footer.tsx           Footer + legal
lib/
  content.ts           ← All site copy lives here
```

## Editing Content

Nearly all text — headings, body copy, cards, contact details, nav and
footer — is centralised in [`lib/content.ts`](lib/content.ts). Edit that file
to update copy without touching component code.

To change the **section order**, edit the JSX in [`app/page.tsx`](app/page.tsx).

## Design Notes

- **Palette:** black / charcoal / white, thin hairline borders. No metallic gold.
- **Type:** Inter, with tracked uppercase eyebrows and bold display headings.
- **Loading screen** and **hero concept** are preserved from the original site.
- The hero backdrop is generated (SVG contour field) — no stock photography.
- Animations are intentionally subtle and respect `prefers-reduced-motion`.

The contact form is backend-free: it composes an email to
`info@mineral-x.com.au` via the visitor's mail client. Wire it to a form
service or API route if server-side handling is required later.

## Field-geology workspace (`/mineralx`)

The same project also hosts an internal field-geology workspace at
[`/mineralx`](app/mineralx) — a MapLibre GL globe map for managing rock-chip
samples, drill holes, tenement boundaries, Queensland government
(GeoResGlobe) reference layers, and a terrain-hydrology targeting model.
It is noindex-only and stores all project data in the browser
(localStorage) by design; CSV export is the backup path.

Notable behaviours:

- **Coordinate safety** — CSV imports with MGA-magnitude easting/northing
  pause for explicit zone confirmation before any reprojection.
- **Undo/redo** — every data mutation (add/edit/delete/import) is
  snapshotted; Ctrl+Z / Ctrl+Shift+Z or the topbar buttons walk history.
- **Sample provenance & QAQC** — every rock-chip sample carries a sample
  type (rock chip / soil / channel / trench / float / core), a QAQC type
  (original / CRM standard / blank / field duplicate / triplicate, with
  `duplicateOf` linking a duplicate back to its original), and a
  coordinate source (handheld GPS / DGPS / surveyed / digitised /
  unknown) — the metadata a JORC Table 1 disclosure (sampling technique,
  verification of sampling and assaying) actually needs, not just the
  grade. QAQC-tagged samples get a badge in the Data drawer so lab-quality
  coverage is visible at a glance. All three fields round-trip through
  CSV import/export (`sample_type`, `qaqc_type`, `duplicate_of`,
  `coord_source` columns; common lab abbreviations like "dup"/"std"/"blk"
  are recognised) and default conservatively (`rock_chip` / `none` /
  `unknown`) for data that predates these fields — nothing is asserted
  about existing samples that isn't true.
- **Detection limits** — a lab result reported as below detection
  ("<0.01", or the legacy negative-number convention some exports use)
  is recorded as a real, disclosed result — `<0.01 g/t Au` — not silently
  dropped and not confused with "never assayed." It grades as background
  (a genuine, if unremarkable, answer) rather than "pending", shows
  correctly in sample rows, map popups and the drill-hole interval table,
  and round-trips through CSV export/import losslessly. Applies to rock
  chips, assay-linking CSVs and downhole assay intervals alike.
- **Assay-interval export** — the downhole from-to-grade table (not just
  the collar list) now exports as its own CSV, alongside the collar
  export in both the Data drawer and the Drill Hole manager — the actual
  drill results a Competent Person or modeling consultant needs, which
  previously could be imported but never gotten back out. AI extraction
  (below) recognises below-detection results the same way, so a pasted
  lab certificate doesn't lose them either.
- **Downhole surveys** — a collar's own azimuth/dip is only the planned
  orientation; a real hole deviates with depth. Gyro/EMS/single-shot
  survey shots (`hole_id, depth, azimuth, dip`) import as their own CSV in
  the Drill Hole manager, are stored flat (`project.surveys`, keyed by
  `holeId`, mirroring how assay intervals sit alongside collars rather
  than nested inside them), and show as a depth-ordered table in the Data
  drawer's collar expansion. Deleting a collar deletes its orphaned
  surveys too. Exports alongside collars/intervals from both the Drill
  Hole manager and the Data drawer, and is included in "Export all program
  data".
- **Geological logging** — the assay-interval table only ever carried lab
  grades for a from-to; it was never a substitute for the geologist's own
  observation of core/chips in hand. Logged intervals
  (`hole_id, from, to, lithology, alteration, structure, notes`) import as
  their own CSV in the Drill Hole manager's Geology tab, are stored flat
  (`project.geology`, keyed by `holeId`, the same shape as intervals and
  surveys), and show as a from-to table in the Data drawer's collar
  expansion alongside the assay and survey tables. Deleting a collar
  deletes its logged intervals too. Exports alongside collars/intervals/
  surveys from both the Drill Hole manager and the Data drawer, and is
  included in "Export all program data".
- **AI extraction** — the Add-data panel can send pasted report text to
  `/api/extract`, which uses the Claude API to read samples, collars and
  intervals out of unstructured text for review before import. This
  requires an `ANTHROPIC_API_KEY` environment variable on the deployment;
  without it the endpoint returns an honest 503 and the panel explains
  the feature is not configured. Extracted rows with projected
  (easting/northing) coordinates are never auto-converted — they are
  listed as skipped, to be imported via CSV with zone confirmation.
- **Exploration targeting cycle** — the terrain analysis proposes scored
  drainage-trap candidates; a geologist promotes the good ones into a
  persistent, ranked **Targets** worklist (the diamond dock icon). Each
  target carries a frozen evidence snapshot and moves through a status
  pipeline (proposed → planned → visited → sampled → confirmed/barren).
  Dismissed candidates are remembered so a re-run never resurfaces them.
  Targets export as GPX/CSV waypoints for a handheld GPS; a rock chip
  taken within 100 m of a target auto-links and advances it; and once a
  linked sample is assayed, one-click confirmed/barren feeds an honest
  model hit-rate shown in the Layers panel — all computed from the
  program's own records, never seeded.

Workspace testing:

```bash
npm run test:unit        # node --test — store/coordinate logic
npm run test:e2e         # Playwright against a production build
npm run verify:endpoints # checks GeoResGlobe/GA service URLs live
```

See [CLAUDE.md](CLAUDE.md) for the full conventions and hard rules.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new) — framework is
   auto-detected (Next.js); no extra configuration required.
3. Add the `mineral-x.com.au` domain in the Vercel project settings.
4. Optionally set `ANTHROPIC_API_KEY` in the project's environment
   variables to enable AI extraction in the workspace.

## License

© MineralX Resources Pty Ltd. All rights reserved.
