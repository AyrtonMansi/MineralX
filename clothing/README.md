# X — By MineralX

Independent pre-launch clothing storefront, contained entirely in `clothing/`. It has no dependency on the parent corporate Next.js site, its build or its environment variables. No separate GitHub repository has been created.

## Run

From this folder:

```sh
npm run build
npm test
npm run preview
```

There are no npm dependencies or installation steps. `dist/` is the authored static site, not disposable generated output. Serve it over HTTP; browser ES modules do not work reliably from `file://` URLs.

## Included

- Responsive campaign homepage and all four collection categories.
- Men/women, fit, category and search filters with addressable hash routes.
- Eight concept product pages, individual fit notes, related pieces and size preferences.
- Native accessible navigation, search and saved-edit dialogs, with Escape dismissal and focus restoration.
- Saved edits in device-local storage; duplicate handling, removal, size changes and copy/export to the clipboard with a manual fallback.
- Brand story, mineral palette, silhouette guide, garment-detail editorial, release/product information and preview privacy page.
- Product enquiries open an email draft to the verified MineralX contact; no email is sent by the website.
- Original vector X mark and product/editorial images extracted from the supplied concept; an original generated coastal campaign hero.

## Product truth

This is a working **pre-launch storefront**, not an enabled commerce backend. Product names, classifications, fits and size choices are proposals. The concept images are not evidence of final garments. No price, stock, material certification, weather rating, delivery promise, payment, fake waitlist or order confirmation is invented. “Your edit” is a local shortlist, not a cart or reservation.

The source PDF identifies Suisse Int’l and Supply Mono. Their licensed webfont masters were not supplied; the site uses local sans-serif/monospace fallbacks. The provisional X name is retained. Most branding is configured in `dist/catalog.js`; update the static header, footer, document metadata, mark and accessible labels alongside a final rename.

## Structure

- `dist/index.html`: static entry, navigation, footer and accessible dialog shell.
- `dist/app.js`: routes, views, search and saved-edit interactions.
- `dist/catalog.js`: proposed collection data and validated local-edit model.
- `dist/styles.css`: shared brand tokens and responsive styling.
- `dist/assets/`: locally served, optimised imagery and original logo geometry.
- `docs/brand-direction.md`: research-backed implementation rationale.
- `docs/asset-provenance.md`: image and identity provenance.

## Extraction into its own repo

Copy this folder as the new repository root, retaining `dist/`, docs, package scripts and tests. No parent imports or workspace packages need to be moved. If preserving folder history, use `git subtree split --prefix=clothing` from the MineralX repository. The `.openai/hosting.json` project ID belongs to this preview: preserve it only when continuing this exact Site; remove it when using an unrelated host or creating a separate Site identity.

For a future Vercel project, select `clothing` as the root directory, use Other as the framework, `npm run build` as the build command and `dist` as the output. The existing corporate Vercel project is not reconfigured.

## Before retail launch

Confirm the name and approved logo/font masters; approve final garments, photography, fit measurements and prices; connect an authoritative commerce catalogue and hosted checkout; add delivery/returns/contact details; replace this preview’s privacy text with the operational policy; and remove the deliberate `noindex` only when ready for public launch. Hash routes are appropriate for this review version; product SEO at launch should use individually rendered canonical product routes.

## Verification scope

`npm run build` checks entrypoints, local assets, navigation references, catalog integrity and JavaScript syntax. `npm test` covers combined filters, invalid/stale stored edits, deduplication and size persistence. Browser visual and interaction QA was not performed. The retained build and tests were rerun after the detail-page and accessibility refinements.
