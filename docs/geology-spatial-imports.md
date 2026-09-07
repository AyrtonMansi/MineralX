# Project map interchange and layers — 2026.09.07.2

Source baseline: production 773996a6d4e98ce910ee8b50202163c4278c52d3. This is a new implementation on the released geology product, not recovery of the lost 073a899 enterprise source. No corporate, clothing, plant or GIC code is replaced.

## Previous gap

The surviving tenement import accepted text KML only and selected the first outer ring, with fallbacks capable of interpreting non-polygon coordinates as a boundary. Additional tenements and holes were omitted. There was no general persistent KML/KMZ reference-layer workflow. The layer panel displayed a large public-data catalogue alongside project and analysis layers.

## Project workflow

Review → Import KML / KMZ / GeoJSON, or Map → Map layers → Import map files. Choose one or several source files, inspect geometry counts, names, folder paths and attributes, select features, then save to the named destination project. Separate reference layer is the default; imported points do not become physical sample bags or approved assays. Boundary mode is explicit and uses every selected polygon including multipart geometry and inner rings. Adding polygons is the default; replacing an existing boundary requires an explicit checkbox and retains prior geometry in history.

The map uses GeoJSON sources and circle/line/fill layers rather than one DOM marker per imported feature. The project boundary is a distinct outline. Visibility follows the original stable project/layer IDs. Layer details expose opacity, rename, zoom, source provenance, original-file/GeoJSON/KML exports and non-destructive archival. Public catalogue choices are separated from working layers; analysis and other projects are collapsed. Current project selection remains the existing workspace control.

## Persistence

Source bytes, SHA-256, filenames, normalized features, attributes, source-selection identity, boundary history and imported reference records are part of the existing transactional IndexedDB workspace and full backup. Save waits for the storage transaction; failed writes retain the preview and never report success. Imports are idempotent per source plus feature selection. Legacy boundary.coords records remain compatible. spatialVersion:1 is additive; existing field/lab records are retained. Layer preference persistence preserves mx-layers-v1 IDs and reports quota failures; backup restore reinstalls preferences in the open workspace. No records are silently moved across projects or origins.

## File coverage and limits

KML and KMZ: Point, LineString, Polygon, nested MultiGeometry, folder names and ExtendedData. KMZ reads embedded KML documents with bounded stored/deflate decompression, verified CRC/length and safe entry names. GeoJSON: Point/MultiPoint, LineString/MultiLineString, Polygon/MultiPolygon and GeometryCollection. WGS84 longitude/latitude only; projected or unknown declared CRS is rejected rather than guessed. KML longitude,latitude order and altitude values are retained. Basic inline/shared KML colors and widths are recognized; normalized exports do not promise all native symbology. Exact original bytes can always be exported after successful import.

Limits: 10 MiB per file, 32 MiB expanded KMZ, 256 ZIP entries, 10,000 features and 100,000 vertices per source. Browser support for native deflate-raw decompression is required for compressed KMZ; unsupported browsers receive an explicit error and can import the extracted KML. No new runtime dependencies or paid services were added.

NetworkLink, images/overlays, 3D models/tracks/tours and other embedded resources are not fetched or rendered; warnings require acknowledgement and original files are retained. KML DTD/entities, path traversal, encrypted/ZIP64 archives, malformed coordinates and inconsistent ZIP metadata are rejected. Popup and layer labels treat imported attributes as text, never executable markup. Native Shapefile, GeoPackage, DXF and proprietary geological project formats are not supported directly; export a vector interchange format or use existing CSV field/laboratory ingestion. This is not an assay-import bypass.

## Release gates

The local pure-function suite passed 223 tests before publication. New browser scenarios are authored for complete tenements/holes/source export; multi-document KMZ and blocked network links; visible safe map attributes, opacity and mobile layers; malicious/invalid file rejection; aborted imports retaining previews; and full backup/restore in a new context. These must actually run with the nine existing field/lab journeys before merge. Read-only main CI then repeats against delivered production JavaScript and verifies the exact main SHA and release. Synthetic fixture coverage is not certification of every third-party export or a field pilot.

The product remains browser-local with cloudSync:false. No Supabase migration, cloud synchronization or authentication changes are included. Preserve old-origin records and backups; do not clear browser storage to refresh an app deployment. Original preservation and reconciliation branches remain unchanged.
