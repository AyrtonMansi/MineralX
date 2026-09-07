// Local vector interchange only. No network links, executable descriptions or CRS guessing.
export const SPATIAL_LIMITS = Object.freeze({ fileBytes: 10 * 1024 * 1024, expandedBytes: 32 * 1024 * 1024, entries: 256, features: 10000, vertices: 100000 });
const fail = message => { throw new Error(message); };
const clone = value => JSON.parse(JSON.stringify(value));
const supported = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);
const xml = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const children = node => Array.from(node?.childNodes || []).filter(n => n.nodeType === 1);
const child = (node, name) => children(node).find(n => n.localName === name);
const text = (node, name) => (child(node, name)?.textContent || '').trim();
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const fc = features => ({ type: 'FeatureCollection', features });

export function validateGeometry(geometry, budget = { vertices: 0 }, depth = 0) {
  if (!geometry || !supported.has(geometry.type) || depth > 12) fail('Unsupported or excessively nested vector geometry.');
  const position = p => {
    if (!Array.isArray(p) || p.length < 2 || p.length > 3 || p.some(v => typeof v !== 'number' || !Number.isFinite(v))) fail('Coordinates must contain finite longitude, latitude and optional altitude.');
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) fail('Coordinates are outside WGS84 longitude/latitude. Export in EPSG:4326 / WGS84; no coordinate system was guessed.');
    if (++budget.vertices > SPATIAL_LIMITS.vertices) fail('Too many vertices. Split this file into smaller layers.');
    return p.slice();
  };
  const line = points => {
    if (!Array.isArray(points) || points.length < 2) fail('A line needs at least two positions.');
    return points.map(position);
  };
  const ring = points => {
    const result = line(points);
    if (new Set(result.map(p => `${p[0]},${p[1]}`)).size < 3) fail('A polygon ring needs three distinct positions.');
    if (JSON.stringify(result[0]) !== JSON.stringify(result[result.length - 1])) result.push(result[0].slice());
    return result;
  };
  const polygon = rings => {
    if (!Array.isArray(rings) || !rings.length) fail('A polygon needs an exterior ring.');
    return rings.map(ring);
  };
  const many = (values, fn) => {
    if (!Array.isArray(values) || !values.length) fail('Empty geometry cannot be imported.');
    return values.map(fn);
  };
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'Point': return { type: geometry.type, coordinates: position(c) };
    case 'MultiPoint': return { type: geometry.type, coordinates: many(c, position) };
    case 'LineString': return { type: geometry.type, coordinates: line(c) };
    case 'MultiLineString': return { type: geometry.type, coordinates: many(c, line) };
    case 'Polygon': return { type: geometry.type, coordinates: polygon(c) };
    case 'MultiPolygon': return { type: geometry.type, coordinates: many(c, polygon) };
    default: return { type: 'GeometryCollection', geometries: many(geometry.geometries, g => validateGeometry(g, budget, depth + 1)) };
  }
}

function flattenGeometry(geometry) {
  return geometry.type === 'GeometryCollection' ? geometry.geometries.flatMap(flattenGeometry) : [geometry];
}
export function spatialStats(data) {
  const result = { features: data.features.length, points: 0, lines: 0, polygons: 0 };
  for (const f of data.features) for (const g of flattenGeometry(f.geometry)) {
    if (g.type.includes('Point')) result.points += g.type === 'MultiPoint' ? g.coordinates.length : 1;
    if (g.type.includes('LineString')) result.lines += g.type === 'MultiLineString' ? g.coordinates.length : 1;
    if (g.type.includes('Polygon')) result.polygons += g.type === 'MultiPolygon' ? g.coordinates.length : 1;
  }
  return result;
}
export function spatialBounds(data) {
  const positions = [];
  const walk = c => { if (typeof c?.[0] === 'number') positions.push(c); else if (Array.isArray(c)) c.forEach(walk); };
  for (const f of data?.features || []) for (const g of flattenGeometry(f.geometry)) walk(g.coordinates);
  if (!positions.length) return null;
  let minLat = 90, maxLat = -90;
  const lons = positions.map(p => { minLat = Math.min(minLat, p[1]); maxLat = Math.max(maxLat, p[1]); return (p[0] + 360) % 360; }).sort((a, b) => a - b);
  // Fit the smallest longitudinal arc, including tenements crossing the antimeridian.
  let gap = -1, index = 0;
  lons.forEach((lon, i) => { const next = i === lons.length - 1 ? lons[0] + 360 : lons[i + 1]; if (next - lon > gap) { gap = next - lon; index = i; } });
  let west = lons[(index + 1) % lons.length], east = lons[index];
  if (east < west) east += 360;
  if (west > 180) { west -= 360; east -= 360; }
  return [[west, minLat], [east, maxLat]];
}

