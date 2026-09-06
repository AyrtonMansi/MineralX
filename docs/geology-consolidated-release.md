# Consolidated geology release 2026.09.07.1

This release builds from current production 5827a3f08fd4e227da4734f12c1663b8786140c5. It does not replace main with the older original reference or the partial preservation branch. Corporate, clothing, GIC and P5 plant code remain unchanged.

Original partial evidence remains at preservation/geology-394df3e5da33-20260906 (d3e229abf5c26f38c8aea3ce0bb8c741f6dc1e5e) and reconciliation/geology-394df3e5da33-20260906 (8a1c6fba434805edf4735c97799fe9ab4fa48246). The lost 073a899 source commit has not been recovered; this is explicitly reconstructed and validated missing behavior, not a claim of byte-for-byte recovery.

Implemented: normalized bag uniqueness; geometry-free blank/standard controls; reference and duplicate validation; planned versus actual drill depth; immutable physical drill identities; prepared/shipped/received custody events; cumulative receipts and reasoned exceptions; case-insensitive laboratory matching; certificate revision/idempotency; held results; explicit control review; unreviewed/qualified result display; strict source units; metadata-only corrections; non-destructive sample, hole and project archival; explicit evidence-based target linking; durable-save failure recovery; recoverable drafts; safe map/photo rendering; larger readable field controls; valid no-store basemap error fallback; versioned offline shell.

Release gates: all geological unit tests; all existing GIC/plant operational tests; production build; seven route smoke checks; nine browser acceptance journeys; exact-SHA live production endpoint and browser verification after merge. Local 207/207 geology tests passed before publication. Historical original 212/20/17 counts must not be substituted for this release's actual CI evidence.

The workflow temporarily expands SHA-256/Git-blob-verified source edits on an isolated branch. Temporary binary checkpoint files, the branch bootstrap workflow and its write permission are removed once verification succeeds. Normal main CI remains contents-read only.

Scope boundary: shared Supabase roles/synchronization/attachments are NOT activated by this change. The recovered migration was reportedly already applied, and its version prefix conflicts with the plant migration; no blind migration replay or rollback is authorized or performed. Local records are not silently uploaded or converted to a incompatible shared schema. Authenticated AI extraction remains disabled. The offline app shell does not imply offline public map coverage. Full field/lab pilots and the lost enterprise geometry/sync work remain unverified; passing local workflows is not enterprise readiness.

Keep existing browser storage and backups intact. Local records are origin-scoped and do not migrate automatically from an old deployment hostname to mineral-x.com.au. Archive actions retain source/history rather than deleting it.
