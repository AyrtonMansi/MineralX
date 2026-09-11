# MineralX Intelligence and MCP

## Decision

MineralX owns the intelligence boundary and remains the system of record. The same governed intake service is available through:

- the native **Operations → Intelligence inbox** for staff;
- the remote MCP endpoint at `/api/mcp` for ChatGPT and compatible AI clients; and
- a provider-neutral planner interface for an approved server-side model.

This avoids building a separate chat product or duplicating MineralX data. Symmetry can later connect as another MCP client or operate an approved background worker. It does not need to sit between MineralX and its database for the first release.

OpenAI's [MCP server guidance](https://developers.openai.com/plugins/build/mcp-server) supports this tools-first shape: expose focused actions through an authenticated MCP server, and add a custom connector UI only where it materially improves the workflow.

```text
MineralX UI              ChatGPT / MCP client
     │                           │
     ├── session + RLS           ├── OAuth 2.1 + PKCE
     └──────────────┬────────────┘
                    ▼
          Governed intelligence intake
       allowlist → limits → hash → malware scan
                    │
       private original + immutable provenance
                    │
          model produces proposal only
                    │
       strict contract + policy + permissions
                    │
             human review + MFA
                    │
        existing typed MineralX commands
                    │
          receipts + audit + lineage
```

The model never receives database credentials, writes SQL, chooses its own permissions, self-authorises a proposal, or bypasses a failed control. An MCP client may relay a named user's explicit approval only for the exact displayed proposal version; applying it is a separate confirmation and mutating approval requires MFA. Every write is derived from a server-owned action catalogue and replayed through the existing `mx_ops_command` boundary.

## What the first release does

- Accepts up to 20 files per intake, 50 MiB per file and 100 MiB per intake.
- Caps MCP request envelopes at 1.5 MiB, including streamed bodies; file bytes travel only through short-lived references.
- Supports PDF, UTF-8 text/CSV/JSON/GeoJSON/KML, KMZ, DOCX, XLSX, PPTX, JPEG, PNG, WebP and LAS/LAZ evidence.
- Rejects generic ZIP files, unsafe names, mismatched content signatures, private-network URLs, unapproved download hosts and files that fail scanning.
- Requires the user to choose one evidence family (`geo`, `plant`, `gold` or `custody`) for each intake; ambiguous or mixed-family dumps are clarified or split, never heuristically routed across permission boundaries.
- Preserves originals in private Supabase Storage and records SHA-256 identity, source reference and clean-scan attestation.
- Classifies and proposes a destination with confidence, warnings and source-level provenance.
- Files approved sources through `document.publish` with a controlled title and category. The adapter is intentionally narrow; arbitrary record editing and general-purpose database writes are not part of this release. More record types must be added one typed action at a time.
- Requires explicit review before all proposals and AAL2/MFA before approving any proposal that will mutate MineralX.
- Applies only the exact approved command list, verifies every command receipt, and records immutable intake, approval and execution events.
- Replays interrupted create, proposal, approval and execution requests safely through stable identities and database receipts.

When external model processing is disabled, MineralX stores a metadata-only classification proposal with blocking warnings. A transient provider failure leaves the intake in `received` so the same analysis can be retried; a completed response that fails the strict schema is retained as a blocked metadata-only proposal. MineralX never guesses a destination or silently writes records.

## Required production configuration

### 1. Database and storage

Apply `supabase/migrations/20260910022510_operations_intelligence_intakes.sql`. It advances Operations to schema 10, raises the evidence object limit to 50 MiB, adds scan attestation, and installs the intake/proposal/approval/execution state machine.

Keep these server-only values in the deployment secret store:

```text
SUPABASE_SERVICE_ROLE_KEY
MINERALX_FILE_SCAN_URL
MINERALX_FILE_SCAN_TOKEN
```

`MINERALX_FILE_SCAN_URL` must be HTTPS in production. The scanner contract is a bounded binary `POST` with content type, encoded filename and SHA-256 headers. It must return JSON such as `{"clean":true,"engine":"approved-scanner-v1"}`. Production fails closed without a scanner; there is no production bypass flag.

