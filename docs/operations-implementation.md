# MineralX Operations — consolidated implementation

The 7 September 2026 Operations architecture report governs this implementation. The integrated branch is based on `codex/operations-suite-20260907` at `ddee5a9fb47a6e22d5f7ba5a820d1f07889dbb03`, which already descends from production main `bd2fce63608a1955a657271574a9ab4065248ab4`. The separate portal experiment is retained at local checkpoint `6038398`; its competing database schema was not combined with the authoritative `mx_ops` model.

## Delivered source

- `/ops`: authenticated context, explicit project/facility selection, Home, Geology, Plant & Gold, Work queue and Reports; responsive staff interface and account/MFA setup.
- Gold: typed feed and processing records, multi-run clean-ups, measured weights, source assays, independent review, recognition policy, custody acknowledgements, measured transformations with lineage, ownership allocations and settlements, period preparation/review/close and preserved revisions.
- Geology: collection, physical drill intervals and actual-depth validation, downhole CSV import, programs, targets, dispatch and laboratory receipts, original certificate staging, qualified results and independent analytical release. Existing local geological workflows and KML/KMZ/GeoJSON parsers are reused.
- Shared map sources retain original evidence and full multipart geometry, interior rings and boundary history. Import and local-project migration require a server preview. A local migration never promotes historical free-text reviewers to authenticated signatures.
- Field preparation uses an account/project-specific AES-GCM vault, PBKDF2 passphrase key, revision-checked IndexedDB transactions and an eight-hour offline capture lease. Acknowledgements remove only the matching request. Foreground synchronisation rechecks current membership and permissions. Conflicts retain the original proposal and require explicit comparison. Only capture commands are allowed offline.
- Private evidence has a staged upload, byte count and SHA-256 finalisation, scoped signed downloads and explicit primary/independent-copy status. Controlled document replacements preserve old revisions and reject cross-workspace links and forks.
- All operational mutations use scoped, version-checked commands and authenticated audit entries. Gold custody, analytical approval, period close and access changes require MFA. Administrators do not acquire operational permissions automatically.

## Acceptance corrections

The previous nine-test checkpoint did not exercise file finalisation; its `f.run_id` reference was invalid for the files table. The additive acceptance migration fixes that, enforces consistency between assay text and selected units, prevents document revision forks/cross-workspace references, corrects geology queue counts, and ensures preserved close snapshots describe the closed revision.

The XML parser is pinned to 0.9.12 after npm reported 0.9.10 deprecated for critical issues. Upstream release: https://github.com/xmldom/xmldom/releases/tag/0.9.12. Source imports retain size/depth/feature limits and do not follow external links.

Temporary source-expansion workflows with repository-write permission have been removed. Read-only Operations acceptance CI now runs alongside existing geology release verification.

## Verification and its boundary

Use `npm run test:ops`, `npm run test:unit`, `npm run typecheck` and `npm run build`. The Operations suite executes the actual PostgreSQL functions in isolated PGlite and reuses the actual geology domain functions. It covers actor/role/MFA restrictions, retries, exact quantities, pending assays, custody, period history, source integrity, document scope isolation, certificate release and encrypted recovery. Development fixtures use synthetic records only; no live staff data is used.

Passing these checks does not prove live Supabase Auth, private Storage, deployment, iOS persistence, independent object backups or a restore drill. Record each live check separately in the release evidence rather than treating test counts as production acceptance.

## Database activation

The site can deploy without changing the existing GIC, public plant plan, corporate pages, clothing store or local geology store. Operations fails closed with a clear activation message if its schema is missing.

1. Identify the existing production Supabase project and inspect its migration ledger and backups. Do not replay the historical geology/plant migration-prefix collision.
2. Apply only the four saved `2026090701*` Operations migrations, followed by `20260907073020_operations_acceptance_fixes.sql`, in order, after checking which are already recorded. The required Operations schema version is 5.
3. Confirm `NEXT_PUBLIC_SUPABASE_URL`, the existing public publishable/anon key, and server-only `SUPABASE_SERVICE_ROLE_KEY` on the actual MineralX Vercel project. Do not expose the service key in client configuration.
4. Configure identity invitation/recovery redirects for `/ops/auth/complete`. Existing verified accounts can claim prepared workspace invitations without sending email from the portal. New account invitations remain with the identity provider.
5. The existing GIC owner verifies MFA, bootstraps the organisation, creates explicit project/facility scopes and grants named responsibility profiles. Confirm the facility recognition point before recognising production.
6. Run an invited-user walkthrough, separate recorder/reviewer and custodian/recipient journeys, revoke access and verify stale sessions fail, exercise original-byte upload/download, then run offline/reload/reconnect checks on the actual field iPhones. Verify separate object backup and a restore drill before a live field pilot.

## Known operational limits

- The connected Supabase account returned no projects; production migrations have not been applied from this workspace. The Vercel connector does not list `mineral-x`, although GitHub confirms its existing Vercel deployment integration. A website deployment alone does not activate the new database.
- Full project packs are bounded to 10,000 rows per geological family and source files to 10 MiB. Basemap imagery is not included offline. Large imports remain bounded synchronous operations; no background processing service is claimed.
- Advanced reported recovery requires a representative, reviewed measurement basis and remains explicitly unestablished in summaries. Production, ownership, custody and booked settlements remain distinct.
- Recovery of complex conflicting or invalid dependent queues may require retaining an encrypted export and an authorised reconciliation. No automatic merge or silent discard occurs.
- Independent object backup is not configured by this change. Real-device acceptance and named production role mapping remain deployment/pilot work, not synthetic test results.
