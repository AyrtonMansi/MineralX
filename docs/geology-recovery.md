# Geological workspace recovery and release — 6 September 2026

## Provenance

Production baseline: b4ff85409be1b25fe9149b90fba71f34b21f5f56. Recovered geological source: 8918ded239aedb64a35d6d24690e9f91d750d170. The integration preserves corporate, clothing, GIC and plant source trees and keeps the production Next.js 15.5.25 baseline.

The reported uncommitted implementation from the interrupted conversation was not found in remote refs or saved source artifacts. This release reconstructs the approved workflows; it does not claim those working-directory bytes were recovered. Original recovery/geology-2026-09-06 and recovery/production-2026-09-06 refs remain untouched.

## Implemented in 2026.09.06.1

Map / Programs / Samples / Drilling / Review share one physical sample register. Ad hoc collection does not require a program. Programs can be assigned later without changing bag identity. RC and diamond-core samples have positive, non-overlapping intervals linked to a project collar and a unique physical bag. Point observations remain separate from physical samples.

Field drafts, GPS accuracy, Save and next, dispatch membership, cumulative laboratory receipt reconciliation, source CSV staging, explicit named review, unit conversions, analytical history and full backup/restore are implemented. Explicitly staged results do not replace active grades before release. A local reviewer name is not an authenticated signature or automated QA/QC acceptance.

A transactional IndexedDB revision check rejects stale-tab writes. Legacy localStorage bytes are never deleted by migration; corrupt input blocks autosave instead of falling back to demo. Backups include all stored records, photos, assay source/history, dispatches, map settings and drafts, with a SHA-256 integrity check. CSV quoting and collection dates are preserved; project filters determine downhole export membership.

The app shell and its static assets can be prepared for offline reload under /mineralx only. API data, map-provider requests and other product pages are not cached by that service worker. Basemaps and public layers still require connectivity. The visible offline-readiness indicator is based on asset-cache completion.

## Scope and release gates

This is a local-device workspace, not a cloud-synchronized multiuser geological database. Server roles, shared revision synchronization, laboratory-specific automated QA/QC, authenticated AI extraction, full channel/composite geometry and certified regulatory reporting remain outside this release. Unsupported AI extraction returns an explicit 503, not a fake result. Existing records of other sampling types remain preserved.

New integrity tests exercise units, raw results, duplicate identities, intervals, project boundaries, backup checksums and corrupt legacy storage. Browser release tests exercise collection-to-assay, drill sampling, draft/GPS recovery, concurrent tabs, corrupt storage and offline reload against a production build. Require the final source revision to pass these checks before merging. Existing GIC/plant tests and corporate/clothing route checks must also pass.

## Deployment and data migration

/api/mineralx-release identifies the exact served Git SHA. The stable production path is /mineralx. A deployment-specific preview hostname remains pinned to its original build; it will not follow future main releases.

Browser data belongs to its original origin. Moving to the production domain does not transfer an old preview's local records. Keep the original tab/domain intact and export records before transferring them. Never clear the old preview storage as a troubleshooting step. This recovery did not access, remove or alter the user's browser records or operating datasets.