### 2. OAuth for MCP clients

Enable Supabase Auth OAuth 2.1 Server and configure the authorization path as:

```text
/ops/oauth/consent
```

Use an asymmetric signing key (RS256 or ES256), exact HTTPS redirect URIs, and a separate OAuth client per environment. Disable dynamic client registration in production unless registration is governed and every resulting client ID is added to the exact MCP server allowlist. Supabase's current setup and MCP guidance are in its [OAuth server guide](https://supabase.com/docs/guides/auth/oauth-server/getting-started) and [MCP authentication guide](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).

Configure the MineralX MCP resource:

```text
MINERALX_PUBLIC_ORIGIN=https://mineral-x.com.au
MINERALX_MCP_ALLOWED_HOSTS=mineral-x.com.au,www.mineral-x.com.au
MINERALX_MCP_ALLOWED_ORIGINS=https://chatgpt.com
MINERALX_MCP_ALLOWED_CLIENT_IDS=<approved OAuth client IDs, comma separated>
MINERALX_MCP_AUDIENCE=https://mineral-x.com.au/api/mcp
MINERALX_MCP_FILE_HOSTS=<exact approved ChatGPT file hosts; *.example.com syntax is supported>
```

The migration installs one mandatory Custom Access Token Hook and the isolated
`mineralx_mcp` database role. Configure the same canonical audience in Postgres
before enabling the hook; do not hard-code an environment URL into the migration:

```sql
alter database postgres
 set "app.settings.mineralx_mcp_audience" to 'https://mineral-x.com.au/api/mcp';
```

Open a new database session and execute a representative call to
`public.mineralx_access_token_hook(jsonb)` as `supabase_auth_admin` to verify the
setting is visible. Then enable `public.mineralx_access_token_hook` under Auth →
Hooks → Custom Access Token. Supabase permits one custom access-token hook, so
audience and role isolation are intentionally handled by this single function.
Every token carrying `client_id` is issued with the configured `aud`,
`role=mineralx_mcp`, and `mineralx_token_class=mcp_oauth`; a missing or malformed
audience fails OAuth token issuance closed. Password/native browser tokens do not
carry `client_id` and retain `role=authenticated`.

After enabling the hook, revoke existing OAuth grants/sessions (or otherwise
expire every access and refresh token issued before the hook) before exposing the
connector. Complete a real authorization-code and refresh-token exchange and
verify all four claims: exact `client_id`, canonical `aud`, `role=mineralx_mcp`,
and `mineralx_token_class=mcp_oauth`. Production requires the `openid profile
email` grant and a non-empty exact client allowlist;
`MINERALX_MCP_REQUIRE_OAUTH_CLIENT=off` is ignored there. Browser origins are
matched exactly, including scheme and non-default port.

The `mineralx_mcp` role has zero direct MineralX Data API, table, sequence, RPC,
or Storage privileges. The MCP server first verifies the bearer token with
Supabase Auth, then checks its exact subject, session, client, audience, scopes,
isolation role and token class. It relays the verified actor through the
service-role-only `mx_ops_mcp_gateway`, whose fixed dispatch permits only the
bounded read/intelligence calls and the `file.prepare` or `document.publish`
command actions. Direct Supabase API calls with the OAuth token are denied. The
server service key remains inherently privileged and must stay server-only,
isolated to the MCP/application runtime, rotated, monitored, and never exposed to
ChatGPT, browsers, Symmetry, logs, or client configuration.

The connector URL is:

```text
https://mineral-x.com.au/api/mcp
```

The canonical RFC 9728 resource metadata endpoint is `/.well-known/oauth-protected-resource/api/mcp`; the root `/.well-known/oauth-protected-resource` path remains an interoperability alias. Every request validates the token with Supabase Auth before reading its client, audience or user claims; the fixed gateway then applies normal MineralX membership, scope, MFA, version, idempotency and approval rules as the verified human actor.

### 3. Optional server-side model

