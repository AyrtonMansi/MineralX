'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readSpatialFile, spatialStats } from './spatial-import.js';
import './spatial-layers.css';
const summary = s => `${s.points} points · ${s.lines} lines · ${s.polygons} polygons`;

export default function SpatialImportPanel({ project, api, initialFiles = [], initialRole = 'reference', onClose, onSaved, locked, registerNavigationGuard }) {
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const input = useRef(null), initialized = useRef(false), alive = useRef(true), parsing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const addFiles = useCallback(async files => {
    if (parsing.current || saving) return;
    const list = Array.from(files || []);
    if (list.length + rows.length > 12 || list.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024) { setError('Import up to 12 files / 20 MiB at a time.'); return; }
    parsing.current = true; setBusy(true); setError(''); setNotice('');
    const additions = [];
    for (const file of list) {
      try {
        const layer = await readSpatialFile(file);
        additions.push({ id: layer.recordId, layer, checked: true, role: initialRole, replace: false, acknowledged: !layer.warnings.length, selectedIndexes: layer.data.features.map((_, i) => i) });
      } catch (err) { additions.push({ id: crypto.randomUUID(), name: file.name, error: err.message, checked: false }); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (alive.current) { setRows(previous => [...previous, ...additions]); setBusy(false); }
    parsing.current = false;
  }, [saving, rows.length, initialRole]);
  useEffect(() => { if (!initialized.current) { initialized.current = true; if (initialFiles.length) addFiles(initialFiles); } }, [initialFiles, addFiles]); // initial files belong to this project-scoped mount
  const update = (id, patch) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  const selected = rows.filter(row => row.checked && row.layer);
  const save = async () => {
    if (saving || busy || locked) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api.importSpatial(project.id, selected);
      if (alive.current) { setRows(current => current.filter(row => !selected.includes(row))); setNotice(`Saved ${selected.length} source file(s) to ${project.name} on this device. Existing collected samples and assays were not changed.`); onSaved?.(); }
    } catch (err) { if (alive.current) setError(`Not confirmed saved: ${err.message} Keep your source files; this import preview is retained.`); }
    finally { if (alive.current) setSaving(false); }
  };
  useEffect(() => {
    const guard = () => {
      if (saving || busy) { setError('Wait for file validation or the storage transaction before leaving this import.'); return false; }
      return !rows.length || window.confirm('Leave this import preview without saving the remaining files? Your original files and saved project are unchanged.');
    };
    const warn = event => { if (rows.length || busy || saving) { event.preventDefault(); event.returnValue = ''; } };
    registerNavigationGuard?.(guard);
    window.addEventListener('beforeunload', warn);
    return () => { registerNavigationGuard?.(null); window.removeEventListener('beforeunload', warn); };
  }, [rows.length, busy, saving, registerNavigationGuard]);
  const close = () => { if (!saving && !busy) onClose(); };
  return <section className="mx-glass-panel mx-spatial-panel mx-anim-rise" aria-label="Import project map files">
    <header className="mx-panel-header"><div><h2>Import map files</h2><p>Destination: <strong>{project.name}</strong></p></div><button type="button" className="mx-close-btn" aria-label="Close map import" disabled={busy || saving} onClick={close}>×</button></header>
    <div className="mx-spatial-body">
      <p>Keep each source as an independent reference layer, or explicitly add its polygons to the tenement boundary. Imported features do not become collected samples or approved assays.</p>
      <button type="button" className="mx-spatial-drop" disabled={busy || saving || locked} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!locked) addFiles(e.dataTransfer.files); }}>
        {busy ? 'Reading and validating files…' : 'Choose or drop KML, KMZ or GeoJSON files'}<small>Multiple files · 10 MiB per file · WGS84 longitude/latitude</small>
      </button>
      <input ref={input} aria-label="Map files" type="file" multiple accept=".kml,.kmz,.geojson,.json" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      <details><summary>Files from other software</summary><p>Export vectors as KML, KMZ or GeoJSON in WGS84 / EPSG:4326. Points, lines, polygons, multiple tenements and interior rings are retained. Original file bytes and attributes are preserved in the workspace backup.</p><p>Shapefile, GeoPackage, DXF, rasters, image overlays, network links, 3D meshes and proprietary project files are not imported as vectors here. Use the existing CSV importer for physical samples, collars and downhole records. Normalized KML export does not reproduce all native symbology; export the original file for exact source fidelity.</p></details>
      {rows.map(row => <article key={row.id} className="mx-spatial-card">
        {row.error ? <><strong>{row.name}</strong><p role="alert">{row.error}</p></> : <>
          <label className="mx-spatial-check"><input type="checkbox" checked={row.checked} disabled={saving} onChange={e => update(row.id, { checked: e.target.checked })} /><strong>{row.layer.source.name}</strong></label>
          <p>{summary(row.layer.stats)} · {row.layer.data.features.length} features · {row.layer.source.format.toUpperCase()}</p>
          <label>Layer name<input value={row.layer.name} disabled={saving} onChange={e => update(row.id, { layer: { ...row.layer, name: e.target.value } })} /></label>
          <label>Use as<select value={row.role} disabled={saving} onChange={e => update(row.id, { role: e.target.value })}><option value="reference">Separate reference layer (keep current boundary)</option><option value="boundary" disabled={!row.layer.stats.polygons}>Tenement boundary polygons</option></select></label>
          {row.role === 'boundary' && <><p>All selected polygons and their interior rings are used. Other selected features remain in the source layer.</p>{project.boundary && <label className="mx-spatial-check"><input type="checkbox" checked={row.replace} disabled={saving} onChange={e => update(row.id, { replace: e.target.checked })} />Replace current boundary instead of adding polygons. Previous boundary remains in history.</label>}</>}
          <details><summary>Select features / inspect attributes ({row.selectedIndexes.length} selected)</summary><p>Folder paths are retained; select only the tenements or features needed.</p><div className="mx-spatial-actions"><button type="button" disabled={saving} onClick={() => update(row.id, { selectedIndexes: row.layer.data.features.map((_, i) => i) })}>Select all</button><button type="button" disabled={saving} onClick={() => update(row.id, { selectedIndexes: [] })}>Select none</button></div><div className="mx-spatial-features">{row.layer.data.features.map((feature, index) => <details key={index}><summary><label><input type="checkbox" checked={row.selectedIndexes.includes(index)} disabled={saving} onChange={e => update(row.id, { selectedIndexes: e.target.checked ? [...row.selectedIndexes, index].sort((a, b) => a - b) : row.selectedIndexes.filter(n => n !== index) })} />{String(feature.properties?.name || feature.id || `Feature ${index + 1}`)} · {feature.geometry.type}</label></summary><pre>{JSON.stringify(feature.properties, null, 2)}</pre></details>)}</div></details>
          {row.layer.warnings.length > 0 && <><div role="note">{row.layer.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div><label className="mx-spatial-check"><input type="checkbox" checked={row.acknowledged} disabled={saving} onChange={e => update(row.id, { acknowledged: e.target.checked })} />I have reviewed the unrendered content and display limitations.</label></>}
        </>}
        <button type="button" disabled={saving} onClick={() => setRows(current => current.filter(r => r.id !== row.id))}>Remove from preview</button>
      </article>)}
      {error && <p role="alert" className="mx-spatial-error">{error}</p>}{notice && <p role="status" className="mx-spatial-success">{notice}</p>}
    </div>
    <footer className="mx-spatial-footer"><span>{selected.length} file(s) selected · {selected.reduce((n, r) => n + r.selectedIndexes.length, 0)} features</span><button type="button" className="mx-btn-primary" disabled={!selected.length || locked || busy || saving || selected.some(r => !r.selectedIndexes.length || !r.layer.name.trim() || !r.acknowledged)} onClick={save}>{saving ? 'Saving…' : `Save to ${project.name}`}</button><button type="button" onClick={close} disabled={busy || saving}>Back to map</button></footer>
  </section>;
}
