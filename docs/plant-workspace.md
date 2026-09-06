# Plant workspace — public P5 review

The owner explicitly requested public access at `/plant` on 6 September 2026. The page renders the approved P5 design directly, without Supabase authentication or a database import. Public access is limited to this design page and its review-note endpoint; GIC production records and their membership controls remain unchanged.

P5 removes the oversize draining transfer, connects the screen directly to the VSI using the labelled CV02 belt conveyor, and sets the screen target to 0.8 mm. It preserves one Russell jig, the P4 horizontal arrangement, the 70 m south placement, zoom/pinch/pan, measurement, notes, circuit tracing and current KML/SVG export. `data/plant-p5.json` is the explicitly approved public planning dataset. Private email and Drive correspondence links are omitted.

## Saved notes

`/api/plant/notes` proxies to the existing Josephine Site's public D1-backed notes API. Only the dedicated `mx_plant_reviewer` cookie is forwarded. Supabase, GIC and other browser credentials are excluded. The service issues a random 256-bit HttpOnly/Secure/SameSite=Lax browser credential and stores only its hash as the author ID. Notes are publicly readable. Only the browser holding a note's author credential can edit or resolve it. Clearing that browser cookie loses editing access; there is no account login in this temporary public workflow.

Both proxy and backend enforce JSON inputs, same-origin writes, bounded bodies and no-store responses. The backend validates anchors, uses prepared SQL, guards updates with versions and handles safe retries. Failed saves preserve the in-page draft. Existing private `plant_layouts` database permissions are retained for any future authenticated operation workspace; no GIC data is publicly readable.

## Verification

Run `node --import tsx --test tests/plant/*.test.ts tests/gic/*.test.ts`, then `npm run build`. Verify production `/plant` returns the plan without a login redirect, its assets return successfully, the notes endpoint establishes a reviewer cookie, and GIC still redirects unauthenticated visitors to its login.
