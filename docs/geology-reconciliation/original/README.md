# MineralX geology checkpoint — partial recovery only

Implementation is paused. This checkpoint does **not** contain the complete implementation formerly committed locally as `073a899` on `codex/geology-enterprise`.

Before this preservation request, automated workspace maintenance removed the original main checkout, implementation worktree and review worktree. The original push had been rejected by automatic approval review, and GitHub does not have that commit. No full SHA, complete source archive, patch, or alternate working copy was recovered. Do not describe this checkpoint as all work saved.

## What is preserved

- Exact surviving intermediate workspace API and UI source fragments from `/tmp/mx-api.txt` and `/tmp/mx-ui.txt`. These are earlier intermediate fragments, not the final integrated component.
- The surviving parser replacement script and isolated offline contract script. They are reference material; they have not been applied to this branch.
- The complete 18,759-character migration input retained in the earlier SQL editor session, including its transaction wrapper. The migration was applied successfully to the existing MineralX Supabase project before the pause. Do not reapply it blindly.
- Historical unit, database/offline, GIC and build logs. The earlier failing unit log is retained separately as chronology; the later confirmed run passed 212/212.
- A manifest of original paths, known missing post-commit changes, historical results and file hashes.

## What is missing

The final 109-file implementation commit (reported as 14,299 insertions / 6 deletions), its Git object and the final source files are unavailable. The three modifications observed after that commit were `components/mineralx/useGeologyPersistence.js`, `lib/geology/offline-store.js`, and `tests/geology/offline-store.test.mjs`; they concerned offline identity persistence and were not recovered. Other final components exist only as descriptions or partial text in the conversation, not as a verified complete source tree. No replacement code was invented during preservation.

All implementation subagents shared `/workspace/scratch/394df3e5da33/mineralx-geology-implementation`; they did not create separate implementation worktrees. The review worktree was `/workspace/scratch/394df3e5da33/mineralx-geology-review`, and the original main checkout was `/workspace/scratch/394df3e5da33/mineralx`. All three were already absent at this checkpoint. Existing unrelated plant/clothing worktrees were left untouched.

## Branch isolation and comparison

This preservation branch starts at the original main base `167d3728aa98e913d723d4d5b318af3b98a932ce`. Only this recovery folder and a branch-specific no-deployment setting were added. The original geological reference branch remains `claude/extract-mineralx-components-ud2gix` at `8918ded239aedb64a35d6d24690e9f91d750d170`.

Another session's current main was observed at `5827a3f08fd4e227da4734f12c1663b8786140c5`, with `codex/geology-release-20260906` at `ada7589a639b5891d258017697f558a3fdcc320a`. Those are distinct work and were not merged, reset or substituted for the missing implementation.

The preservation commit uses `[skip ci]`, and `vercel.json` disables automatic deployment for this preservation branch only. Configuration reference: https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled . No deployment or main update is authorized by this checkpoint.

## Test results

These are historical results retained from the implementation session, **not tests rerun on this partial recovery branch**:

| Check | Result |
| --- | --- |
| Geological unit suite | 212 passed, 0 failed |
| Geological SQL / offline / attachment suite | 20 passed, 0 failed |
| Existing GIC suite | 17 passed, 0 failed |
| Production build | Passed; warnings in retained log |
| Browser acceptance scenarios | Authored earlier, not executed |

The attached archive contains only recovered source material, documentation and test logs. It excludes credentials, dependency directories, compiled output and Git internals. A complete original source archive cannot be produced from the surviving evidence.