export function parseGeoJson(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  const crs = obj?.crs?.properties?.name;
  if (obj?.crs && !['EPSG:4326', 'urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:EPSG::4326', 'CRS84'].includes(crs)) fail('Projected or unknown GeoJSON CRS. Export WGS84 longitude/latitude (EPSG:4326).');
  const rows = obj?.type === 'FeatureCollection' ? obj.features : obj?.type === 'Feature' ? [obj] : supported.has(obj?.type) ? [{ type: 'Feature', properties: {}, geometry: obj }] : null;
  if (!Array.isArray(rows) || !rows.length || rows.length > SPATIAL_LIMITS.features) fail('GeoJSON must contain 1–10,000 vector features.');
  const warnings = [], features = [], budget = { vertices: 0 };
  rows.forEach((row, i) => {
    if (row?.type !== 'Feature') fail(`Row ${i + 1} is not a GeoJSON Feature.`);
    if (row.geometry == null) { warnings.push(`Feature ${i + 1}: null geometry, not mapped. Original retained.`); return; }
    try {
      if (row.properties != null && (Array.isArray(row.properties) || typeof row.properties !== 'object')) fail('Properties must be an object.');
      const geometry = validateGeometry(row.geometry, budget);
      features.push({ ...clone(row), properties: clone(row.properties || {}), geometry });
    } catch (error) { fail(`Feature ${i + 1}: ${error.message}`); }
  });
  if (!features.length) fail('No supported vector features found.');
  return { data: fc(features), warnings, stats: spatialStats(fc(features)) };
}

