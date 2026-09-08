# Temporary development access — 8 September 2026

Open `/ops?mode=development` without an account. New browser contexts also default to development until staff sign-in is explicitly selected. The temporary UI uses the existing Operations forms and domain rules in a browser-local PostgreSQL/IndexedDB database. There are no seeded measurements, passwords or copied company records.

## Boundaries

- Production APIs, membership checks, MFA, Supabase configuration and private storage remain unchanged. The mode cookie/header selects presentation only; middleware overwrites incoming mode headers. Neither query parameters nor a local development actor grant server access.
- Local development requests have no fallback to production. Real-account commands are refused by the development adapter; a development actor is refused by the production client before HTTP. The production server still independently requires real authentication and permissions.
- Source uploads remain on the current browser, bounded to 10 MiB each and verified by size and SHA-256. No signed production storage URL is issued. Original sources and record history are included in a development backup.
- Development identity is labelled as a browser, never a named authenticated employee. Its local PostgreSQL claims always have `aal1`; identity administration, migration into company records, critical approvals, production recognition, period close and custody signatures remain unavailable. No policy is weakened in the shared SQL migrations.
- Data belongs to this origin/browser profile; it is not encrypted, shared across devices or synchronised. Anyone using this browser profile can access it. Do not enter confidential operational records. Use staff access for company records.

## Durability and navigation

PostgreSQL runs from the pinned installed PGlite package, with WASM/data assets self-hosted by the application. IndexedDB flush is awaited, not relaxed. One tab exclusively holds a Web Lock; a second writer is rejected rather than overwriting the first tab's data. Browser storage failure is not a successful save; the open form and stable retry request must remain available. Backups are downloadable data-directory archives, labelled DEVELOPMENT; they are not production import packages.

Staff sign-in uses a full document navigation to avoid mixing retained development UI and authenticated transport. The document's mode is stable even if another tab changes the preference cookie. The existing encrypted staff field service worker explicitly prepares a staff-mode shell, never the development application.

Loaded local work can continue without a network connection; this mode does not promise offline cold-start, offline map coverage or staff field-pack readiness. Initial load needs the self-hosted database assets. Production readiness and real-user authentication must be tested separately.

## Turning it off

Set the server environment variable `MINERALX_DEVELOPMENT_ACCESS=off` and redeploy, or set `DEVELOPMENT_ACCESS_ENABLED=false` in `lib/ops/development-policy.ts`. This restores normal authentication-first presentation on new documents. No database migration or account change is needed. Existing local records are not deleted by the switch; take a development backup before disabling access. Open development tabs cannot access production merely because the flag or cookie changes.

## Verification scope

The regression suite applies the actual eight consolidated SQL migrations to isolated PostgreSQL, tests local request replay/conflicts, exact source bytes, cross-scope/actor rejection, critical-action denial and backup restoration. Browser tests cover the real self-hosted WASM, IndexedDB persistence, processing and geological forms, source import/export, failed-save retry, exclusive tab ownership, independent browser contexts and protected API denial. Only public raster tiles are stubbed; application and local database logic are not. These tests do not certify live staff identity or replace production commissioning.
