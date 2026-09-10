# Local Intelligence and MCP testing

Use this runbook only with the deterministic local fixtures. It creates a
dedicated `@mineralx.local` user and writes its credentials to ignored,
owner-readable `.env.local`; never copy that file into a ticket, chat or commit.

## Start

Prerequisites: Node 22, Docker or another Docker-compatible daemon, Supabase
CLI, PostgreSQL `psql`, OpenSSL and the Playwright Chromium browser.

```sh
npm ci
npx playwright install chromium
npm run local:setup
```

`local:setup` is loopback-only. It creates/locks the local ES256 OAuth key and
HTTPS key, starts Supabase, applies pending local migrations, refreshes the
idempotent fixture records and creates or refreshes the test account.

In two terminals, start the deterministic planner and the HTTPS suite:

```sh
npm run local:ai
npm run dev:https
```

Then verify the boundaries and workflow:

```sh
npm run local:verify
npm run test:mcp:smoke
npm run local:verify:ui
```

The browser check performs a real local login, temporary TOTP enrolment,
private upload, analysis, approval and governed apply. It removes TOTP factors
for the dedicated test user before and after the check, but intentionally
retains synthetic intake/document records. Open `https://localhost:3000/ops/login`
and use the ignored `.env.local` credentials for manual testing; accept the
self-signed certificate only for localhost.

The local planner is a deterministic contract fixture: it classifies safe
metadata and never dereferences source attachments. The local path validates
file signature/hash and workflow controls but is not a malware-scanner or AI
quality test. Use only checked-in synthetic files.

## ChatGPT connector testing

ChatGPT cannot reach localhost. Test a real connector only against a public
HTTPS staging environment with a hosted Supabase project, a scanner, an
approved model account, exact OAuth client/redirect/audience/origin/file-host
settings, and synthetic data. Verify PKCE, refresh/revocation, staged file
transfer, MFA approval and execution receipts before production enablement.

## Stop or reset

Stop the app and local planner with `Ctrl-C`, then run `supabase stop` to stop
the local stack. `supabase db reset` discards local database data; use it only
when intentionally resetting the test environment.
