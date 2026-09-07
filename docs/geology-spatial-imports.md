# Project map interchange and layers — 2026.09.07.2

Source baseline: production 773996a6d4e98ce910ee8b50202163c4278c52d3. This is new implementation on the released geology product, not recovery of the lost 073a899 enterprise source. Corporate, clothing, plant and GIC code remain unchanged. Original preservation/reconciliation branches are not modified.

## Previous gap

The old tenement import read text KML and selected the first outer ring. Additional tenements and interior exclusions were omitted, and a coordinate fallback could mistake non-polygons for a boundary. There was no complete persistent KML/KMZ reference-layer workflow. The layer panel combined a large public catalogue with project and analysis layers.

## Import flow

Map → Map layers → Import map files, or Review → Import KML / KMZ / GeoJSON. Choose one or several files, inspect feature counts, names, folder paths and attributes, select features, then save to the explicitly named project. Separate reference layer is the default. Imported points do not become physical samples or approved assays.

Boundary mode uses all selected polygons including multipart geometry and inner rings. Adding tenements is the default; replacing an existing boundary requires a separate explicit checkbox and retains the previous boundary in history. The original source also remains available as an independent reference layer. Its fill and the separate boundary outline have independent visibility, which is explained in layer details.

Project extents are fitted on reload so a fixed zoom no longer hides remote parts of a multipart tenement. GeoJSON sources and circle/line/fill layers render imported vectors; no DOM marker is created per imported feature. Boundaries are distinct outlines above imported fills; published raster overlays sit below project vectors. Point opacity also applies to its stroke.

## Layer panel

Active project data first; imported files next; public reference catalogue behind Add reference layers. Analysis and other projects are collapsed. Search filters layers. Layer details reveal opacity, rename, zoom, attributes, source/original-file export, GeoJSON/KML export and archival. Existing stable layer IDs and visibility preferences are preserved. Record management closes the layers panel rather than stacking two large editors on mobile. Leaving a pending import through navigation, Escape or Back requires confirmation; leaving during validation or save is blocked. Browser unload warns while a preview remains unsaved.

## Persistence and recovery

Original file bytes, filename, SHA-256, normalized features/attributes, selections, source IDs and boundary history are stored inside the existing transactional IndexedDB workspace and full backup. Successful import waits for the transaction, then reports Saved. An aborted write retains the preview and reports an unconfirmed save. Reimport is idempotent for the same source and selection. Existing boundary.coords records remain compatible; spatialVersion:1 is additive.

Layer visibility, opacity, details state, basemap and element selection use the existing mx-layers-v1 storage. Preference quota errors remain visible. The full backup takes the current open view rather than stale disk preferences, including when a preference write fails. Restoring a backup reapplies view preferences in the open workspace. No records are silently moved between projects or origins. Archive/restore retains source material rather than deleting it.

## Coverage and safety limits

KML/KMZ: Point, LineString, Polygon, nested MultiGeometry, document/folder names and ExtendedData. KMZ processes its embedded KML documents with bounded stored/deflate decompression, verified length/CRC and safe entry names. GeoJSON: Point/MultiPoint, LineString/MultiLineString, Polygon/MultiPolygon and GeometryCollection. Coordinates must be WGS84 longitude/latitude. Declared projected/unknown CRS is rejected rather than guessed. KML coordinate altitude values are retained, but display is ground-clamped. Basic inline/shared KML colors and widths are recognized; normalized exports do not promise native styling fidelity. Exact original bytes remain exportable.

Limits: 10 MiB per file; 32 MiB expanded KMZ; 256 archive entries; 10,000 features and 100,000 vertices per source. Compressed KMZ requires browser native deflate-raw support; an unsupported browser receives an explicit error and can use the extracted KML. No runtime dependencies or paid services added.

NetworkLink, images/overlays, 3D models/tracks/tours and other embedded resources are not fetched or rendered. Warnings require acknowledgement; original archives remain stored. DTD/entity declarations, unsafe archive names, encrypted/ZIP64 archives, bad CRC/size, malformed coordinates and unknown CRS are rejected. Imported attributes are displayed as text, not executable markup. Native Shapefile, GeoPackage, DXF and proprietary geological projects are not directly supported: export an accepted vector interchange format, or use existing CSV field/laboratory ingestion.

## Verification

Expanded normal source passed 223 geology tests, 23 GIC/plant tests, production build, seven route smoke checks and 17 Chromium browser journeys in run 34074749540. The last renderer regression adds a test for point-stroke opacity, parent visibility and boundary order; both original rendering defects were observed failing before correction. Local total after that correction: 224/224 tests. The exact final PR must pass the complete suite before merge; main then repeats all 17 workflows against production JavaScript and checks the exact deployed SHA.

The 17 browser journeys include the existing nine field/laboratory/recovery cases plus eight spatial cases: multipart tenements and exact exports; multi-document KMZ/no external link execution; GeoJSON popup/opacity/mobile/archive; invalid and malicious files; aborted import; fresh-context full backup/restore; navigation protection; and preference-quota backup recovery. They use synthetic source files and isolated browser records. Raster tiles are stubbed in deterministic workflows; application/storage/workflow logic are real. Separate production identity checks do not mock the network. These are not real-device Safari, every-vendor-format, field-pilot or map-provider coverage certifications.

Temporary source transport and write-permission bootstrap workflow are removed from the release tree. Main CI remains contents-read only. The app remains browser-local with cloudSync:false; no Supabase migration, cloud synchronization or authentication change is included. Keep old-origin records/backups intact; do not clear storage to refresh a deployment.
