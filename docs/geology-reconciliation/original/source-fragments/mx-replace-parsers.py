p='components/mineralx/project-store.js';s=open(p).read();a=s.index('export function parseSampleCsv');b=s.index('// Drill collar CSV',a)
s=s[:a]+'''export function parseSampleCsv(text, existing = [], prefix = 'S-', crs, context = {}) {
  const { rows, error } = csvRows(text);
  if (error) return csvFailure('samples', error);
  if (rows.length < 2) return csvFailure('samples', 'CSV needs a header row and at least one data row.');
  const col = headerIndex(rows[0]), elements = detectElementColumns(rows[0]);
  const cell = (row, ...names) => { const i = col(...names); return i < 0 ? '' : row[i] ?? ''; };
  const out = [], rowErrors = [], fieldWarnings = [];
  const ids = new Set(existing.map(r => idKey(r.id)));
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = trimId(cell(row, 'sample_id', 'id')) || nextId([...existing, ...out], prefix);
    if (ids.has(idKey(id))) return csvFailure('samples', `Duplicate sample ID "${id}" at row ${r + 1}. Link to the existing sample or assign a distinct bag ID before import.`);
    ids.add(idKey(id));
    const enumField = (names, choices, fallback) => {
      const raw = cell(row, ...names); if (!raw) return fallback;
      const value = normaliseEnum(raw, choices);
      if (!value) fieldWarnings.push(`row ${r + 1}: unrecognised ${names[0]} "${raw}"`);
      return value || fallback;
    };
    const sampleType = enumField(['sample_type', 'sampletype', 'type'], SAMPLE_TYPES, 'rock_chip');
    const qaqcType = enumField(['qaqc_type', 'qaqc', 'qc_type'], QAQC_TYPES, 'none');
    const coordSource = enumField(['coord_source', 'coordsource', 'coord_src'], COORD_SOURCES, 'unknown');
    const holeId = trimId(cell(row, 'hole_id', 'hole'));
    const duplicateOf = trimId(cell(row, 'duplicate_of', 'dup_of', 'original_id'));
    const from = finiteNumber(cell(row, 'from', 'from_m')), to = finiteNumber(cell(row, 'to', 'to_m'));
    let lat = finiteNumber(cell(row, 'lat', 'latitude', 'northing')), lng = finiteNumber(cell(row, 'lng', 'lon', 'longitude', 'easting'));
    const rawLat = lat, rawLng = lng;
    if (lat != null || lng != null) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { rowErrors.push(`row ${r + 1}: invalid coordinates`); continue; }
      if (crs) { ({ lat, lng } = reprojectEastingNorthing(lng, lat, crs)); }
      else if (isProjectedCoord(lat, lng)) return { samples: [], error: null, needsProjection: true, easting: lng, northing: lat };
      if (!validateCoordinates(lat, lng)) { rowErrors.push(`row ${r + 1}: coordinates out of range`); continue; }
    } else if (!holeId && qaqcType === 'none') { rowErrors.push(`row ${r + 1}: surface sample requires coordinates`); continue; }
    if (holeId) {
      const collar = (context.collars || []).find(c => idKey(c.id) === idKey(holeId));
      if (context.collars && !collar) { rowErrors.push(`row ${r + 1}: unknown hole ${holeId}`); continue; }
      const geometryError = validateInterval({ holeId, from, to }, [...existing, ...out].filter(v => v.qaqcType === 'none' || !v.qaqcType), collar);
      if (geometryError && qaqcType === 'none') { rowErrors.push(`row ${r + 1}: ${geometryError}`); continue; }
    }
    const read = readAssays(row, elements);
    if (read.errors.length) return csvFailure('samples', `Row ${r + 1}: ${read.errors.join(' ')}`);
    const sample = {
      id, recordId: trimId(cell(row, 'record_id')) || newRecordId(), lat, lng, ...assayFields(read),
      lith: cell(row, 'lith', 'lithology'), notes: cell(row, 'notes', 'comment', 'comments'),
      date: sourceDate(cell(row, 'date', 'collection_date', 'collected_at')), importedAt: new Date().toISOString(),
      sampleType, qaqcType, coordSource,
      ...(duplicateOf ? { duplicateOf } : {}), ...(holeId ? { holeId, from, to } : {}),
      ...Object.fromEntries([['programId', 'program_id'], ['collector', 'collector'], ['samplingMethod', 'sampling_method'], ['coordCrs', 'coord_crs'], ['coordTimestamp', 'coord_timestamp']]
        .map(([key, header]) => [key, cell(row, header)]).filter(([, value]) => value !== '')),
    };
    const accuracy = finiteNumber(cell(row, 'horizontal_accuracy_m'));
    if (Number.isFinite(accuracy) && accuracy >= 0) sample.horizontalAccuracy = accuracy;
    if (crs) sample.coordinateProvenance = { sourceCrs: crs, rawEasting: rawLng, rawNorthing: rawLat, transformedAt: new Date().toISOString() };
    for (const [field, header] of [['coordinateProvenance', 'coordinate_provenance'], ['assayResults', 'assay_results'], ['assayHistory', 'assay_history']]) {
      const raw = cell(row, header); if (!raw) continue;
      try { const parsed = JSON.parse(raw); if (field !== 'coordinateProvenance' && !Array.isArray(parsed)) throw new Error(); sample[field] = parsed; }
      catch { return csvFailure('samples', `Row ${r + 1}: invalid ${header} JSON.`); }
    }
    // Exports preserve history as evidence, but a spreadsheet cannot grant approval.
    if (sample.assayResults.length) sample.assayReviewStatus = 'unreviewed';
    out.push(sample);
  }
  if (!out.length) return csvFailure('samples', `No importable rows${rowErrors.length ? ` (${rowErrors.join('; ')})` : ''}.`);
  return { samples: out, error: null, warnings: [rowWarnings(rowErrors), fieldWarnings.length ? `${fieldWarnings.length} values not recognised (default applied): ${fieldWarnings.join('; ')}` : null].filter(Boolean).join(' ') || null };
}

''' +s[b:]
a=s.index('export function parseCollarCsv');b=s.index('// Assay CSV',a)
s=s[:a]+'''export function parseCollarCsv(text, existing = [], prefix = 'H-', crs) {
  const { rows, error } = csvRows(text);
  if (error) return csvFailure('collars', error);
  if (rows.length < 2) return csvFailure('collars', 'CSV needs a header row and at least one data row.');
  const col = headerIndex(rows[0]);
  const cell = (row, ...names) => { const i = col(...names); return i < 0 ? '' : row[i] ?? ''; };
  const out = [], rowErrors = [], ids = new Set(existing.map(r => idKey(r.id)));
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r], id = trimId(cell(row, 'hole_id', 'id')) || nextId([...existing, ...out], prefix);
    if (ids.has(idKey(id))) return csvFailure('collars', `Duplicate hole ID "${id}" at row ${r + 1}. Reconcile before import.`);
    ids.add(idKey(id));
    let lat = finiteNumber(cell(row, 'lat', 'latitude', 'northing')), lng = finiteNumber(cell(row, 'lng', 'lon', 'longitude', 'easting'));
    const rawLat = lat, rawLng = lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (crs) ({ lat, lng } = reprojectEastingNorthing(lng, lat, crs));
      else if (isProjectedCoord(lat, lng)) return { collars: [], error: null, needsProjection: true, easting: lng, northing: lat };
    }
    const collar = { id, recordId: trimId(cell(row, 'record_id')) || newRecordId(), lat, lng,
      azimuth: finiteNumber(cell(row, 'azimuth', 'azi')), dip: finiteNumber(cell(row, 'dip')),
      depth: finiteNumber(cell(row, 'depth', 'eoh', 'planned_depth')), date: sourceDate(cell(row, 'date', 'collection_date')),
      notes: cell(row, 'notes', 'comment', 'comments'), importedAt: new Date().toISOString() };
    const issue = validateCollar(collar);
    if (issue) { rowErrors.push(`row ${r + 1}: ${issue}`); continue; }
    if (crs) collar.coordinateProvenance = { sourceCrs: crs, rawEasting: rawLng, rawNorthing: rawLat, transformedAt: new Date().toISOString() };
    for (const [field, header] of [['programId','program_id'], ['coordSource','coord_source'], ['coordCrs','coord_crs']]) if (cell(row, header)) collar[field] = cell(row, header);
    const provenance = cell(row, 'coordinate_provenance');
    if (provenance) { try { collar.coordinateProvenance = JSON.parse(provenance); } catch { return csvFailure('collars', `Row ${r + 1}: invalid coordinate provenance.`); } }
    out.push(collar);
  }
  if (!out.length) return csvFailure('collars', `No importable rows (${rowErrors.join('; ')}).`);
  return { collars: out, error: null, warnings: rowWarnings(rowErrors) };
}

''' +s[b:]
a=s.index('export function parseAssayCsv');b=s.index('// Interval CSV',a)
s=s[:a]+'''export function parseAssayCsv(text, samples) {
  const fail = error => ({ updated: null, matched: 0, unmatched: [], error });
  const { rows, error } = csvRows(text);
  if (error) return fail(error);
  if (rows.length < 2) return fail('CSV needs a header row and at least one data row.');
  if (duplicateIds(samples)) return fail('The project has duplicate sample IDs. Resolve sample identity before matching laboratory results.');
  const col = headerIndex(rows[0]), iId = col('sample_id', 'id'), elements = detectElementColumns(rows[0]);
  if (iId < 0) return fail('Assay CSV needs a sample_id column.');
  if (!elements.length) return fail('No element columns found (e.g. au_gpt, cu_ppm).');
  const results = new Map();
  for (let r = 1; r < rows.length; r++) {
    const id = trimId(rows[r][iId]); if (!id) continue;
    const incoming = readAssays(rows[r], elements);
    if (incoming.errors.length) return fail(`Row ${r + 1}: ${incoming.errors.join(' ')}`);
    if (!incoming.assayResults.length) continue;
    const entry = results.get(idKey(id)) || { id, results: new Map() };
    for (const result of incoming.assayResults) {
      const prior = entry.results.get(result.element);
      if (prior && (prior.value !== result.value || prior.qualifier !== result.qualifier)) return fail(`Conflicting ${result.element} results for ${id}. Retain both measurements in laboratory review; no results imported.`);
      entry.results.set(result.element, result);
    }
    results.set(idKey(id), entry);
  }
  let matched = 0;
  const updated = samples.map(sample => {
    const incoming = results.get(idKey(sample.id)); if (!incoming) return sample;
    matched++; results.delete(idKey(sample.id));
    const assays = { ...sample.assays }, detectionLimits = { ...sample.detectionLimits }, lowerLimits = { ...sample.lowerLimits };
    const oldResults = sample.assayResults?.length ? sample.assayResults : legacyResults(sample);
    const replacements = [...incoming.results.values()];
    const changed = replacements.some(r => !oldResults.some(old => old.element === r.element && old.value === r.value && old.qualifier === r.qualifier && old.raw === r.raw && old.sourceUnit === r.sourceUnit));
    replacements.forEach(result => {
      delete assays[result.element]; delete detectionLimits[result.element]; delete lowerLimits[result.element];
      if (result.qualifier.startsWith('<')) detectionLimits[result.element] = result.value;
      else if (result.qualifier.startsWith('>')) lowerLimits[result.element] = result.value;
      else assays[result.element] = result.value;
    });
    const { detectionLimits: _dl, lowerLimits: _ll, ...rest } = sample;
    return { ...rest, assays, ...(Object.keys(detectionLimits).length ? { detectionLimits } : {}), ...(Object.keys(lowerLimits).length ? { lowerLimits } : {}),
      assayResults: [...oldResults.filter(old => !incoming.results.has(old.element)), ...replacements],
      assayHistory: changed ? [...(sample.assayHistory || []), { id: newRecordId(), changedAt: new Date().toISOString(), source: 'csv_import', previousResults: oldResults, incomingResults: replacements }] : sample.assayHistory || [],
      assayReviewStatus: changed ? 'unreviewed' : sample.assayReviewStatus || 'unreviewed' };
  });
  return { updated, matched, unmatched: [...results.values()].map(r => r.id), error: matched ? null : 'No sample IDs in this file matched the project.' };
}

''' +s[b:]
a=s.index('export function parseIntervalCsv');b=s.index('// Downhole survey',a)
s=s[:a]+'''export function parseIntervalCsv(text, existing = [], collars = [], samples = []) {
  if (!Array.isArray(existing)) { const context = existing; existing = context.intervals || []; collars = context.collars || []; samples = context.samples || []; }
  const { rows, error } = csvRows(text);
  if (error) return csvFailure('intervals', error);
  if (rows.length < 2) return csvFailure('intervals', 'CSV needs a header row and at least one data row.');
  const col = headerIndex(rows[0]), elements = detectElementColumns(rows[0]);
  const iHole = col('hole_id', 'hole'), iFrom = col('from', 'from_m'), iTo = col('to', 'to_m');
  if (iHole < 0 || iFrom < 0 || iTo < 0) return csvFailure('intervals', 'Interval CSV needs hole_id, from and to columns.');
  const cell = (row, ...names) => { const i = col(...names); return i < 0 ? '' : row[i] ?? ''; };
  const out = [], rowErrors = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r], holeId = trimId(row[iHole]), from = finiteNumber(row[iFrom]), to = finiteNumber(row[iTo]);
    const collar = collars.find(c => idKey(c.id) === idKey(holeId));
    const issue = (collars.length && !collar ? `Unknown hole ${holeId}.` : null) || validateInterval({ holeId, from, to }, [...existing, ...out], collar);
    if (issue) { rowErrors.push(`row ${r + 1}: invalid interval — ${issue}`); continue; }
    const read = readAssays(row, elements);
    if (read.errors.length) return csvFailure('intervals', `Row ${r + 1}: ${read.errors.join(' ')}`);
    const sampleId = trimId(cell(row, 'sample_id', 'bag_id'));
    const physical = sampleId ? samples.find(s => idKey(s.id) === idKey(sampleId)) : null;
    if (physical && (idKey(physical.holeId) !== idKey(holeId) || physical.from !== from || physical.to !== to)) return csvFailure('intervals', `Sample ${sampleId} does not match this hole interval.`);
    out.push({ recordId: trimId(cell(row, 'record_id')) || newRecordId(), holeId, from, to,
      ...(sampleId ? { sampleId } : {}), ...(physical ? { sampleRecordId: physical.recordId } : trimId(cell(row, 'sample_record_id')) ? { sampleRecordId: trimId(cell(row, 'sample_record_id')) } : {}), ...assayFields(read) });
  }
  if (!out.length) return csvFailure('intervals', `No importable rows (${rowErrors.join('; ')}).`);
  return { intervals: out, error: null, warnings: rowWarnings(rowErrors) };
}

''' +s[b:]
open(p,'w').write(s)
