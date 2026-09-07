'use client';
import { boundaryData, spatialStats } from './spatial-import.js';
import { useRef, useState } from 'react';
import { MxIcons } from './MineralXIcons';
import {
  nextId, parseSampleCsv, parseCollarCsv, parseIntervalCsv, parseSurveyCsv, parseGeologyCsv,
  samplesToCsv, collarsToCsv, intervalsToCsv, surveysToCsv, geologyToCsv, downloadText, parseKmlBoundary, boundaryToKml,
  compressImage, today, ELEMENT_SYMBOLS, elementInfo, isProjectedCoord, crsLabel, parseAssayCell,
  SAMPLE_TYPES, SAMPLE_TYPE_LABELS, QAQC_TYPES, QAQC_TYPE_LABELS, COORD_SOURCES, COORD_SOURCE_LABELS,
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
    chips: target.editId || 'Rock chips',
    holes: target.editId || 'Drill holes',
    boundary: project?.boundary?.name || 'Boundary',
    newProject: 'New project',
  };

  return (
    <div className="mx-manage-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-manage-drawer mx-anim-rise">
        <div className="mx-manage-header">
          <div>
            <div className="mx-eyebrow">
              {target.editId ? 'EDIT RECORD' : TYPE_LABELS[target.type]}
              {project && target.type !== 'project' ? ` · ${project.name.toUpperCase()}` : ''}
            </div>
            <h2 className="mx-manage-title">{titles[target.type]}</h2>
          </div>
          <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="mx-manage-body">
          {target.type === 'newProject' && <NewProjectManager api={api} onClose={onClose} />}
          {target.type === 'project' && <ProjectManager project={project} api={api} onClose={onClose} />}
          {target.type === 'chips' && <RockChipManager project={project} api={api} onClose={onClose} editId={target.editId} />}
          {target.type === 'holes' && <DrillHoleManager project={project} api={api} onClose={onClose} editId={target.editId} />}
          {target.type === 'boundary' && <BoundaryManager project={project} api={api} />}
        </div>
      </div>
    </div>
  );
}

// ── New project ────────────────────────────────────────────────────────
function NewProjectManager({ api, onClose }) {
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const create=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await api.createProject(name);onClose();}catch(err){setError(err.message);}finally{setBusy(false);}
  };
  return <div className="mx-manage-sections"><div className="mx-manage-form"><ManageField label="Project name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Ravenswood South"/><p>Create the project, then import KML, KMZ or GeoJSON using Map layers → Import map files. Tenements are reviewed before replacing any boundary.</p>{error&&<p role="alert">{error}</p>}<button type="button" className="mx-btn-primary mx-btn-full" disabled={busy||!name.trim()} onClick={create}>{busy?'Saving project…':'Create project'}</button></div></div>;
}

// ── Project settings ───────────────────────────────────────────────────
function ProjectManager({ project, api, onClose }) {
  const [name, setName] = useState(project.name);
  const [error,setError]=useState('');

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-form">
        <ManageField
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {try{if(name.trim()&&name!==project.name)api.renameProject(project.id,name.trim());}catch(err){setError(err.message);}}}
        />
        {error&&<p role="alert">{error}</p>}
        <ManageField label="Sample ID prefix" value={project.idPrefix} readOnly />
        <ManageField label="Display coordinates" value="WGS84 latitude / longitude" readOnly />
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
            if (window.confirm(`Archive “${project.name}”? Records remain in full backups.`)) {
              try{api.deleteProject(project.id);onClose();}catch(err){setError(err.message);}
            }
          }}
        >
          {MxIcons.trash} Archive project
        </button>
      </div>
    </div>
  );
}

