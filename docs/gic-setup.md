# GIC processing register

The run entry screen uses Timing → Production → Review. It records start and end times in Queensland time (AEST), tonnes input, recovered bullion weight in grams and gold percentage of that bullion. Elapsed duration is calculated from the timestamps. Contained gold is weight × percentage ÷ 100. Run references and creation timestamps are assigned automatically. Corrections and voids retain prior versions.

## Activation

Code can deploy before the backend is configured. In that state `/gic/login` explicitly displays that access is awaiting activation, disables sign-in and all protected routes redirect there. There is no demonstration login or browser-only record storage.

1. Create a dedicated Supabase project for this application after the account owner approves the provider, terms and plan. Do not attach another application's database. Choose an Australian region if available. The dedicated mineralx-gic project is provisioned on the approved free plan in Sydney, connected to the production environment, and both migrations have been applied.
2. Apply both migrations in order: `supabase/migrations/202609060001_gic.sql` and `supabase/migrations/202609060002_run_timing.sql` using the database administrator. The migration is transactional. Test it against a separate development project first.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the relevant Vercel environments. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported. No service-role secret is used by this application. Never place service-role credentials in public variables or git.
4. Disable public signups in Supabase Auth. Set the site URL to `https://mineral-x.com.au/gic/auth/complete` and allow the exact `https://mineral-x.com.au/gic/auth/callback` redirect. Configure password policy (minimum 12 characters), auth rate limits and production email delivery. Supabase's default mail service is restricted; test delivery before relying on resets or invitations.
5. Create the initial owner's account through Supabase's secure administration interface. Create one workspace using the actual private JV label and GSQ mine name, then add the owner's user UUID to `gic_members`. Each account belongs to one reporting operation. Add editors/viewers only when the owner authorises the individual access. Do not commit names, email correspondence, populated return files or operational data.
6. The standard Supabase invitation template redirects to the site URL above. The isolated completion page uses the provider SDK to validate the returned session and write auth cookies before opening password setup. Password recovery uses the server-side PKCE callback. If custom email delivery is configured, token-hash templates can instead point to the absolute production `/gic/auth/callback?token_hash={{ .TokenHash }}&type=invite` (or `type=recovery`) URL. Never put passwords or invitation tokens into a commit or public preview.
7. Redeploy. Verify owner sign-in, password reset, logout, viewer access, a test run, correction, export and denial for an unassigned account against the live provider. Remove/void test entries before production use and keep their provenance clear. Do not describe these provider flows as verified before activation.
8. Confirm a database backup/restore arrangement and retention policy with the owner. Free-tier limitations and pausing must be checked against the chosen plan; CSV exports are supporting records, not a substitute for a database backup.

Membership/bootstrap SQL is deliberately not populated in this public repository. Database writes use authenticated RPCs, independent membership checks and row-level security. Authenticated clients have no direct mutation privileges on records, memberships or audit history.

## Annual-return mapping

Source: Queensland minerals production and sales annual return, template version 1.8 (June 2026), checked against the supplied reporting correspondence and its blank template. The public field schema contains only government template field names and controlled vocabulary. Private correspondence and historical production values have not been copied into the code.

Official guidance and download links: https://www.business.qld.gov.au/industries/mining-energy-water/resources/minerals-coal/reports-notices/returns

`PRODUCTS_PROCESSED` is the exact official component name. This single-operation gravity-plant register aggregates active runs into one gold/bullion processing line. The original input classification, processor and annual recovery are reviewed separately in the annual workspace. Input tonnes are rounded to whole tonnes only in the component export, per the template's accuracy requirement. Internal run data and its CSV retain the input precision.

Gold purity is not metallurgical recovery. These run measurements cannot establish metallurgical recovery. The annual form leaves it blank until a reconciled whole percentage is supplied. Additional commodities or multiple product/feed streams require separate reconciliation in the official template; the single-stream gold summary does not establish those values.

The reporting period is 1 July–30 June in Australia/Brisbane. Run end timestamps, not start or entry timestamps, assign completed production to the year. Unknown historical start times stay unrecorded rather than being invented. The usual deadline is 30 September; refer to current GSQ guidance for non-business-day adjustments. Historical periods stay independent. An empty register never constitutes a nil return.

The annual page also holds working rows for mine details, tenement status, mining, transfers, stockpiles and sales. Those figures are not inferred from processing. Operating days are not run counts; tonnes processed are not tonnes mined; gold produced is not gold sold. Temporary toll movements do not automatically constitute ownership transfers. Confirm original feed, final output and reporting ownership to avoid double-counting linked processing steps.

Component CSVs preserve official headers and filenames and convert dates to DD-MM-YYYY. Export requires completed fields, coverage confirmation and component review. Every processing mutation advances a workspace revision, including a date correction that moves a run out of a historical period. Stale annual reviews cannot export until reviewed and saved again. Export reads one database snapshot, preventing API row caps or mixed revisions from silently truncating the report.

This is preparation support. The operator/adviser reviews the return and lodges it through GSQ. The app records a lodgement date/reference only when explicitly supplied; it does not submit, certify compliance or calculate royalties.

## Verification

Run `npm run test:gic` and `npm run build`. Tests run the actual SQL migration in isolated PGlite PostgreSQL with simulated auth roles. They verify RLS, cross-workspace denial, viewer restrictions, immutable audit history, corrections, stale-write rejection, reporting revisions, financial-year boundaries, export formatting and formula-injection protection. They do not substitute for live Supabase authentication and email-delivery tests.

Private pages are dynamically rendered, excluded from search indexing and caching, and isolated from public-site analytics. The corporate layout and URLs are preserved, with GIC access in the navigation and footer.
