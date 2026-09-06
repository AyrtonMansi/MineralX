# Original geology checkpoint versus released reconstruction

COMPARISON ONLY. No application changes, schema execution, merge or deployment. Do not merge this evidence branch as a completed implementation.

## Verified sources

- Original geological reference: `claude/extract-mineralx-components-ud2gix` at `8918ded239aedb64a35d6d24690e9f91d750d170`.
- Missing additional implementation: the preservation manifest names local branch `codex/geology-enterprise`, commit prefix `073a899`. The complete 109-file commit and full SHA are not in the checkpoint.
- Partial recovery: `preservation/geology-394df3e5da33-20260906` at `d3e229abf5c26f38c8aea3ce0bb8c741f6dc1e5e`, verified directly on GitHub.
- Current released reconstruction: `main` at `5827a3f08fd4e227da4734f12c1663b8786140c5` (PR #7).

The original README reports that the first push was rejected by automatic approval review, and subsequent workspace maintenance removed the worktrees. This comparison does not independently attest to that historical maintenance event. It confirms the surviving evidence, not recovery of the missing commit.

The archive `MineralX_geology_PARTIAL_preservation_e31c688.tar.gz` was retrieved from the saved-file Library and inspected. All 11 recorded byte counts and SHA-256 hashes matched: four source fragments/scripts, one migration and six logs. README and manifest Git blob IDs also matched. The original contents here reuse the preservation branch's exact Git blobs/trees; no replacement code has been inserted into them.

## Critical database boundary

The recovered README records that `202609060003_geology.sql` was ALREADY APPLIED to the existing MineralX Supabase project before the pause. This has NOT been reverified against the live database in this comparison. Do not reapply or reverse it because the front-end source was lost.

The recovered SQL defines geological projects, independent owner/reviewer/collector/viewer memberships, versioned saves, audit records, extraction quotas and private attachment policies. Current main has local IndexedDB storage and no geological project API/auth routes. The released UI is not the shared application described by the original implementation.

There is a migration-version collision to resolve: main has `supabase/migrations/202609060003_plant_layouts.sql`; recovered geology SQL uses the same `202609060003` prefix. Inspect deployed objects and the migration ledger before any new additive migration. Original SQL is intentionally retained under this documentation directory, not the executable migration path.

## Why these fragments cannot be pasted into main

- Current `assayBatches` differs from original `labBatches`. Current programs have `recordId` but no `id`; recovered SQL validates program `id`.
- Current sample `lifecycle` differs from recovered `collectionStatus`, archival and analytical review fields.
- Current dispatch creation immediately sets `dispatched`/`dispatchedAt`. Original evidence separates prepared, shipped, received and receipt_exception states and append-only custody events.
- The UI fragment depends on missing FieldDesk, ReviewDesk, ImportDesk, WorkspaceAccess and persistence implementations. The API fragment depends on commitProject and importProjectBatch, among other missing contracts.
- The parser replacement script references helpers absent from current project-store.js, including csvRows, csvFailure, idKey, finiteNumber, assayFields, validateCollar, validateInterval and legacyResults. It is an intermediate editing script, NOT a self-contained patch.

## Fresh diagnostic results

Existing geological unit suite rerun against the previously verified release archive: 178 passed, zero failed. This is not a fresh production build/browser certification. The modules exercised by the additional probes were independently matched by exact Git blob hash against current main.

Seven required behaviors are missing in those unchanged modules:

| ID | Required behavior | Observed |
|---|---|---|
| G01 | Case-insensitive bag uniqueness | S-001 and s-001 accepted separately. |
| G02 | Control bags without fabricated coordinates | Blank control capture without coordinates rejected. |
| G03 | Manifest preparation distinct from actual shipping | Creating a manifest immediately claims dispatched and timestamps it. |
| G04 | Material receipt exceptions resolved or explicitly excepted before release | One-of-two receipt exception still allows assay batch release. |
| G05 | Idempotent source/certificate reimport | Same certificate/source produces two batches and two history entries. |
| G06 | Target completion requires explicit primary sampling evidence | Unassigned nearby historic blank marks target sampled. |
| G07 | Detection limit spanning classification thresholds is indeterminate | <5 g/t Au classified as background. |

The diagnostic script uses synthetic records, invokes pure functions and performs no network, browser or production mutations. Run from a checkout with its pinned dependencies: `node docs/geology-reconciliation/probe-current-geology.mjs .`. Exit 1 means missing required behavior. Do NOT call it a passing acceptance suite. It checks baseline source hashes and refuses silently changed inputs. During implementation, add general invariant tests for corrected behavior instead of weakening these findings or adding prompt-specific patches.

## Historical coverage, not rerun

Original logs report 212 geological unit tests, 20 SQL/offline/attachment tests and 17 GIC tests passed; production build passed with warnings. Original browser acceptance was NOT executed. Missing original test source prevents rerunning those original suites from this partial checkpoint. Do not infer a simple 34-test deficit from 212 minus 178: suites differ.

Historical tests also describe advanced field geometry, true actual drilled depth, core recovery/fractions, certified controls, certificate revisions and selection, overlimit authorization, source retention, reviewed-map filtering, 10,000-record GeoJSON sources, account-scoped queued sync, attachment checksums and 96 visited-tile offline cache. Those log descriptions are useful acceptance evidence but are not recovered implementations.

The manifest explicitly identifies missing post-commit modifications to components/mineralx/useGeologyPersistence.js, lib/geology/offline-store.js and tests/geology/offline-store.test.mjs. Build evidence additionally names FieldDesk.jsx, useSampleMapLayer.js and routes under /api/geology and /mineralx/auth. No complete 109-file missing-path inventory exists; do not invent one.

## Restoration sequence

1. Read-only verify existing Supabase schema, functions, RLS/storage policies and migration ledger. No blind migration replay.
2. Define a lossless local-to-shared schema adapter. Preserve original browser backups, photos, source files, identities and result history; make incompatibilities explicit.
3. Restore field/lab domain rules, non-destructive archival, qualified-assay display and explicit target completion using the existing UI where appropriate. Port only supported fragments; label reconstructed missing code honestly.
4. Restore durable queued synchronization with account identity, reauthentication/revocation, idempotency, conflict handling and attachment recovery. Prove older sync acknowledgements cannot discard newer edits.
5. Rerun unit, database and full browser journeys, including partial custody, assay review, offline/logout/reconnect, cross-device conflict and backup restore. Preserve GIC, plant, clothing and corporate behavior. Only then propose a release merge.

## Preservation guarantees for this comparison

This branch starts at current main, not the older preservation base. Only docs/geology-reconciliation and a branch-specific no-deployment setting are added. No application code or active migration was changed. Original preservation refs and main remain unchanged. No reset, force-push, merge, database call, dependency upgrade or production deployment is part of this comparison.
