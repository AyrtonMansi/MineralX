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
