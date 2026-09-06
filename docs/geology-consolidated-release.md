# Consolidated geology release 2026.09.07.1

This release builds from production 5827a3f08fd4e227da4734f12c1663b8786140c5. It does not replace main with the older original reference or the partial preservation branch. Corporate, clothing, GIC and P5 plant source code remain unchanged.

Original partial evidence remains at preservation/geology-394df3e5da33-20260906 (d3e229abf5c26f38c8aea3ce0bb8c741f6dc1e5e) and reconciliation/geology-394df3e5da33-20260906 (8a1c6fba434805edf4735c97799fe9ab4fa48246). The lost 073a899 source commit has not been recovered; this is explicitly reconstructed and validated missing behavior, not a claim of byte-for-byte recovery.

## Consolidated application changes

Normalized bag uniqueness; geometry-free blank/standard controls; reference and duplicate validation; planned versus actual drill depth; immutable physical drill identities; prepared/shipped/received custody events; cumulative receipts and reasoned exceptions; case-insensitive laboratory matching; certificate revision/idempotency; held results; explicit control review; unreviewed/qualified result display; strict source units; over-range element discovery; metadata-only corrections; non-destructive sample, hole and project archival; explicit evidence-based target linking; durable-save failure recovery; recoverable drafts; safe map/photo rendering; larger readable field controls; valid no-store basemap error fallback; versioned offline shell.

## Verification and release boundary

The isolated branch passed 208 geological unit tests, 23 existing GIC/plant tests, the production build, seven route smoke checks and nine browser acceptance journeys in workflow 34062542434 before its application source was committed. Historical original 212/20/17 counts are not substituted for this release's actual evidence.

Normal read-only CI repeats all tests on the actual source commit and PR merge candidate. After main is merged, release verification requires the exact production SHA, seven public route checks, fresh desktop/mobile browser identity checks, and the same nine field workflows against delivered production JavaScript. Those post-merge checks must be observed before claiming the release live. Raster tiles are stubbed in the nine deterministic workflow tests; application, IndexedDB and workflow logic are real. The separate production identity check does not intercept requests. Tests use synthetic isolated browser records, not operational datasets or paid calls.

Temporary binary source checkpoints and the bootstrap write-permission workflow have been removed. The CI token's refusal to modify workflow files was respected: it committed application contents only. Workflow configuration was separately administered through the authorized GitHub connector. Normal release CI remains contents-read only. The production Vercel configuration is unchanged.

## Explicit remaining scope

Shared Supabase roles/synchronization/private attachments are NOT activated by this change. The recovered migration was reportedly already applied, and its version prefix conflicts with the plant migration; no blind migration replay or rollback is performed. Local records are not silently uploaded or converted to an incompatible shared schema. Authenticated AI extraction remains disabled. The offline app shell does not imply offline public map coverage. Full field/lab pilots and missing enterprise geometry/synchronization work remain unverified; passing local workflows is not enterprise readiness.

Keep existing browser storage and backups intact. Local records are origin-scoped and do not migrate automatically from an old deployment hostname to mineral-x.com.au. Archive actions retain source/history rather than deleting it.
