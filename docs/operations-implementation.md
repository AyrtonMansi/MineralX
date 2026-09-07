# MineralX Operations implementation — work in progress

Baseline bd2fce63608a1955a657271574a9ab4065248ab4; branch codex/operations-suite-20260907. The approved 7 September architecture report governs this work. Preserve public corporate/clothing/plant, GIC record semantics, geological imports/capture/recovery and original preservation refs.

## Core checkpoint

New additive mx_ops migrations cover scoped membership, identity, audit and idempotency; typed runs, feed lots, clean-ups/gold lots, mass observations, product assays, production recognition, custody, allocations and closed-period history; per-entity geological transactions with existing field/lab domain validation; scoped read models and private evidence metadata. Authenticated APIs and encrypted device outbox modules are included. Initial portal/form components exist; pages, integration journeys and full release verification are not yet complete.

Local core verification: 9 Operations domain/database tests passed against isolated PGlite; all four additive migrations applied there; TypeScript passed. CI independently verifies the published exact source and existing regressions. These are development results, not live Supabase or browser acceptance.

## Activation boundary

Supabase reports installed but exposes no SQL/migration tool in this session. Vercel's exact MineralX project read returns 404. No production migration or new application deployment has been performed. Deployment is disabled for this WIP branch. The recovered historical geology/plant migration prefix collision is not replayed or reversed. New SQL files are not a deployed shared-record system. Server-only provider credentials and actual schema inventory remain activation gates.

Continue with shared staff shell/pages, geology/custody/report workflows, account/MFA, evidence, migration/recovery and end-to-end security/browser tests. Expand verified checkpoints to ordinary source files and retire temporary workflow write privileges before release. Do not declare the full suite complete based on this core checkpoint.
