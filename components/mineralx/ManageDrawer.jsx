'use client';
import { useRef, useState } from 'react';
import { MxIcons } from './MineralXIcons';
import {
  nextId, parseSampleCsv, parseCollarCsv, parseIntervalCsv,
  samplesToCsv, collarsToCsv, downloadText, parseKmlBoundary, boundaryToKml,
  compressImage, today, ELEMENT_SYMBOLS, elementInfo, isProjectedCoord, crsLabel,
} from './project-store';
import ZonePicker from './ZonePicker';

const TYPE_LABELS = {
  project: 'PROJECT SETTINGS',
  chips: 'ROCK CHIP MANAGER',
  holes: 'DRILL HOLE MANAGER',
  boundary: 'BOUNDARY MANAGER',
  newProject: 'NEW PROJECT',
};

export default function ManageDrawer({ target, store, api, onClose }) {
  const project = store.projects.find(p => p.id === target.projectId);
  if (target.type !== 'newProject' && !project) return null;

  const titles = {
    project: project?.name,
    chips: 'Rock chips',
    holes: 'Drill holes',
    boundary: project?.boundary?.name || 'Boundary',
    newProject: 'New project',
  };

  return (
    <div className="mx-manage-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-manage-drawer mx-anim-rise">
        <div className="mx-manage-header">
          <div>
            <div className="mx-eyebrow">{TYPE_LABELS[target.type]}{project && target.type !== 'project' ? ` · ${project.name.toUpperCase()}` : ''}</div>
            <h2 className="mx-manage-title">{titles[target.type]}</h2>
          </div>
          <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="mx-manage-body">
          {target.type === 'newProject' && <NewProjectManager api={api} onClose={onClose} />}
          {target.type === 'project' && <ProjectManager project={project} api={api} onClose={onClose} />}
          {target.type === 'chips' && <RockChipManager project={project} api={api} onClose={onClose} />}
          {target.type === 'holes' && <DrillHoleManager project={project} api={api} onClose={onClose} />}
          {target.type === 'boundary' && <BoundaryManager project={project} api={api} />}
        </div>
      </div>
    </div>
  );
}

// ── New project ────────────────────────────────────────────────────────
function NewProjectManager({ api, onClose }) {
  const [name, setName] = useState('');
  const [kmlText, setKmlText] = useState(null);
  const [kmlName, setKmlName] = useState(null);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  const readKml = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { error: err } = parseKmlBoundary(String(reader.result));
      if (err) { setError(err); setKmlText(null); setKmlName(null); return; }
      setError(null);
      setKmlText(String(reader.result));
      setKmlName(file.name);
    };
    reader.readAsText(file);
  };

  const create = () => {
    if (!name.trim()) { setError('Give the project a name.'); return; }
    const { boundaryError } = api.createProject(name.trim(), kmlText);
    if (boundaryError) { setError(boundaryError); return; }
    onClose();
  };

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-form">
        <ManageField label="Project name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravenswood South" />
        <div
          className="mx-drop-area mx-drop-area-sm"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); readKml(e.dataTransfer.files?.[0]); }}
        >
          <div className="mx-drop-icon">&#8593;</div>
          <div className="mx-drop-text">{kmlName ? kmlName : <>Tenement KML (optional) — drop or <span className="mx-drop-browse">browse</span></>}</div>
          <div className="mx-drop-hint">{kmlName ? 'Boundary ready — will zoom to it' : 'You can add or replace it later'}</div>
          <input ref={fileInput} type="file" accept=".kml" style={{ display: 'none' }} onChange={(e) => { readKml(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {error && <div className="mx-import-msg mx-import-err">{error}</div>}
        <button type="button" className="mx-btn-primary mx-btn-full" onClick={create}>Create project</button>
      </div>
    </div>
  );
}

// ── Project settings ───────────────────────────────────────────────────
function ProjectManager({ project, api, onClose }) {
  const [name, setName] = useState(project.name);

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-form">
        <ManageField
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== project.name) api.renameProject(project.id, name.trim()); }}
        />
        <ManageField label="Sample ID prefix" value={project.idPrefix} readOnly />
        <ManageField label="Datum" value="GDA2020 (lat/lng)" readOnly />
        <ManageField label="Created" value={project.createdAt || '—'} readOnly />
        <ManageField label="Boundary" value={project.boundary ? project.boundary.name : 'None — add via KML upload'} readOnly />
      </div>
      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={() => api.exportProject(project)}>
          {MxIcons.download} Export all data
        </button>
        <button
          type="button" className="mx-btn-danger mx-btn-sm"
          onClick={() => {
            if (window.confirm(`Delete “${project.name}” and all its data? (Undo with Ctrl+Z if you change your mind.)`)) {
              api.deleteProject(project.id);
              onClose();
            }
          }}
        >
          {MxIcons.trash} Delete project
        </button>
      </div>
    </div>
  );
}

