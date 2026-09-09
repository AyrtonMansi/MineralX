# Pits and stockpiles — Operations 2026.09.09.2

`/ops/pit` extends the suite released in PR 14. That PR was already merged as `f681ac8ea7da9057d86deba2bd50c63e9272b57c`, served by the production release endpoint, with successful main Operations and Geology workflows (34309343559 and 34309343609). The prior feature branches are ancestors of main; remaining non-ancestor commits are preservation snapshots, not unreleased product work.

## Capture and edit

1. Scan with a native LiDAR scanner on a supported iPhone Pro or iPad Pro. For example, use [Polycam LiDAR Mesh mode](https://learn.poly.cam/hc/en-us/articles/36655587097620-How-to-Use-Space-Mode-LiDAR-Devices), then export a mesh to Files. Export availability depends on that app's plan. Apple exposes native mesh capture through [ARKit scene reconstruction](https://developer.apple.com/documentation/arkit/visualizing-and-interacting-with-a-reconstructed-scene). This web release does not supply a native iOS application or obtain LiDAR depth from browser camera video.
2. Select source units and Y/Z upward axis, then import OBJ, ASCII/binary PLY with faces, or ASCII/binary STL. Point-only PLY, videos and unsupported formats receive actionable errors. The import runs in a worker with a timeout, file/count bounds and finite-coordinate checks. No source-file network upload occurs.
3. Inspect the model dimensions. The viewer converts to metres, Y up, and recentres for rendering. Source origin, units, axis, SHA-256 and original bytes are retained. Identical positions are welded to keep seams connected during editing. Textures/materials are not imported; the shaded model displays geometry.
4. Choose Edit surface, select a mesh point, and drag the world X/Y/Z gizmo. The spherical influence radius uses smooth falloff to move a wall or a wider area. Numeric movement supplies the same operation. Original scan geometry is immutable; only the candidate surface changes. Explore, top view, ghost opacity, wireframe, 12-step undo/redo and undoable reset are available.
5. Save locally or export the complete scenario JSON, edited OBJ, or original source bytes. Scenario JSON contains both meshes, source metadata and base64 source bytes, and restores as a new scenario with source integrity verification. Edited OBJ is explicitly local metres, Y up.

## Persistence boundary

Scenarios use a separate IndexedDB database, scoped by presentation mode, actor and site. They do not enter the protected Operations database or its development backup. The page states this before import and beside export. Saves report success only after the read/write transaction commits. Expected-version checks reject stale saves across tabs; reopening reads the latest committed record. Aborted saves preserve the open candidate. Draft navigation uses the existing Operations guard.

Storage is device/browser local and unencrypted. Scenario backup is the portable copy and is required before clearing storage or moving devices. Staff authorization, company records, SQL migrations, account settings and custody powers are unchanged. The existing shared backend commissioning requirements still apply to other suite workflows.

## Measurement boundary

The displayed area is triangulated mesh surface area, not footprint, volume or mass. Displacement compares corresponding vertices with the imported original. A post-excavation scan does not recover former terrain. Open, incomplete, overlapping or drifting phone scans cannot establish defensible cut/fill or stockpile volumes without survey/reference coverage. No volume or geotechnical certification is inferred.

## Verification

The release suite includes mesh formats, source byte/hash preservation, metric/axis conversion, seam welding, deformation falloff, malformed/oversized inputs, backup corruption and edited export checks. Browser acceptance imports a real generated OBJ file, drags the actual 3D gizmo, applies numeric edits, checks immutable original geometry, undo/redo, persistence after reload, backup restore, original-byte download, save conflicts and mobile layout. Synthetic scan data are explicitly identified; no company records are used.

Local Chromium/mobile viewport and delivered-production browser checks are release evidence, not physical iPhone LiDAR/Safari hardware acceptance. A real device scan and scale check remain necessary before operational reliance.
