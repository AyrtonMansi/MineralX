# MineralX Operations implementation

Baseline: bd2fce63608a1955a657271574a9ab4065248ab4. Implementation branch: codex/operations-suite-20260907. Scope: the approved 7 September Operations Architecture and UX Decision Report. Preserve public corporate/clothing/plant planning, existing GIC record semantics, geological import/capture/recovery and all preservation refs.

Implementation proceeds in independently verified normal-source commits: core staff portal and permissions; typed processing/gold records, custody and closed accounts; shared geology entity sync and legacy migration; evidence storage, work queues, exports and recovery; security/browser/regression verification. New database migrations must use a unique prefix and must NOT replay the recovered historical geology/plant migration collision.

At implementation start, the Supabase plugin reports installed but exposes no SQL/migration tool in this session. The MineralX Vercel project read returns 404 through the current connection. These are activation/verification constraints, not reasons to change provider, expose records or substitute another database. Code and isolated database tests can proceed. Do not represent a schema file, build or hidden feature flag as a deployed shared-record system. Record exact release and activation state at each checkpoint.
