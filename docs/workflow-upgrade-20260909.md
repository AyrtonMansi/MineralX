# MineralX connected work upgrade — 2026.09.09.1

Baseline main: `8c53ce7d8a521457afc56ec72131a50da78f31af`. Implementation branch: `codex/mineralx-workflows-20260909`. Preserve the prior recovery branches and all production history.

## One program, several views

The canonical program is the existing `mx_ops.geo_programs` entity. Home, Programs and the suite Geology Globe create/edit the same UUID and version; there is no separate Home copy. Processing campaigns retain their UUIDs as compatibility projections. Program types include drilling, sampling, mapping, drone, geophysics, test work, processing, plant, maintenance, energy, civil, environmental, compliance and general work.

Navigation is Home / Programs / Geology / Plant / Gold / Work / Reports. Module links choose a permitted project or facility when the current scope is incompatible. Home offers Create work program and Create task, with next actions, due/unassigned/blocked work, active programs and the coming fourteen days. Operational totals and introductory guidance remain available without dominating the work surface.

Program detail exposes Overview, Sequence, Records, People & equipment, Files & costs and Activity. The suite Globe has a typed creation menu and program selector. Actual drillholes/metres/samples require explicit linkage; spatial proximity does not complete work. Existing `/mineralx` remains an explicitly labelled browser-local legacy/source workspace. It links to the suite Globe and retains controlled migration/export; existing legacy-browser records are not silently copied, synchronised or overwritten.

## Work planning and people

Extend `work_items`, not another task system. Tasks, work packages, milestones, maintenance, handovers and issues have a responsible planning person, contributors, dates, priority, evidence, outcome and explicit prerequisites. List, board and fourteen-day schedule are views of the same records. Dates are planned dates, not asserted progress or automatic rescheduling.

Cross-workspace dependencies require current access to both scopes in one organisation. Restricted predecessor details are masked. Cycles, premature dependent starts, incomplete program closure, reopening prerequisites beneath active work and work-package closure over unverified maintenance are blocked. Planning personnel never create login accounts or permissions. Linking an existing authorised account enables My work.

## Plant, engineering and energy

Plant retains the existing P5 engineering dashboard as a read-only reference. Private engineering revisions neither read nor write public review notes. Concept, approved and commissioned records remain distinct; original source/version evidence is retained. Equipment, recorded service dates, maintenance and critical spares link to work. Independent maintenance verification requires a different named supervisor with MFA.

Energy records installed equipment, opening tank observations, deliveries, issues, transfers and independent dips. Chronological stock must remain non-negative and within recorded capacity. A dip is an observation, not a balancing adjustment. Meter intervals distinguish generator, solar, grid, load, running hours and battery state, with overlap and physical elapsed-time validation. Proposed solar capacity is not measured generation. Partial-period observations are excluded rather than prorated. Generation and load are not summed as total consumption. Fuel issue is not automatically consumption; kWh/t and L/t remain unestablished without a matched reviewed operating boundary and dry-feed denominator. No telemetry, meter integration or solar-savings estimate is fabricated.

## Gold sequencing

Gold has its own entry and a next-useful-action panel for each lot: physical clean-up, measured weight, product assay, independent review, policy-based recognition and handover. Physical form, analytical verification, production and custody remain separate states. Custody may occur with an assay pending; this is not a forced wizard. Advanced corrections, transformation, holds and commercial actions remain accessible. Existing no-self-approval, qualified-assay, custody acknowledgement and no-double-counting controls remain enforced.

## Persistence and authority

New additive migration `20260909020000_operations_workflow.sql` installs workflow schema 7. Core sign-in still accepts schema 6, retaining existing-account compatibility. No historical geology/plant migration is replayed or reversed.

Writes use the existing authenticated transaction dispatcher: current permission, expected version, stable request ID, mutation, audit and receipt. New tables have scoped read policies; public table/function writes remain revoked. Dependency changes are serialised within the organisation. Evidence references and financial visibility use current permissions. Estimates, commitments, actuals and currencies are not indiscriminately added together.

Temporary development mode runs the same SQL in the existing browser-local PGlite database. Schema-six development records upgrade in a transaction; failure does not seed a replacement database. Migration and save acknowledgement wait for the durable IndexedDB snapshot. Full development backup includes new work records, observations and original file bytes. Independent browsers/devices do not share development data.

Shared views refresh after commits and on foreground/resume when no dirty entry is open. Actor/path changes clear old data; a same-path refresh retains context. Forms retain expected versions and unsubmitted input after failed writes. Home shortcuts also honour the dirty-entry guard. Planning and energy commands require a connection in staff mode; the existing account-scoped geology outbox is preserved.

## Executable verification and deployment gate

Normal application source was preserved at `6cf1eede499605f869ac6f1fc6c34b8023cade01` after CI type checking, lint, **48 Operations/domain/database tests, 224 geology tests, 37 GIC/plant tests and the unmocked production build** passed. No runtime dependencies were added. Existing lint warnings are not silently suppressed.

The browser suite contains **36 scenarios**: the previous 29 plus Home/Globe canonical identity; personnel/dependency scheduling; failed-save retry/reload; diesel/proposed-solar validation; private engineering isolation; complete backup; and protection against Home shortcuts discarding an open draft. The calendar-date defect and missing link-tab sizing were corrected, and a test-navigation race now waits for the actual selected task identity rather than reading an unsettled URL.

The exact final PR must pass read-only CI, then main must pass exact-SHA Vercel identity/route checks and the full browser rerun against delivered production JavaScript. Check the PR and final main workflow for observed completion; an authored test or this document is not proof that production acceptance ran. Raster imagery is stubbed in deterministic workflows; the application, PGlite commands and IndexedDB are real. Existing staff UI fixtures remain fixtures, not actual production-account acceptance. No operational data or email contents are used as test fixtures.

Temporary binary source-transfer files and both bootstrap workflows have been removed from the final tree. The exact baseline Vercel configuration is restored, including suppression of the older WIP branches. Main and PR workflows remain read-only.

## Explicit commissioning boundary

The connected Supabase account returns no accessible projects; the Vercel connector does not list MineralX. Publication can use the existing GitHub-to-Vercel integration, but no production schema migration, account provisioning, independent object-backup configuration or shared-backend commissioning is performed by this release. Named cross-device work needs the reviewed schema-seven migration on the correct existing database and actual multi-account/device acceptance. Existing local records are not automatically migrated to that backend. Development approvals and custody authority remain unavailable.
