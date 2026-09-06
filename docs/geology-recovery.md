# Geological workspace release recovery — 6 September 2026

This branch starts from production b4ff85409be1b25fe9149b90fba71f34b21f5f56. It ports only the geological app, its supporting modules, and its tests from 8918ded239aedb64a35d6d24690e9f91d750d170. Corporate, clothing, GIC and plant source trees remain intact. It retains the production Next.js 15.5.25 baseline.

The reported uncommitted implementation from the interrupted conversation was not found in the remote refs or saved file artifacts. This is a reconstruction, not a claim those working-directory bytes were recovered. Both original recovery refs remain available. Do not replace main with the old geology branch.

Before release: fix the data-integrity defects in the Geological Surface Review; verify the combined build and operational tests; record the production SHA. The /api/mineralx-release endpoint identifies the served revision. A deployment-specific preview URL does not follow future main releases.

Existing records are stored per browser origin. Changing from a preview hostname to the production domain does not transfer browser records. Preserve the old origin and export a full backup before migration. Never clear or overwrite the user's old browser data.

Paid extraction is explicitly disabled in this candidate until its authorization boundary is configured. No secrets or operational datasets are embedded in this branch.