MCP access does not lock MineralX to an AI vendor. The current planner adapter uses the OpenAI Responses API because it supports direct file/image inputs and strict JSON-schema output. The implementation sends `store: false`; contractual retention requirements still need to be confirmed for the selected enterprise account and region. OpenAI documents [file inputs and Responses](https://developers.openai.com/api/docs/guides/file-inputs), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and its [API data controls](https://developers.openai.com/api/docs/guides/your-data).

Provider requests contain at most eight readable files and stay strictly below the provider's combined 50 MB boundary. PDF, supported office documents, text/CSV/JSON and images may be inspected. Spreadsheet inputs are subject to the provider's documented first-1,000-rows-per-sheet augmentation. GeoJSON, KML, KMZ, LAS/LAZ and provider-oversize sources remain preserved in MineralX but receive metadata-only, non-filing results until a specialist processor is approved.

The provider stays disabled until both the deployment and the individual MineralX scope allow external processing:

```text
MINERALX_AI_EXTERNAL_PROCESSING=enabled
MINERALX_AI_SCOPE_IDS=<approved MineralX scope UUIDs, comma separated>
OPENAI_API_KEY=<server-only project credential>
MINERALX_AI_MODEL=<approved structured-output model>
MINERALX_AI_RESPONSES_URL=https://api.openai.com/v1/responses
```

An approved deployment may alternatively set this value in a scope policy:

```json
{"ai_external_processing": true}
```

External processing requires the global switch plus an explicit scope allowlist/policy. Leaving either layer off retains the original and produces a reviewable metadata-only result. Never expose the model key to the browser or an MCP client.

## MCP tool surface

Read tools:

- `mineralx_context`
- `search_mineralx`
- `list_mineralx_records`
- `get_mineralx_record`
- `list_mineralx_intakes`
- `get_mineralx_intake`

Governed workflow tools:

- `stage_mineralx_source` — transfers one ChatGPT file into private storage, validates its declared evidence family and content identity, and returns a durable source reference;
- `create_mineralx_intake` — groups 1–20 staged, same-family source references into a durable `received` intake;
- `analyze_mineralx_intake` — advances exactly one bounded phase: it scans one pending source or, once all sources are clean, prepares the proposal. The client repeats this tool while the intake remains `received`;
- `approve_mineralx_intake` — records review of an exact proposal version; and
- `apply_mineralx_intake` — executes only the approved command list and records receipts.

The staged flow is deliberate: uploads and every analysis step are durable and retryable without keeping one long HTTP request open. ChatGPT can orchestrate these steps invisibly in the conversation. The split between approve and apply gives the reviewer a clear final checkpoint and makes a lost response safe to retry.

## Production operating model

The checked-in implementation is the secure application core, not a claim that a live connector is already deployed. Before enabling staff access, apply the migration, configure OAuth/audience/client/origin/file-host controls, connect the scanner and selected model account, and run a live end-to-end connector test with representative non-production files.

Database creation, proposal transitions and commands are idempotent. Provider analysis is currently at-least-once: a rare concurrent retry can repeat model cost, while the database still records only the governed transition. For sustained or large-volume use, run received-intake analysis through one durable leased worker with retry/backoff and observability. Symmetry can fill that worker role, but it should call the same MineralX service/MCP boundary and must not become a second source of truth or hold broader write authority.

Keep the native inbox as the review and exception surface. ChatGPT can supply the familiar conversation and file-upload interface, so a separate general-purpose MineralX chat application is not required for this release.

## Operating controls

- Alert on scanner unavailability/rejection, repeated provider failures, OAuth failures, idempotency mismatches and blocked proposals.
- Review registered OAuth clients, redirect URIs and active refresh grants on a schedule.
- Keep source retention and legal-hold policy in MineralX; this release never auto-deletes an original.
- Add new business actions only with a typed payload adapter, existing permission, risk classification, tests and an auditable review display.
- Test each model or prompt update against an approved evaluation set before changing `promptVersion`.
- Keep external model processing off for scopes whose data residency, confidentiality or contractual terms have not been approved.
- Alert on intakes that remain `received`; retry them through the analysis tool or durable worker rather than recreating the upload.