export function parseKml(textInput, Parser = globalThis.DOMParser, { allowEmpty = false } = {}) {
  if (typeof textInput !== 'string' || !textInput.trim()) fail('The KML file is empty.');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(textInput)) fail('KML document types and entity declarations are not allowed.');
  if (!Parser) fail('XML parsing is unavailable in this environment.');
  const doc = new Parser().parseFromString(textInput, 'application/xml');
  if (descendants(doc, 'parsererror').length || doc.documentElement?.localName !== 'kml') fail('Invalid KML XML document.');
  const warnings = [], features = [], budget = { vertices: 0 };
  const placemarks = descendants(doc, 'Placemark');
  if (placemarks.length > SPATIAL_LIMITS.features) fail('Too many placemarks. Split this file into smaller layers.');
  for (const type of ['NetworkLink', 'GroundOverlay', 'ScreenOverlay', 'PhotoOverlay', 'Model', 'Tour', 'Track']) {
    const count = descendants(doc, type).length;
    if (count) warnings.push(`${count} ${type} item(s) not rendered. No linked resources fetched; original file retained.`);
  }
  const coordinateList = node => {
    const value = text(node, 'coordinates');
    if (!value) fail('Missing coordinates.');
    return value.split(/\s+/).map(tuple => {
      const fields = tuple.split(',');
      if (fields.length < 2 || fields.length > 3 || fields.some(v => !v.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v.trim()))) fail('Malformed coordinate tuple. No vertices were discarded.');
      return fields.map(Number);
    });
  };
  const geometry = (node, depth = 0) => {
    if (depth > 12) fail('KML geometry is nested too deeply.');
    switch (node.localName) {
      case 'Point': { const coords = coordinateList(node); if (coords.length !== 1) fail('A Point must have one coordinate.'); return { type: 'Point', coordinates: coords[0] }; }
      case 'LineString': return { type: 'LineString', coordinates: coordinateList(node) };
      case 'Polygon': {
        const outer = child(child(node, 'outerBoundaryIs'), 'LinearRing');
        if (!outer) fail('Polygon exterior ring is missing.');
        const holes = children(node).filter(n => n.localName === 'innerBoundaryIs').map(n => child(n, 'LinearRing'));
        if (holes.some(n => !n)) fail('Polygon interior ring is missing.');
        return { type: 'Polygon', coordinates: [outer, ...holes].map(coordinateList) };
      }
      case 'MultiGeometry': {
        const geometries = children(node).filter(n => ['Point', 'LineString', 'Polygon', 'MultiGeometry'].includes(n.localName)).map(n => geometry(n, depth + 1));
        return { type: 'GeometryCollection', geometries };
      }
      default: return null;
    }
  };
  const styles = new Map(descendants(doc, 'Style').filter(n => n.getAttribute('id')).map(n => [n.getAttribute('id'), n]));
  const styleMaps = new Map(descendants(doc, 'StyleMap').map(n => [n.getAttribute('id'), n]));
  const kmlColor = value => /^[\da-f]{8}$/i.test(value) ? { color: `#${value.slice(6, 8)}${value.slice(4, 6)}${value.slice(2, 4)}`, opacity: parseInt(value.slice(0, 2), 16) / 255 } : null;
  placemarks.forEach((pm, index) => {
    try {
      const elements = children(pm).filter(n => ['Point', 'LineString', 'Polygon', 'MultiGeometry'].includes(n.localName));
      if (!elements.length) { warnings.push(`Placemark ${index + 1} (${text(pm, 'name') || 'unnamed'}): no supported vector geometry; original retained.`); return; }
      const geometries = elements.map(n => geometry(n));
      const shape = validateGeometry(geometries.length === 1 ? geometries[0] : { type: 'GeometryCollection', geometries }, budget);
      const folderPath = [];
      for (let n = pm.parentNode; n && n !== doc; n = n.parentNode) if (['Folder', 'Document'].includes(n.localName) && text(n, 'name')) folderPath.unshift(text(n, 'name'));
      const extendedData = Object.create(null);
      for (const n of descendants(pm, 'Data')) extendedData[n.getAttribute('name') || 'unnamed'] = text(n, 'value');
      for (const n of descendants(pm, 'SimpleData')) extendedData[n.getAttribute('name') || 'unnamed'] = n.textContent || '';
      const styleUrl = text(pm, 'styleUrl');
      let style = child(pm, 'Style') || (styleUrl.startsWith('#') ? styles.get(styleUrl.slice(1)) : null);
      if (!style && styleMaps.has(styleUrl.slice(1))) {
        const pair = children(styleMaps.get(styleUrl.slice(1))).find(n => n.localName === 'Pair' && text(n, 'key') === 'normal');
        style = styles.get(text(pair, 'styleUrl').replace(/^#/, ''));
      }
      const lineStyle = child(style, 'LineStyle'), polyStyle = child(style, 'PolyStyle'), iconStyle = child(style, 'IconStyle');
      const stroke = kmlColor(text(lineStyle, 'color')), fill = kmlColor(text(polyStyle, 'color')), pointColor = kmlColor(text(iconStyle, 'color'));
      const properties = { name: text(pm, 'name') || `Feature ${index + 1}`, description: text(pm, 'description'), folderPath, kmlId: pm.getAttribute('id') || '', extendedData, styleUrl };
      if (stroke) { properties.stroke = stroke.color; properties['stroke-opacity'] = stroke.opacity; }
      if (fill) { properties.fill = fill.color; properties['fill-opacity'] = fill.opacity; }
      if (pointColor) properties['marker-color'] = pointColor.color;
      if (text(polyStyle, 'fill') === '0') properties['fill-opacity'] = 0;
      const width = Number(text(lineStyle, 'width')); if (width > 0 && Number.isFinite(width)) properties['stroke-width'] = Math.min(width, 12);
      const mode = descendants(pm, 'altitudeMode').map(n => n.textContent?.trim()).filter(Boolean);
      if (mode.length) properties.altitudeModes = mode;
      features.push({ type: 'Feature', properties, geometry: shape });
    } catch (error) { fail(`Placemark ${index + 1} (${text(pm, 'name') || 'unnamed'}): ${error.message}`); }
  });
  if (!features.length && !allowEmpty) fail('No supported KML points, lines or polygons found. Network links and image-only overlays are not vector imports.');
  if (descendants(doc, 'altitudeMode').some(n => n.textContent?.trim() !== 'clampToGround') || descendants(doc, 'extrude').some(n => n.textContent?.trim() === '1')) warnings.push('Altitude coordinates are retained; map display is ground-clamped, not a 3D model.');
  return { data: fc(features), warnings, stats: spatialStats(fc(features)) };
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
// ZIP central-directory bounds are checked before allocation; actual output is bounded too.
export async function readKmz(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length > SPATIAL_LIMITS.fileBytes || data.length < 22) fail('KMZ is empty, truncated or exceeds 10 MiB.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === data.length) { end = i; break; }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail('Invalid or multi-volume KMZ archive.');
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (!count || count > SPATIAL_LIMITS.entries || view.getUint16(end + 8, true) !== count || start + size !== end) fail('Unsupported KMZ directory or too many entries.');
  const names = new Set(), kmlEntries = []; let cursor = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail('Damaged KMZ directory.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), crc = view.getUint32(cursor + 16, true), compressed = view.getUint32(cursor + 20, true), expanded = view.getUint32(cursor + 24, true);
    const length = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true), offset = view.getUint32(cursor + 42, true);
    if (cursor + 46 + length + extra + comment > end || flags & 1 || ![0, 8].includes(method) || expanded === 0xffffffff || compressed === 0xffffffff) fail('Encrypted, ZIP64 or unsupported KMZ compression.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(cursor + 46, cursor + 46 + length));
    if (!name || /[\\\0]/.test(name) || name.startsWith('/') || name.includes(':') || name.split('/').includes('..') || names.has(name.toLowerCase())) fail('Unsafe or duplicate KMZ entry name.');
    names.add(name.toLowerCase()); total += expanded;
    if (total > SPATIAL_LIMITS.expandedBytes) fail('KMZ expands beyond the 32 MiB safety limit.');
    if (offset + 30 > start || view.getUint32(offset, true) !== 0x04034b50) fail('Invalid KMZ file header.');
    const localLength = view.getUint16(offset + 26, true), localExtra = view.getUint16(offset + 28, true), contentStart = offset + 30 + localLength + localExtra;
    if (contentStart + compressed > start || view.getUint16(offset + 8, true) !== method || view.getUint16(offset + 6, true) !== flags) fail('KMZ directory and local file header disagree.');
    const localName = new TextDecoder().decode(data.subarray(offset + 30, offset + 30 + localLength));
    if (localName !== name) fail('KMZ entry names disagree.');
    if (/\.kml$/i.test(name)) kmlEntries.push({ name, method, crc, expanded, content: data.subarray(contentStart, contentStart + compressed) });
    cursor += 46 + length + extra + comment;
  }
  if (cursor !== end || !kmlEntries.length) fail('No KML documents found in this KMZ.');
  const result = [];
  for (const entry of kmlEntries) {
    let output;
    if (entry.method === 0) output = entry.content;
    else {
      let stream;
      try { stream = new Blob([entry.content]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
      catch { fail('This browser cannot decompress KMZ. Use a current browser or import its extracted KML.'); }
      const reader = stream.getReader(), chunks = []; let length = 0;
      try {
        while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > entry.expanded || length > SPATIAL_LIMITS.expandedBytes) { await reader.cancel(); fail('KMZ expanded size exceeds its declared limit.'); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      output = new Uint8Array(length); let at = 0; for (const chunk of chunks) { output.set(chunk, at); at += chunk.length; }
    }
    if (output.length !== entry.expanded || crc32(output) !== entry.crc) fail(`KMZ checksum or length mismatch: ${entry.name}`);
    result.push({ name: entry.name, text: decodeText(output) });
  }
  return { documents: result, ignoredEntries: count - kmlEntries.length };
}
function decodeText(bytes) {
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(utf16, { fatal: true }).decode(bytes);
}
export async function readSpatialFile(file) {
  if (!file || file.size > SPATIAL_LIMITS.fileBytes || !file.size) fail('Choose a non-empty file up to 10 MiB.');
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['kml', 'kmz', 'geojson', 'json'].includes(extension)) fail('Use KML, KMZ or WGS84 GeoJSON. Other native GIS formats must be exported first.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const warnings = []; let data;
  if (extension === 'kmz') {
    const archive = await readKmz(bytes), all = [];
    for (const entry of archive.documents) { const parsed = parseKml(entry.text, globalThis.DOMParser, { allowEmpty: true }); for (const f of parsed.data.features) all.push({ ...f, properties: { ...f.properties, kmzDocument: entry.name } }); warnings.push(...parsed.warnings); }
    if (archive.ignoredEntries) warnings.push(`${archive.ignoredEntries} non-KML archive entries retained in the original KMZ, not rendered (icons, images or other resources).`);
    data = parseGeoJson(fc(all)).data;
  } else { const parsed = extension === 'kml' ? parseKml(decodeText(bytes)) : parseGeoJson(decodeText(bytes)); data = parsed.data; warnings.push(...parsed.warnings); }
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  return { recordId: crypto.randomUUID(), name: file.name.replace(/\.(kml|kmz|geojson|json)$/i, ''), data, stats: spatialStats(data), warnings: [...new Set(warnings)], source: { name: file.name, format: extension === 'json' ? 'geojson' : extension, bytes: bytes.length, sha256, base64: btoa(binary) }, importedAt: new Date().toISOString(), crs: 'OGC:CRS84', provenance: 'imported_reference' };
}
export function boundaryData(boundary) {
  if (boundary?.data) return boundary.data;
  if (!boundary?.coords?.length) return fc([]);
  return fc([{ type: 'Feature', properties: { name: boundary.name || 'Boundary' }, geometry: validateGeometry({ type: 'Polygon', coordinates: [boundary.coords.map(([lat, lng]) => [lng, lat])] }) }]);
}
export function polygonData(data) {
  const features = [];
  for (const f of data.features) for (const g of flattenGeometry(f.geometry)) if (['Polygon', 'MultiPolygon'].includes(g.type)) features.push({ ...f, geometry: g });
  return fc(features);
}
export function commitSpatialImports(project, items) {
  if (!items.length) fail('Select at least one layer.');
  let next = project;
  for (const { layer, role = 'reference', replace = false, selectedIndexes, acknowledged = false } of items) {
    if (!layer.name?.trim()) fail('Enter a layer name.');
    if (!['reference', 'boundary'].includes(role)) fail('Unknown import destination.');
    if (layer.warnings.length && !acknowledged) fail('Review and acknowledge import warnings before saving.');
    const features = selectedIndexes ? layer.data.features.filter((_, i) => selectedIndexes.includes(i)) : layer.data.features;
    if (!features.length) fail('Select at least one feature.');
    const selected = fc(clone(features)); parseGeoJson(selected);
    const existing = (next.spatialLayers || []).find(l => l.source?.sha256 === layer.source.sha256 && JSON.stringify(l.selectedIndexes || null) === JSON.stringify(selectedIndexes || null));
    if (existing?.archivedAt) fail('This source is already archived. Restore it from the layer details instead of duplicating it.');
    const stored = existing || { ...layer, data: selected, stats: spatialStats(selected), selectedIndexes: selectedIndexes || null };
    if (!existing) next = { ...next, spatialLayers: [...(next.spatialLayers || []), stored] };
    if (role === 'boundary') {
      const polygons = polygonData(selected);
      if (!polygons.features.length) fail('A project boundary requires polygons, not lines or points.');
      const prev = next.boundary;
      const sourceIds = prev?.sourceLayerIds || [];
      if (!replace && sourceIds.includes(stored.recordId)) continue;
      const combined = replace ? polygons : fc([...boundaryData(prev).features, ...polygons.features]);
      const first = combined.features[0].geometry;
      const coords = (first.type === 'Polygon' ? first.coordinates[0] : first.coordinates[0][0]).map(([lng, lat]) => [lat, lng]);
      next = { ...next, boundary: { name: prev?.name || layer.name, coords, data: combined, sourceLayerIds: replace ? [stored.recordId] : [...sourceIds, stored.recordId] }, boundaryHistory: prev ? [...(next.boundaryHistory || []), { ...prev, supersededAt: new Date().toISOString(), reason: replace ? 'Explicit replacement' : 'Added tenement polygons' }] : next.boundaryHistory || [] };
    }
  }
  return { ...next, spatialVersion: 1 };
}
export function dataToKml(name, data) {
  const coordinates = c => `<coordinates>${c.map(p => p.join(',')).join(' ')}</coordinates>`;
  const geometry = g => {
    switch (g.type) {
      case 'Point': return `<Point>${coordinates([g.coordinates])}</Point>`;
      case 'LineString': return `<LineString>${coordinates(g.coordinates)}</LineString>`;
      case 'Polygon': return `<Polygon>${g.coordinates.map((r, i) => `<${i ? 'inner' : 'outer'}BoundaryIs><LinearRing>${coordinates(r)}</LinearRing></${i ? 'inner' : 'outer'}BoundaryIs>`).join('')}</Polygon>`;
      case 'GeometryCollection': return `<MultiGeometry>${g.geometries.map(geometry).join('')}</MultiGeometry>`;
      default: { const type = { MultiPoint: 'Point', MultiLineString: 'LineString', MultiPolygon: 'Polygon' }[g.type]; return `<MultiGeometry>${g.coordinates.map(c => geometry({ type, coordinates: c })).join('')}</MultiGeometry>`; }
    }
  };
  parseGeoJson(data);
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name>${data.features.map(f => {
    const p = f.properties || {};
    const values = { ...p.extendedData, ...p }; delete values.extendedData;
    return `<Placemark><name>${xml(p.name || f.id || 'Feature')}</name><description>${xml(p.description || '')}</description><ExtendedData>${Object.entries(values).map(([key, value]) => `<Data name="${xml(key)}"><value>${xml(typeof value === 'object' ? JSON.stringify(value) : value)}</value></Data>`).join('')}</ExtendedData>${geometry(f.geometry)}</Placemark>`;
  }).join('')}</Document></kml>`;
}
export function downloadSpatialSource(layer) {
  const bytes = Uint8Array.from(atob(layer.source.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })), a = document.createElement('a');
  a.href = url; a.download = layer.source.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