// ── Rock chip manager ──────────────────────────────────────────────────
function RockChipManager({ project, api, onClose }) {
  const [tab, setTab] = useState('add');
  const [form, setForm] = useState({ id: '', lith: '', lng: '', lat: '', notes: '' });
  const [assayRows, setAssayRows] = useState([{ element: 'Au', value: '' }]);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [pendingProjection, setPendingProjection] = useState(null);
  const fileInput = useRef(null);
  const photoInput = useRef(null);
  const autoId = nextId(project.samples, project.idPrefix);

  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const addSample = () => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Easting and northing are required (decimal degrees).');
      return;
    }
    if (isProjectedCoord(lat, lng)) {
      setError('These look like projected metres (MGA easting/northing), not decimal degrees — use CSV import to confirm a zone and reproject.');
      return;
    }
    const assays = {};
    assayRows.forEach(({ element, value }) => {
      const v = parseFloat(value);
      if (!Number.isNaN(v)) assays[element] = v;
    });
    api.addSamples(project.id, [{
      id: form.id.trim() || autoId,
      lat, lng,
      assays,
      lith: form.lith.trim(),
      notes: form.notes.trim(),
      photo: photo || undefined,
      date: today(),
    }]);
    onClose();
  };

  const attachPhoto = (file) => {
    if (!file) return;
    compressImage(file)
      .then(setPhoto)
      .catch(() => setError('Could not read that image.'));
  };

  const importFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const r = parseSampleCsv(text, project.samples, project.idPrefix);
      if (r.needsProjection) { setPendingProjection({ text, easting: r.easting, northing: r.northing, fileName: file.name }); return; }
      if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
      api.addSamples(project.id, r.samples, file.name);
      setImportMsg({ error: false, text: `Imported ${r.samples.length} sample${r.samples.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
    };
    reader.readAsText(file);
  };

  const confirmProjection = (crs) => {
    if (!pendingProjection) return;
    const { text, fileName } = pendingProjection;
    const r = parseSampleCsv(text, project.samples, project.idPrefix, crs);
    setPendingProjection(null);
    if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
    api.addSamples(project.id, r.samples, fileName);
    setImportMsg({ error: false, text: `Reprojected from ${crsLabel(crs)} — imported ${r.samples.length} sample${r.samples.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
  };

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-tabs">
        <button type="button" className={`mx-manage-tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>Add sample</button>
        <button type="button" className={`mx-manage-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Import CSV</button>
      </div>

      {tab === 'add' && (
        <div className="mx-manage-form">
          <ManageField label="Sample ID" value={form.id} onChange={setField('id')} placeholder={`Auto: ${autoId}`} />
          <ManageField label="Lithology" value={form.lith} onChange={setField('lith')} placeholder="e.g. Quartz vein float" />
          <div className="mx-manage-row-2">
            <ManageField label="Easting (lng)" value={form.lng} onChange={setField('lng')} placeholder="146.2570" />
            <ManageField label="Northing (lat)" value={form.lat} onChange={setField('lat')} placeholder="-20.0665" />
          </div>
          <AssayInputs rows={assayRows} setRows={setAssayRows} />
          <ManageField label="Notes" value={form.notes} onChange={setField('notes')} placeholder="Surface float, quartz reef" multiline />
          <button type="button" className="mx-photo-attach" onClick={() => photoInput.current?.click()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- dataURL thumbnail; next/image can't optimize these */}
            {photo ? <img src={photo} alt="Sample" className="mx-photo-thumb" /> : <span className="mx-photo-plus">+</span>}
            <span>{photo ? 'Photo attached — tap to replace' : 'Attach photo (optional)'}</span>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </button>
          {error && <div className="mx-import-msg mx-import-err">{error}</div>}
          <button type="button" className="mx-btn-primary mx-btn-full" onClick={addSample}>Add sample</button>
        </div>
      )}

      {tab === 'import' && (
        <div className="mx-manage-form">
          {pendingProjection ? (
            <ZonePicker
              easting={pendingProjection.easting} northing={pendingProjection.northing}
              onConfirm={confirmProjection} onCancel={() => setPendingProjection(null)}
            />
          ) : (
            <>
              <div
                className="mx-drop-area mx-drop-area-sm"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); importFile(e.dataTransfer.files?.[0]); }}
              >
                <div className="mx-drop-icon">&#8593;</div>
                <div className="mx-drop-text">Drop CSV or <span className="mx-drop-browse">browse</span></div>
                <div className="mx-drop-hint">sample_id, lat, lng, lith + element columns (au, ag, cu…)</div>
                <input ref={fileInput} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              {importMsg && <div className={`mx-import-msg ${importMsg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{importMsg.text}</div>}
            </>
          )}
        </div>
      )}

      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={() => downloadText('rock_chips.csv', samplesToCsv(project.samples))}>
          {MxIcons.download} Export CSV
        </button>
        <span className="mx-manage-count">{project.samples.length} samples · next {autoId}</span>
      </div>
    </div>
  );
}

// ── Drill hole manager ─────────────────────────────────────────────────
function DrillHoleManager({ project, api, onClose }) {
  const [tab, setTab] = useState('collar');
  const [form, setForm] = useState({ id: '', lng: '', lat: '', azimuth: '', dip: '', depth: '' });
  const [error, setError] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [pendingProjection, setPendingProjection] = useState(null);
  const collarInput = useRef(null);
  const intervalInput = useRef(null);
  const holePrefix = project.idPrefix.replace('-RC-', '-DD-');
  const autoId = nextId(project.collars, holePrefix);

  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const addCollar = () => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Easting and northing are required (decimal degrees).');
      return;
    }
    if (isProjectedCoord(lat, lng)) {
      setError('These look like projected metres (MGA easting/northing), not decimal degrees — use CSV import to confirm a zone and reproject.');
      return;
    }
    const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };
    api.addCollars(project.id, [{
      id: form.id.trim() || autoId,
      lat, lng,
      azimuth: num(form.azimuth), dip: num(form.dip), depth: num(form.depth),
      date: today(),
    }]);
    onClose();
  };

  const importCollars = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const r = parseCollarCsv(text, project.collars, holePrefix);
      if (r.needsProjection) { setPendingProjection({ text, easting: r.easting, northing: r.northing, fileName: file.name }); return; }
      if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
      api.addCollars(project.id, r.collars, file.name);
      setImportMsg({ error: false, text: `Imported ${r.collars.length} collar${r.collars.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
    };
    reader.readAsText(file);
  };

  const confirmProjection = (crs) => {
    if (!pendingProjection) return;
    const { text, fileName } = pendingProjection;
    const r = parseCollarCsv(text, project.collars, holePrefix, crs);
    setPendingProjection(null);
    if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
    api.addCollars(project.id, r.collars, fileName);
    setImportMsg({ error: false, text: `Reprojected from ${crsLabel(crs)} — imported ${r.collars.length} collar${r.collars.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
  };

  const importIntervals = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { intervals, error: err, warnings } = parseIntervalCsv(String(reader.result));
      if (err) { setImportMsg({ error: true, text: err }); return; }
      const known = new Set(project.collars.map(c => c.id));
      const matched = intervals.filter(i => known.has(i.holeId));
      const skipped = intervals.length - matched.length;
      if (!matched.length) { setImportMsg({ error: true, text: 'No hole IDs in this file matched the project.' }); return; }
      api.addIntervals(project.id, matched, file.name);
      setImportMsg({ error: false, text: `Imported ${matched.length} interval${matched.length === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped (unknown hole ID).` : ''}${warnings ? ` ${warnings}` : ''}` });
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-tabs">
        <button type="button" className={`mx-manage-tab ${tab === 'collar' ? 'active' : ''}`} onClick={() => setTab('collar')}>Add collar</button>
        <button type="button" className={`mx-manage-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Import collars</button>
        <button type="button" className={`mx-manage-tab ${tab === 'intervals' ? 'active' : ''}`} onClick={() => setTab('intervals')}>Intervals</button>
      </div>

      {tab === 'collar' && (
        <div className="mx-manage-form">
          <ManageField label="Hole ID" value={form.id} onChange={setField('id')} placeholder={`Auto: ${autoId}`} />
          <div className="mx-manage-row-2">
            <ManageField label="Easting (lng)" value={form.lng} onChange={setField('lng')} placeholder="146.2545" />
            <ManageField label="Northing (lat)" value={form.lat} onChange={setField('lat')} placeholder="-20.0648" />
          </div>
          <div className="mx-manage-row-2">
            <ManageField label="Azimuth (°)" value={form.azimuth} onChange={setField('azimuth')} placeholder="90" />
            <ManageField label="Dip (°)" value={form.dip} onChange={setField('dip')} placeholder="-60" />
          </div>
          <ManageField label="Planned depth (m)" value={form.depth} onChange={setField('depth')} placeholder="300" />
          {error && <div className="mx-import-msg mx-import-err">{error}</div>}
          <button type="button" className="mx-btn-primary mx-btn-full" onClick={addCollar}>Add collar</button>
        </div>
      )}

      {tab === 'import' && (
        <div className="mx-manage-form">
          {pendingProjection ? (
            <ZonePicker
              easting={pendingProjection.easting} northing={pendingProjection.northing}
              onConfirm={confirmProjection} onCancel={() => setPendingProjection(null)}
            />
          ) : (
            <>
              <div className="mx-drop-area mx-drop-area-sm" onClick={() => collarInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importCollars(e.dataTransfer.files?.[0]); }}>
                <div className="mx-drop-icon">&#8593;</div>
                <div className="mx-drop-text">Drop collar CSV or <span className="mx-drop-browse">browse</span></div>
                <div className="mx-drop-hint">hole_id, lat, lng, azimuth, dip, depth</div>
                <input ref={collarInput} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { importCollars(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              {importMsg && <div className={`mx-import-msg ${importMsg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{importMsg.text}</div>}
            </>
          )}
        </div>
      )}

      {tab === 'intervals' && (
        <div className="mx-manage-form">
          <div className="mx-drop-area mx-drop-area-sm" onClick={() => intervalInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importIntervals(e.dataTransfer.files?.[0]); }}>
            <div className="mx-drop-icon">&#8593;</div>
            <div className="mx-drop-text">Drop interval-assay CSV</div>
            <div className="mx-drop-hint">hole_id, from, to + element columns — links to collars by ID</div>
            <input ref={intervalInput} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { importIntervals(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {importMsg && <div className={`mx-import-msg ${importMsg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{importMsg.text}</div>}
        </div>
      )}

      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={() => downloadText('drill_collars.csv', collarsToCsv(project.collars))}>
          {MxIcons.download} Export CSV
        </button>
        <span className="mx-manage-count">{project.collars.length} holes · {(project.intervals || []).length} intervals</span>
      </div>
    </div>
  );
}

// ── Boundary manager ───────────────────────────────────────────────────
function BoundaryManager({ project, api }) {
  const [name, setName] = useState(project.boundary?.name || '');
  const [msg, setMsg] = useState(null);
  const fileInput = useRef(null);

  const replaceKml = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { coords, error } = parseKmlBoundary(String(reader.result));
      if (error) { setMsg({ error: true, text: error }); return; }
      const boundaryName = name.trim() || file.name.replace(/\.kml$/i, '');
      api.setBoundary(project.id, boundaryName, coords, file.name);
      setName(boundaryName);
      setMsg({ error: false, text: 'Boundary updated — zoomed to it.' });
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-form">
        <ManageField
          label="Boundary name" value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (project.boundary && name.trim() && name !== project.boundary.name) {
              api.setBoundary(project.id, name.trim(), project.boundary.coords);
            }
          }}
          placeholder="e.g. EPM 27780"
        />
        <div className="mx-drop-area mx-drop-area-sm" onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); replaceKml(e.dataTransfer.files?.[0]); }}>
          <div className="mx-drop-icon">&#8593;</div>
          <div className="mx-drop-text">{project.boundary ? 'Replace KML' : 'Upload KML'} — drop or <span className="mx-drop-browse">browse</span></div>
          <div className="mx-drop-hint">First polygon in the file becomes the boundary</div>
          <input ref={fileInput} type="file" accept=".kml" style={{ display: 'none' }} onChange={(e) => { replaceKml(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {msg && <div className={`mx-import-msg ${msg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{msg.text}</div>}
      </div>
      <div className="mx-manage-actions">
        <button
          type="button" className="mx-btn-secondary mx-btn-sm"
          disabled={!project.boundary}
          onClick={() => {
            const b = project.boundary;
            if (b) {
              const L = b.coords;
              const lat = L.reduce((a, c) => a + c[0], 0) / L.length;
              const lng = L.reduce((a, c) => a + c[1], 0) / L.length;
              api.focusOn(lat, lng);
            }
          }}
        >Zoom to boundary</button>
        <button
          type="button" className="mx-btn-secondary mx-btn-sm"
          disabled={!project.boundary}
          onClick={() => project.boundary && downloadText(`${project.boundary.name.replace(/\s+/g, '_')}.kml`, boundaryToKml(project.boundary.name, project.boundary.coords), 'application/vnd.google-earth.kml+xml')}
        >{MxIcons.download} Export KML</button>
      </div>
    </div>
  );
}

// ── Assay entry: element + value rows, add/remove ──────────────────────
function AssayInputs({ rows, setRows }) {
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const usedElements = rows.map(r => r.element);
  return (
    <div className="mx-field">
      <label className="mx-field-label">Assays — leave blank if awaiting results</label>
      {rows.map((row, i) => (
        <div key={i} className="mx-assay-row">
          <select
            className="mx-input mx-assay-el"
            value={row.element}
            onChange={(e) => setRow(i, { element: e.target.value })}
          >
            {ELEMENT_SYMBOLS.map(el => (
              <option key={el} value={el} disabled={el !== row.element && usedElements.includes(el)}>{el}</option>
            ))}
          </select>
          <input
            type="text" inputMode="decimal"
            className="mx-input mx-assay-val"
            placeholder={`${elementInfo(row.element).unit || 'value'}`}
            value={row.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
          />
          {rows.length > 1 && (
            <button type="button" className="mx-assay-remove" title="Remove" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>&times;</button>
          )}
        </div>
      ))}
      {rows.length < 6 && (
        <button
          type="button" className="mx-assay-add"
          onClick={() => {
            const next = ELEMENT_SYMBOLS.find(el => !usedElements.includes(el));
            if (next) setRows(rs => [...rs, { element: next, value: '' }]);
          }}
        >+ element</button>
      )}
    </div>
  );
}

// ── Shared form field ──────────────────────────────────────────────────
function ManageField({ label, value, onChange, onBlur, placeholder, readOnly, multiline }) {
  const valueProps = onChange ? { value, onChange } : { defaultValue: value };
  return (
    <div className="mx-field">
      <label className="mx-field-label">{label}</label>
      {multiline ? (
        <textarea className="mx-input mx-textarea" {...valueProps} onBlur={onBlur} placeholder={placeholder} readOnly={readOnly} rows={3} />
      ) : (
        <input type="text" className="mx-input" {...valueProps} onBlur={onBlur} placeholder={placeholder} readOnly={readOnly} />
      )}
    </div>
  );
}