// ── Rock chip manager ──────────────────────────────────────────────────
function RockChipManager({ project, api, onClose, editId }) {
  // Correcting an existing sample (a typo'd lithology, a re-picked
  // coordinate, an assay entered wrong) reuses this same form rather than
  // being a separate screen — the only differences are: pre-filled from
  // the record, the id locked (see api.updateSample's comment for why),
  // no Import CSV tab (importing doesn't make sense while editing one
  // row), and the submit path writes a patch instead of appending a new
  // sample.
  const editSample = editId ? project.samples.find(s => s.id === editId) : null;
  const [tab, setTab] = useState('add');
  const [form, setForm] = useState(() => (editSample ? {
    id: editSample.id, lith: editSample.lith || '', lng: String(editSample.lng), lat: String(editSample.lat),
    notes: editSample.notes || '', sampleType: editSample.sampleType || 'rock_chip',
    qaqcType: editSample.qaqcType || 'none', duplicateOf: editSample.duplicateOf || '',
    coordSource: editSample.coordSource || 'unknown',
  } : {
    id: '', lith: '', lng: '', lat: '', notes: '',
    sampleType: 'rock_chip', qaqcType: 'none', duplicateOf: '', coordSource: 'unknown',
  }));
  const [assayRows, setAssayRows] = useState(() => assayCellsToRows(editSample?.assays, editSample?.detectionLimits));
  const [photo, setPhoto] = useState(editSample?.photo || null);
  const [error, setError] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [pendingProjection, setPendingProjection] = useState(null);
  const fileInput = useRef(null);
  const photoInput = useRef(null);
  const autoId = nextId(project.samples, project.idPrefix);
  const isDuplicateType = form.qaqcType === 'duplicate' || form.qaqcType === 'triplicate';

  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const saveSample = async () => {
    try {
    const lat = form.lat.trim()?Number(form.lat):NaN;
    const lng = form.lng.trim()?Number(form.lng):NaN;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Latitude and longitude are required (decimal degrees).');
      return;
    }
    if (isProjectedCoord(lat, lng)) {
      setError('These look like projected metres (MGA easting/northing), not decimal degrees — use CSV import to confirm a zone and reproject.');
      return;
    }
    if (isDuplicateType && !form.duplicateOf.trim()) {
      setError('A field duplicate/triplicate needs the original sample ID it was taken alongside.');
      return;
    }
    const assays = {};
    const detectionLimits = {};
    assayRows.forEach(({ element, value }) => {
      const { value: v, detectionLimit: dl } = parseAssayCell(value);
      if (v != null) assays[element] = v;
      else if (dl != null) detectionLimits[element] = dl;
    });
    const patch = {
      lat, lng,
      assays,
      detectionLimits: Object.keys(detectionLimits).length ? detectionLimits : undefined,
      lith: form.lith.trim(),
      notes: form.notes.trim(),
      photo: photo || undefined,
      sampleType: form.sampleType,
      qaqcType: form.qaqcType,
      coordSource: form.coordSource,
      duplicateOf: isDuplicateType ? form.duplicateOf.trim() : undefined,
    };
    if (editSample) {
      api.updateSample(project.id, editSample.id, patch);
      if(photo&&photo!==editSample.photo)api.attachPhoto(project.id,editSample.id,photo);
    } else {
      api.addSamples(project.id, [{ id: form.id.trim() || autoId, date: today(), ...patch }]);
    }
    await api.flush();
    onClose();
    }catch(err){setError(err.message);}
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
    reader.onload = async () => {
      try {
      const text = String(reader.result);
      const r = parseSampleCsv(text, project.samples, project.idPrefix);
      if (r.needsProjection) { setPendingProjection({ text, easting: r.easting, northing: r.northing, fileName: file.name }); return; }
      if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
      api.addSamples(project.id, r.samples, file.name);
      setImportMsg({ error: false, text: `Imported ${r.samples.length} sample${r.samples.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
      }catch(err){setImportMsg({error:true,text:err.message});}
    };
    reader.readAsText(file);
  };

  const confirmProjection = (crs) => {
    try {
    if (!pendingProjection) return;
    const { text, fileName } = pendingProjection;
    const r = parseSampleCsv(text, project.samples, project.idPrefix, crs);
    setPendingProjection(null);
    if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
    api.addSamples(project.id, r.samples, fileName);
    setImportMsg({ error: false, text: `Reprojected from ${crsLabel(crs)} — imported ${r.samples.length} sample${r.samples.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
    }catch(err){setImportMsg({error:true,text:err.message});}
  };

  return (
    <div className="mx-manage-sections">
      {!editSample && (
        <div className="mx-manage-tabs">
          <button type="button" className={`mx-manage-tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>Add sample</button>
          <button type="button" className={`mx-manage-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Import CSV</button>
        </div>
      )}

      {tab === 'add' && (
        <div className="mx-manage-form">
          <ManageField label="Sample ID" value={form.id} onChange={setField('id')} readOnly={!!editSample} placeholder={`Auto: ${autoId}`} />
          <div className="mx-manage-row-2">
            <ManageSelect
              label="Sample type" disabled={!!editSample} value={form.sampleType} onChange={setField('sampleType')}
              options={SAMPLE_TYPES.map(t => [t, SAMPLE_TYPE_LABELS[t]])}
            />
            <ManageSelect
              label="Coordinate source" value={form.coordSource} onChange={setField('coordSource')}
              title="How this location was obtained — matters for JORC-style disclosure of positional confidence"
              options={COORD_SOURCES.map(s => [s, COORD_SOURCE_LABELS[s]])}
            />
          </div>
          <ManageField label="Lithology" value={form.lith} onChange={setField('lith')} placeholder="e.g. Quartz vein float" />
          <div className="mx-manage-row-2">
            <ManageField label="Longitude (WGS84)" value={form.lng} onChange={setField('lng')} placeholder="146.2570" />
            <ManageField label="Latitude (WGS84)" value={form.lat} onChange={setField('lat')} placeholder="-20.0665" />
          </div>
          <p className="mx-manage-hint">Laboratory values are read-only here. Import a certificate in Review to change analytical results with retained history.</p>
          {/* QAQC: what this sample IS in the lab-quality audit trail — a */}
          {/* standard/blank/duplicate, or an original. Field duplicates */}
          {/* record which original sample they were split alongside. */}
          <ManageSelect
            label="QAQC type" disabled={!!editSample} value={form.qaqcType} onChange={setField('qaqcType')}
            title="Standards, blanks and duplicates form the QAQC record a Competent Person needs to verify assay quality"
            options={QAQC_TYPES.map(q => [q, QAQC_TYPE_LABELS[q]])}
          />
          {isDuplicateType && (
            <ManageField
              label="Original sample ID" value={form.duplicateOf} onChange={setField('duplicateOf')}
              placeholder={`e.g. ${autoId.replace(/\d+$/, '0001')}`}
            />
          )}
          <ManageField label="Notes" value={form.notes} onChange={setField('notes')} placeholder="Surface float, quartz reef" multiline />
          <button type="button" className="mx-photo-attach" onClick={() => photoInput.current?.click()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- dataURL thumbnail; next/image can't optimize these */}
            {photo ? <img src={photo} alt="Sample" className="mx-photo-thumb" /> : <span className="mx-photo-plus">+</span>}
            <span>{photo ? 'Photo attached — tap to replace' : 'Attach photo (optional)'}</span>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </button>
          {error && <div className="mx-import-msg mx-import-err">{error}</div>}
          <button type="button" className="mx-btn-primary mx-btn-full" onClick={saveSample}>{editSample ? 'Save changes' : 'Add sample'}</button>
        </div>
      )}

      {!editSample && tab === 'import' && (
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
function DrillHoleManager({ project, api, onClose, editId }) {
  // Same edit-in-place approach as RockChipManager — see api.updateCollar's
  // comment for why the id stays locked (intervals/surveys/geology are
  // keyed by holeId, not nested inside the collar).
  const editCollar = editId ? project.collars.find(c => c.id === editId) : null;
  const [tab, setTab] = useState('collar');
  const [form, setForm] = useState(() => (editCollar ? {
    id: editCollar.id, lng: String(editCollar.lng), lat: String(editCollar.lat),
    azimuth: editCollar.azimuth != null ? String(editCollar.azimuth) : '',
    dip: editCollar.dip != null ? String(editCollar.dip) : '',
    depth: editCollar.depth != null ? String(editCollar.depth) : '',
    notes: editCollar.notes || '',
  } : { id: '', lng: '', lat: '', azimuth: '', dip: '', depth: '', notes: '' }));
  const [error, setError] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [pendingProjection, setPendingProjection] = useState(null);
  const collarInput = useRef(null);
  const intervalInput = useRef(null);
  const surveyInput = useRef(null);
  const geologyInput = useRef(null);
  const holePrefix = project.idPrefix.replace('-RC-', '-DD-');
  const autoId = nextId(project.collars, holePrefix);

  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const saveCollar = async () => {
    try {
    const lat = form.lat.trim()?Number(form.lat):NaN;
    const lng = form.lng.trim()?Number(form.lng):NaN;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Latitude and longitude are required (decimal degrees).');
      return;
    }
    if (isProjectedCoord(lat, lng)) {
      setError('These look like projected metres (MGA easting/northing), not decimal degrees — use CSV import to confirm a zone and reproject.');
      return;
    }
    const num = v => v.trim()?Number(v):null;
    const patch = { lat, lng, azimuth: num(form.azimuth), dip: num(form.dip), depth: num(form.depth), notes: form.notes.trim() };
    if (editCollar) {
      api.updateCollar(project.id, editCollar.id, patch);
    } else {
      api.addCollars(project.id, [{ id: form.id.trim() || autoId, date: today(), ...patch }]);
    }
    await api.flush();
    onClose();
    }catch(err){setError(err.message);}
  };

  const importCollars = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
      const text = String(reader.result);
      const r = parseCollarCsv(text, project.collars, holePrefix);
      if (r.needsProjection) { setPendingProjection({ text, easting: r.easting, northing: r.northing, fileName: file.name }); return; }
      if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
      api.addCollars(project.id, r.collars, file.name);
      setImportMsg({ error: false, text: `Imported ${r.collars.length} collar${r.collars.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
      }catch(err){setImportMsg({error:true,text:err.message});}
    };
    reader.readAsText(file);
  };

  const confirmProjection = (crs) => {
    try {
    if (!pendingProjection) return;
    const { text, fileName } = pendingProjection;
    const r = parseCollarCsv(text, project.collars, holePrefix, crs);
    setPendingProjection(null);
    if (r.error) { setImportMsg({ error: true, text: r.error }); return; }
    api.addCollars(project.id, r.collars, fileName);
    setImportMsg({ error: false, text: `Reprojected from ${crsLabel(crs)} — imported ${r.collars.length} collar${r.collars.length === 1 ? '' : 's'}.${r.warnings ? ` ${r.warnings}` : ''}` });
    }catch(err){setImportMsg({error:true,text:err.message});}
  };

  const importIntervals = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
      const { intervals, error: err, warnings } = parseIntervalCsv(String(reader.result));
      if (err) { setImportMsg({ error: true, text: err }); return; }
      const known = new Set(project.collars.map(c => c.id));
      const matched = intervals.filter(i => known.has(i.holeId));
      const skipped = intervals.length - matched.length;
      if (!matched.length) { setImportMsg({ error: true, text: 'No hole IDs in this file matched the project.' }); return; }
      api.addIntervals(project.id, matched, file.name);
      setImportMsg({ error: false, text: `Imported ${matched.length} interval${matched.length === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped (unknown hole ID).` : ''}${warnings ? ` ${warnings}` : ''}` });
      }catch(err){setImportMsg({error:true,text:err.message});}
    };
    reader.readAsText(file);
  };

  const importSurveys = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
      const { surveys, error: err, warnings } = parseSurveyCsv(String(reader.result));
      if (err) { setImportMsg({ error: true, text: err }); return; }
      const known = new Set(project.collars.map(c => c.id));
      const matched = surveys.filter(s => known.has(s.holeId));
      const skipped = surveys.length - matched.length;
      if (!matched.length) { setImportMsg({ error: true, text: 'No hole IDs in this file matched the project.' }); return; }
      api.addSurveys(project.id, matched, file.name);
      setImportMsg({ error: false, text: `Imported ${matched.length} survey shot${matched.length === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped (unknown hole ID).` : ''}${warnings ? ` ${warnings}` : ''}` });
      }catch(err){setImportMsg({error:true,text:err.message});}
    };
    reader.readAsText(file);
  };

  const importGeology = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
      const { geology, error: err, warnings } = parseGeologyCsv(String(reader.result));
      if (err) { setImportMsg({ error: true, text: err }); return; }
      const known = new Set(project.collars.map(c => c.id));
      const matched = geology.filter(g => known.has(g.holeId));
      const skipped = geology.length - matched.length;
      if (!matched.length) { setImportMsg({ error: true, text: 'No hole IDs in this file matched the project.' }); return; }
      api.addGeology(project.id, matched, file.name);
      setImportMsg({ error: false, text: `Imported ${matched.length} logged interval${matched.length === 1 ? '' : 's'}.${skipped ? ` ${skipped} skipped (unknown hole ID).` : ''}${warnings ? ` ${warnings}` : ''}` });
      }catch(err){setImportMsg({error:true,text:err.message});}
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-tabs">
        <button type="button" className={`mx-manage-tab ${tab === 'collar' ? 'active' : ''}`} onClick={() => setTab('collar')}>{editCollar ? 'Edit collar' : 'Add collar'}</button>
        {!editCollar && (
          <button type="button" className={`mx-manage-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Import collars</button>
        )}
        <button type="button" className={`mx-manage-tab ${tab === 'intervals' ? 'active' : ''}`} onClick={() => setTab('intervals')}>Intervals</button>
        <button type="button" className={`mx-manage-tab ${tab === 'surveys' ? 'active' : ''}`} onClick={() => setTab('surveys')}>Surveys</button>
        <button type="button" className={`mx-manage-tab ${tab === 'geology' ? 'active' : ''}`} onClick={() => setTab('geology')}>Geology</button>
      </div>

      {tab === 'collar' && (
        <div className="mx-manage-form">
          <ManageField label="Hole ID" value={form.id} onChange={setField('id')} readOnly={!!editCollar} placeholder={`Auto: ${autoId}`} />
          <div className="mx-manage-row-2">
            <ManageField label="Longitude (WGS84)" value={form.lng} onChange={setField('lng')} placeholder="146.2545" />
            <ManageField label="Latitude (WGS84)" value={form.lat} onChange={setField('lat')} placeholder="-20.0648" />
          </div>
          <div className="mx-manage-row-2">
            <ManageField label="Azimuth (°)" value={form.azimuth} onChange={setField('azimuth')} placeholder="90" />
            <ManageField label="Dip (°)" value={form.dip} onChange={setField('dip')} placeholder="-60" />
          </div>
          <ManageField label="Planned depth (m)" value={form.depth} onChange={setField('depth')} placeholder="300" />
          <ManageField label="Notes" value={form.notes} onChange={setField('notes')} placeholder="Rig moved off due to rain, resume next visit" multiline />
          {error && <div className="mx-import-msg mx-import-err">{error}</div>}
          <button type="button" className="mx-btn-primary mx-btn-full" onClick={saveCollar}>{editCollar ? 'Save changes' : 'Add collar'}</button>
        </div>
      )}

      {!editCollar && tab === 'import' && (
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

      {tab === 'surveys' && (
        <div className="mx-manage-form">
          <div className="mx-drop-area mx-drop-area-sm" onClick={() => surveyInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importSurveys(e.dataTransfer.files?.[0]); }}>
            <div className="mx-drop-icon">&#8593;</div>
            <div className="mx-drop-text">Drop downhole survey CSV</div>
            <div className="mx-drop-hint">hole_id, depth, azimuth, dip — links to collars by ID</div>
            <input ref={surveyInput} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { importSurveys(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="mx-manage-hint">
            A collar&rsquo;s own azimuth/dip is only the planned orientation —
            a real hole deviates with depth. Import a gyro/EMS/single-shot
            survey file here to record the hole&rsquo;s actual downhole path.
          </div>
          {importMsg && <div className={`mx-import-msg ${importMsg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{importMsg.text}</div>}
        </div>
      )}

      {tab === 'geology' && (
        <div className="mx-manage-form">
          <div className="mx-drop-area mx-drop-area-sm" onClick={() => geologyInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importGeology(e.dataTransfer.files?.[0]); }}>
            <div className="mx-drop-icon">&#8593;</div>
            <div className="mx-drop-text">Drop geological log CSV</div>
            <div className="mx-drop-hint">hole_id, from, to, lithology, alteration, structure, notes — links to collars by ID</div>
            <input ref={geologyInput} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { importGeology(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="mx-manage-hint">
            The assay-interval table only carries lab grades for a
            from-to. Import a core/chip logging sheet here to record what
            was actually observed — lithology, alteration, structure.
          </div>
          {importMsg && <div className={`mx-import-msg ${importMsg.error ? 'mx-import-err' : 'mx-import-ok'}`}>{importMsg.text}</div>}
        </div>
      )}

      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={() => downloadText('drill_collars.csv', collarsToCsv(project.collars))}>
          {MxIcons.download} Collars CSV
        </button>
        {(project.intervals || []).length > 0 && (
          <button
            type="button" className="mx-btn-secondary mx-btn-sm"
            onClick={() => downloadText('drill_assay_intervals.csv', intervalsToCsv(project.intervals))}
            title="The from-to-grade table — previously not exportable at all"
          >
            {MxIcons.download} Assay intervals CSV
          </button>
        )}
        {(project.surveys || []).length > 0 && (
          <button
            type="button" className="mx-btn-secondary mx-btn-sm"
            onClick={() => downloadText('drill_downhole_surveys.csv', surveysToCsv(project.surveys))}
            title="Depth-indexed deviation shots, separate from the collar's planned orientation"
          >
            {MxIcons.download} Surveys CSV
          </button>
        )}
        {(project.geology || []).length > 0 && (
          <button
            type="button" className="mx-btn-secondary mx-btn-sm"
            onClick={() => downloadText('drill_geological_log.csv', geologyToCsv(project.geology))}
            title="Lithology/alteration/structure by from-to, separate from the assay-grade table"
          >
            {MxIcons.download} Geology CSV
          </button>
        )}
        <span className="mx-manage-count">{project.collars.length} holes · {(project.intervals || []).length} intervals · {(project.surveys || []).length} surveys · {(project.geology || []).length} logged</span>
      </div>
    </div>
  );
}

// ── Boundary manager ───────────────────────────────────────────────────
function BoundaryManager({ project, api }) {
  const [name,setName]=useState(project.boundary?.name||''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const rename=async()=>{setBusy(true);try{await api.renameBoundary(project.id,name.trim());setMessage('Boundary name saved. All polygons and interior rings retained.');}catch(error){setMessage(error.message);}finally{setBusy(false);}};
  return <div className="mx-manage-sections"><div className="mx-manage-form"><ManageField label="Boundary name" value={name} onChange={e=>setName(e.target.value)}/><button type="button" disabled={busy||!project.boundary||!name.trim()} onClick={rename}>Save boundary name</button><p>{project.boundary?`${spatialStats(boundaryData(project.boundary)).polygons} polygons · all exterior and interior rings retained`:'No boundary imported yet.'}</p><button type="button" className="mx-btn-primary" onClick={()=>api.openSpatialImport(project.id,[],'boundary')}>Import KML / KMZ / GeoJSON boundary</button><p>Review every tenement before saving. Adding polygons and replacing the current boundary are separate choices. Source files and previous boundaries remain in backups.</p>{message&&<p role="status">{message}</p>}</div><div className="mx-manage-actions"><button type="button" disabled={!project.boundary} onClick={()=>api.fitSpatial(boundaryData(project.boundary))}>Zoom to all tenements</button><button type="button" disabled={!project.boundary} onClick={()=>api.exportBoundary(project.id)}>Export boundary KML</button></div></div>;
}

// Reconstructs AssayInputs' editable row shape from a stored sample/
// interval's `assays`/`detectionLimits` maps — the inverse of the
// parseAssayCell() call that built them, so re-opening an edit form shows
// exactly what's on record (a below-detection value round-trips back to
// its "<0.01" text form, not a blank field).
function assayCellsToRows(assays, detectionLimits) {
  const elements = [...new Set([...Object.keys(assays || {}), ...Object.keys(detectionLimits || {})])];
  if (!elements.length) return [{ element: 'Au', value: '' }];
  return elements.map(element => ({
    element,
    value: assays?.[element] != null ? String(assays[element]) : `<${detectionLimits[element]}`,
  }));
}

// ── Assay entry: element + value rows, add/remove ──────────────────────
function AssayInputs({ rows, setRows }) {
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const usedElements = rows.map(r => r.element);
  return (
    <div className="mx-field">
      <label className="mx-field-label">Assays — leave blank if awaiting results, or type &lt;0.01 for below detection</label>
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

function ManageSelect({ label, value, onChange, options, title }) {
  return (
    <div className="mx-field">
      <label className="mx-field-label">{label}</label>
      <select className="mx-input" value={value} onChange={onChange} title={title}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </div>
  );
}
