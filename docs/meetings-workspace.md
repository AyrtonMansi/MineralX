# Private JV meetings

`/ops/meetings` provides a private archive of meeting summaries and explicit next steps. It is linked from Operations and is always a staff route, including when the rest of Operations is in temporary Development mode. It uses verified identity and its own private workspace membership, so it works before the larger Operations schema is commissioned.

## Access and sign-in

Administrators provision an unconfirmed Auth account using the server-side Admin API (without bypassing email verification) and assign its normalized email to a workspace in `mx_meetings.members`. Access requires a live Supabase user with that currently verified email, plus active membership. A note mentioning someone never grants access. Owner/reviewer members can import and review; viewers can read. All seven tables use RLS, browser roles cannot write directly, and public RPC wrappers run with caller privileges. Privileged mutation implementations stay in the private schema and independently enforce membership.

The page offers a user-initiated access email while public registration remains closed. Unconfirmed assigned accounts receive an administrator invitation. Confirmed accounts receive a normal magic link with automatic signup disabled. This avoids the provider treating an unconfirmed identity as a forbidden public signup. A server-only allowlist and 60-second per-email cooldown gate requests; Supabase Auth delivers and verifies the link. Invitations return through `/ops/auth/complete?next=/ops/meetings` and a fresh server-verified document navigation. The existing `/gic/auth/callback` exchanges the magic-link PKCE code and a same-browser HttpOnly cookie returns meeting sign-ins to Meetings. No shared Operations membership is required for that destination. Existing password sign-in also accepts this safe destination. Email delivery depends on the project's Auth email configuration and redirect allowlist; requesting a link is not proof of delivery.

## Sources and review

Original text is retained per revision with a SHA-256 checksum and optional private Gmail link. Next-step parsing preserves source wording and names as written; aliases, relative dates and commitments are flagged for review. It does not invent dates, resolve people or interpret a summary as approval. Review saves use request receipts, optimistic versions and a transaction with an audit entry. Source reimports deduplicate by workspace/source key and checksum; changed sources create a revision while preserving prior reviews.

Reviewed means the interpretation was reviewed. It does not mark work completed, authorize spending or publish an operational task. Source text is escaped, meeting API responses are private/no-store, and notes are not put in browser persistence. Account changes, denied access and membership revocation clear the open record. Downloads recheck current authorization before creating a file. Failed reads do not loop; interrupted saves retain the entry and reuse the request identity when the intent is unchanged.

## Intake status

Manual pasted Zoom notes work now. A service-role-only `mx_meetings_ingest` RPC supports trusted source ingestion, but there is no continuous Gmail/Zoom adapter, OAuth connection, queue or scheduled synchronization in this release. The UI states this explicitly. Connected assistant email tools are not hosted application credentials. The initial authorized email backfill is private production data, never repository fixtures.

## Deployment and operation

Apply only `20260909053534_meetings_workspace.sql` for this feature. It is additive and independent of earlier Operations migrations. Production had no Supabase migration registry; this isolated application records the migration filename and SHA-256 as the `mx_meetings` schema comment. Earlier migrations must not be marked applied without verification. Notify PostgREST to reload its schema after application. Membership provisioning and initial source imports are administrative operations and are kept outside the public repository.

Before future rollout, inspect the deployed schema and reconcile its recorded hash with the migration. Do not rerun the create-schema migration over an existing schema. A frontend rollback can leave the private archive intact; no automatic destructive database rollback is defined. Use managed database backups and verify restore policy separately before describing this as a complete enterprise retention system.

## Verification

Nine PostgreSQL-compatible tests cover scoped access, verified email, revoked membership, atomic import, source checksum validation, idempotency, conflicting edits, revision preservation, service-only ingestion, RLS and invoker RPCs. Six browser journeys cover discoverability, forced Development exclusion, desktop/mobile notes, escaping, failed-save retry, failed-read behavior, membership clearing, explicit sign-in submission and authorization at export. Browser fixtures contain synthetic notes and mock email sending. Production role checks use a synthetic account inside a rolled-back transaction; they do not create an enduring account or bypass the user's email verification.

## Device-workspace recovery

Opening staff sign-in does not change the stored device/staff choice. The login page itself stays protected. Only an explicit mode selection or a successfully verified login with commissioned Operations access changes that choice. A staff gate offers an explicit **Open device workspace** link to the current tool; this grants no private API or meeting access.
