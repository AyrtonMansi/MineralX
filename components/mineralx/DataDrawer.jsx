'use client';
import { useMemo, useState } from 'react';
import {
  gradeOf, GRADE_COLORS, formatAssay, assayDisplay, elementInfo, samplesToCsv, collarsToCsv, intervalsToCsv, surveysToCsv, geologyToCsv, downloadText,
  TARGET_STATUSES, bestLinkedGrade, QAQC_TYPE_LABELS, SAMPLE_TYPE_LABELS,
} from './project-store';
import { evidenceSummary, targetStatusMeta } from './map-render-helpers';
import { orderTargetsForField, targetsToGpx, targetsToWaypointCsv } from './target-tasking';
import { MxIcons } from './MineralXIcons';
import { scopedDownholeRecords } from './field-workflows.js';

// Short badge text for the QAQC tag on a sample row — a manager scanning
// the list needs to see QAQC coverage at a glance, not read a full label.
const QAQC_BADGE = { standard: 'STD', blank: 'BLANK', duplicate: 'DUP', triplicate: 'TRIP' };

// The home of all project data: a clean list per dataset, not a GIS
// attribute table. Row click → zoom to the feature and open its popup.
export default function DataDrawer({ store, api, tab, setTab, activeElement, initialFilter, onAdd, onEdit, onClose }) {
  const [filter, setFilter] = useState(initialFilter || '');
  const [expanded, setExpanded] = useState(null); // hole id whose assay table is open
  const [expandedTarget, setExpandedTarget] = useState(null); // target id whose linked-samples list is open
  const q = filter.trim().toLowerCase();

  // On phones the drawer is full-width: close it after flying to a
  // feature so the user can actually see what they tapped.
  const focusFeature = (lat, lng, id) => {
    api.focusOn(lat, lng, id);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) onClose();
  };

  // Project scope: a program spans several projects, often in different
  // countries. Default to the active project so the lists open focused, not
  // buried under every other site's data; "All projects" widens them.
  const [projectFilter, setProjectFilter] = useState(store.activeProjectId || 'all');
  const scoped = (list) => (projectFilter === 'all' ? list : list.filter(x => x.project.id === projectFilter));
  // When looking across projects, each row shows which project it's from.
  const showProject = projectFilter === 'all' && store.projects.length > 1;

  const allSamples = useMemo(() =>
    store.projects.flatMap(p => p.samples.map(s => ({ ...s, project: p }))), [store]);
  const allCollars = useMemo(() =>
    store.projects.flatMap(p => p.collars.map(c => ({
      ...c, project: p,
      intervals: (p.intervals || []).filter(i => i.holeId === c.id),
      surveys: (p.surveys || []).filter(s => s.holeId === c.id),
      geology: (p.geology || []).filter(g => g.holeId === c.id),
    }))), [store]);
  const allFiles = useMemo(() =>
    store.projects.flatMap(p => p.files.map(f => ({ ...f, project: p }))), [store]);
  // Highest-scoring targets first — the worklist is a ranked queue.
  const allTargets = useMemo(() =>
    store.projects
      .flatMap(p => (p.targets || []).map(t => ({ ...t, project: p })))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [store]);

  // 'pending' is a status filter, not just text: matches samples with no
  // assay result at all — including detection limits, since a sample that
  // came back "<0.01" genuinely was assayed and isn't awaiting anything.
  const samples = scoped(q
    ? allSamples.filter(s =>
        (q === 'pending' && Object.keys(s.assays || {}).length === 0 && Object.keys(s.detectionLimits || {}).length === 0) ||
        s.id.toLowerCase().includes(q) || (s.lith || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q))
    : allSamples);
  const collars = scoped(q ? allCollars.filter(c => c.id.toLowerCase().includes(q)) : allCollars);
  const files = scoped(q ? allFiles.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) : allFiles);
  const targets = scoped(q
    ? allTargets.filter(t => t.id.toLowerCase().includes(q) || t.status.includes(q) || evidenceSummary(t).toLowerCase().includes(q))
    : allTargets);

  const exportCurrent = () => {
    // Export what's in scope (the selected project, or the whole program).
    if (tab === 'chips') downloadText('rock_chips.csv', samplesToCsv(scoped(allSamples)));
    if (tab === 'holes') downloadText('drill_collars.csv', collarsToCsv(scoped(allCollars)));
  };

  // The from-to-grade table for whichever holes are in scope — previously
  // there was no way at all to get assay-interval data back out of the app.
  const scopedIntervals = () => scopedDownholeRecords(store, projectFilter, 'intervals');
  const exportIntervals = () => downloadText('drill_assay_intervals.csv', intervalsToCsv(scopedIntervals()));

  // The downhole survey record for whichever holes are in scope.
  const scopedSurveys = () => scopedDownholeRecords(store, projectFilter, 'surveys');
  const exportSurveys = () => downloadText('drill_downhole_surveys.csv', surveysToCsv(scopedSurveys()));

  // The geological log for whichever holes are in scope.
  const scopedGeology = () => scopedDownholeRecords(store, projectFilter, 'geology');
  const exportGeology = () => downloadText('drill_geological_log.csv', geologyToCsv(scopedGeology()));

  // Field tasking: the shown targets (the filter doubles as a selection),
  // ordered into a walkable sequence, exported as GPX for a handheld GPS
  // plus a plain CSV. Two files in one click, like the program export.
  const exportWaypoints = () => {
    const ordered = orderTargetsForField(targets);
    downloadText('field_targets.gpx', targetsToGpx(ordered), 'application/gpx+xml');
    downloadText('field_targets.csv', targetsToWaypointCsv(ordered));
  };

  // Which samples across the program a target is linked to (for the
  // expandable detail + unlink).
  const linkedSamplesOf = (t) => {
    const byId = new Map(allSamples.filter(s => s.project.id === t.project.id).map(s => [s.id, s]));
    return (t.linkedSampleIds || []).map(id => byId.get(id)).filter(Boolean);
  };

  const sampleValue = (s) => {
    const primary = assayDisplay(s, activeElement);
    if (primary != null) return primary;
    const otherAssays = Object.entries(s.assays || {}).map(([el, val]) => formatAssay(el, val));
    const otherDL = Object.entries(s.detectionLimits || {}).map(([el, dl]) => formatAssay(el, dl, { belowDetection: true }));
    const other = [...otherAssays, ...otherDL];
    if (other.length) return other.slice(0, 2).join(' · ');
    return 'pending';
  };

  // Non-modal: the map stays live so row clicks can fly to features.
  return (
    <div className="mx-data-drawer-wrap">
      <div className="mx-manage-drawer mx-anim-rise">
        <div className="mx-manage-header">
          <div>
            <div className="mx-eyebrow">PROGRAM DATA</div>
            <h2 className="mx-manage-title">All data</h2>
          </div>
          <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="mx-data-controls">
          <div className="mx-manage-tabs">
            <button type="button" className={`mx-manage-tab ${tab === 'chips' ? 'active' : ''}`} onClick={() => setTab('chips')}>Rock chips ({scoped(allSamples).length})</button>
            <button type="button" className={`mx-manage-tab ${tab === 'holes' ? 'active' : ''}`} onClick={() => setTab('holes')}>Drill holes ({scoped(allCollars).length})</button>
            <button type="button" className={`mx-manage-tab ${tab === 'targets' ? 'active' : ''}`} onClick={() => setTab('targets')}>Targets ({scoped(allTargets).length})</button>
            <button type="button" className={`mx-manage-tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>Files ({scoped(allFiles).length})</button>
          </div>
          {store.projects.length > 1 && (
            <select
              className="mx-input mx-data-project-select"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              title="Scope to one project or view the whole program"
            >
              <option value="all">All projects ({store.projects.length})</option>
              {store.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <input
            type="text"
            className="mx-input mx-data-filter"
            placeholder="Filter by ID, lithology, notes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="mx-manage-body">
          {tab === 'chips' && (
            <div className="mx-data-list">
              {samples.length === 0 && <div className="mx-empty-hint">{q ? 'No samples match.' : 'No rock chips yet — add one below or import a CSV.'}</div>}
              {samples.map(s => {
                const g = gradeOf(s, activeElement);
                return (
                  <div key={`${s.project.id}-${s.id}`} className="mx-data-row" role="button" tabIndex={0}
                    onClick={() => focusFeature(s.lat, s.lng, s.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') focusFeature(s.lat, s.lng, s.id); }}>
                    <span className={`mx-data-dot ${g === 'pending' ? 'mx-data-dot-pending' : ''}`} style={g !== 'pending' ? { background: GRADE_COLORS[g] } : undefined} />
                    <div className="mx-data-main">
                      <div className="mx-data-id">
                        {s.id}
                        {s.photo && <span className="mx-data-photo-tag" title="Has photo">photo</span>}
                        {s.qaqcType && s.qaqcType !== 'none' && (
                          <span className={`mx-data-qaqc-tag mx-data-qaqc-${s.qaqcType}`} title={QAQC_TYPE_LABELS[s.qaqcType]}>
                            {QAQC_BADGE[s.qaqcType]}
                          </span>
                        )}
                        {s.sampleType && s.sampleType !== 'rock_chip' && (
                          <span className="mx-data-type-tag" title={SAMPLE_TYPE_LABELS[s.sampleType]}>{SAMPLE_TYPE_LABELS[s.sampleType]}</span>
                        )}
                        {showProject && <ProjectBadge project={s.project} />}
                      </div>
                      <div className="mx-data-sub">{s.lith || '—'}{s.notes ? ` · ${s.notes}` : ''}</div>
                    </div>
                    <span className="mx-data-value">{sampleValue(s)}</span>
                    <button
                      type="button" className="mx-data-edit" title="Edit sample"
                      onClick={(e) => { e.stopPropagation(); onEdit('chips', s.project.id, s.id); }}
                    >{MxIcons.edit}</button>
                    <button
                      type="button" className="mx-data-delete" title="Delete sample"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete ${s.id}? (Undo with Ctrl+Z if you change your mind.)`)) api.deleteSample(s.project.id, s.id);
                      }}
                    >{MxIcons.trash}</button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'holes' && (
            <div className="mx-data-list">
              {collars.length === 0 && <div className="mx-empty-hint">{q ? 'No holes match.' : 'No drill holes yet — add a collar below or import a CSV.'}</div>}
              {collars.map(c => {
                const open = expanded === c.id;
                const best = c.intervals.reduce((b, i) => {
                  const v = i.assays?.[activeElement];
                  return v != null && (b == null || v > b) ? v : b;
                }, null);
                return (
                  <div key={`${c.project.id}-${c.id}`}>
                    <div className="mx-data-row" role="button" tabIndex={0}
                      onClick={() => { setExpanded(open ? null : c.id); focusFeature(c.lat, c.lng, c.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setExpanded(open ? null : c.id); focusFeature(c.lat, c.lng, c.id); } }}>
                      <span className="mx-data-caret">{open ? MxIcons.chevronDown : MxIcons.chevronRight}</span>
                      <span className="mx-data-collar" />
                      <div className="mx-data-main">
                        <div className="mx-data-id">{c.id}{showProject && <ProjectBadge project={c.project} />}</div>
                        <div className="mx-data-sub">
                          {c.depth != null ? `${c.depth} m` : 'depth n/a'}
                          {c.azimuth != null ? ` · ${c.azimuth}°/${c.dip ?? '?'}°` : ''}
                          {c.intervals.length ? ` · ${c.intervals.length} assay${c.intervals.length === 1 ? '' : 's'}` : ' · no assays'}
                          {c.surveys.length ? ` · ${c.surveys.length} survey shot${c.surveys.length === 1 ? '' : 's'}` : ''}
                          {c.geology.length ? ` · ${c.geology.length} logged` : ''}
                          {c.notes ? ` · ${c.notes}` : ''}
                        </div>
                      </div>
                      <span className="mx-data-value">{best != null ? `best ${formatAssay(activeElement, best)}` : ''}</span>
                      <button
                        type="button" className="mx-data-edit" title="Edit collar"
                        onClick={(e) => { e.stopPropagation(); onEdit('holes', c.project.id, c.id); }}
                      >{MxIcons.edit}</button>
                      <button
                        type="button" className="mx-data-delete" title="Delete hole"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete ${c.id} and its intervals? (Undo with Ctrl+Z if you change your mind.)`)) api.deleteCollar(c.project.id, c.id);
                        }}
                      >{MxIcons.trash}</button>
                    </div>
                    {open && <IntervalTable collar={c} activeElement={activeElement} onAddIntervals={() => onAdd('holes', c.project.id)} />}
                    {open && <SurveyTable collar={c} />}
                    {open && <GeologyTable collar={c} />}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'targets' && (
            <div className="mx-data-list">
              {targets.length === 0 && (
                <div className="mx-empty-hint">
                  {q ? 'No targets match.' : 'No targets yet. Open Layers → Target Analysis, then click a candidate on the map and “Add to targets” to start your worklist.'}
                </div>
              )}
              {targets.map(t => {
                const meta = targetStatusMeta(t.status);
                const linkedSamples = linkedSamplesOf(t);
                const open = expandedTarget === t.id;
                return (
                  <div key={`${t.project.id}-${t.id}`}>
                    <div className="mx-data-row" role="button" tabIndex={0}
                      onClick={() => { if (linkedSamples.length) setExpandedTarget(open ? null : t.id); focusFeature(t.lat, t.lng, t.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') focusFeature(t.lat, t.lng, t.id); }}>
                      <span className="mx-data-target-dot" style={{ background: meta.color }} />
                      <div className="mx-data-main">
                        <div className="mx-data-id">{t.id}{showProject && <ProjectBadge project={t.project} />}</div>
                        <div className="mx-data-sub">{evidenceSummary(t)}{linkedSamples.length ? ` · ${linkedSamples.length} linked sample${linkedSamples.length === 1 ? '' : 's'}` : ''}</div>
                      </div>
                      <select
                        className="mx-target-status" value={t.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); api.setTargetStatus(t.project.id, t.id, e.target.value); }}
                        title="Target status"
                      >
                        {TARGET_STATUSES.map(s => <option key={s} value={s}>{targetStatusMeta(s).label}</option>)}
                      </select>
                      <button
                        type="button" className="mx-data-delete" title="Dismiss target — won't reappear on re-run"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Dismiss ${t.id}? It won't come back when you re-run the analysis. (Undo with Ctrl+Z.)`)) api.dismissTarget(t.project.id, t.id);
                        }}
                      >{MxIcons.trash}</button>
                    </div>
                    {open && linkedSamples.length > 0 && (
                      <div className="mx-target-links">
                        {linkedSamples.map(s => (
                          <div key={s.id} className="mx-target-link-row">
                            <span className="mx-target-link-id">{s.id}</span>
                            <span className="mx-target-link-val">{Object.keys(s.assays || {}).length ? Object.entries(s.assays).slice(0, 2).map(([el, v]) => formatAssay(el, v)).join(' · ') : 'awaiting assay'}</span>
                            <button type="button" className="mx-target-unlink" title="Unlink this sample from the target"
                              onClick={(e) => { e.stopPropagation(); api.unlinkSample(t.project.id, t.id, s.id); }}>unlink</button>
                          </div>
                        ))}
                        <TargetAssess target={t} linkedSamples={linkedSamples} api={api} activeElement={activeElement} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'files' && (
            <div className="mx-data-list">
              {files.length === 0 && <div className="mx-empty-hint">{q ? 'No files match.' : 'Nothing uploaded yet — imports appear here.'}</div>}
              {files.map((f, i) => (
                <div key={`${f.project.id}-${f.name}-${i}`} className="mx-data-row mx-data-row-static">
                  <span className="mx-data-dot" style={{ background: '#8A857A', borderRadius: 3 }} />
                  <div className="mx-data-main">
                    <div className="mx-data-id">{f.name}{showProject && <ProjectBadge project={f.project} />}</div>
                    <div className="mx-data-sub">{f.meta}{f.date ? ` · ${f.date}` : ''}</div>
                  </div>
                  <span className="mx-recent-tag">{f.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {(tab === 'chips' || tab === 'holes') && (
          <div className="mx-data-footer">
            <button type="button" className="mx-btn-primary mx-btn-sm" disabled={projectFilter === 'all'} onClick={() => onAdd(tab, projectFilter)}>
              + {tab === 'chips' ? 'Add sample' : 'Add collar'}
            </button>
            <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={exportCurrent}>
              {MxIcons.download} {tab === 'chips' ? 'Export CSV' : 'Collars CSV'}
            </button>
            {tab === 'holes' && scopedIntervals().length > 0 && (
              <button
                type="button" className="mx-btn-secondary mx-btn-sm" onClick={exportIntervals}
                title="The from-to-grade table — a separate export from the collar list"
              >
                {MxIcons.download} Assay intervals CSV
              </button>
            )}
            {tab === 'holes' && scopedSurveys().length > 0 && (
              <button
                type="button" className="mx-btn-secondary mx-btn-sm" onClick={exportSurveys}
                title="Depth-indexed deviation shots — the hole's actual path, not just the collar's planned orientation"
              >
                {MxIcons.download} Surveys CSV
              </button>
            )}
            {tab === 'holes' && scopedGeology().length > 0 && (
              <button
                type="button" className="mx-btn-secondary mx-btn-sm" onClick={exportGeology}
                title="Lithology/alteration/structure by from-to — the geologist's own log, separate from the assay-grade table"
              >
                {MxIcons.download} Geology CSV
              </button>
            )}
          </div>
        )}
        {tab === 'targets' && targets.length > 0 && (
          <div className="mx-data-footer">
            <button type="button" className="mx-btn-primary mx-btn-sm" onClick={exportWaypoints}>
              {MxIcons.download} Export field waypoints ({targets.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Assessment for one target: put the frozen evidence that generated it
// next to the actual grade its linked samples returned, and let the
// geologist close the loop with one click. The verdict is theirs — the
// panel only surfaces the number to decide on.
function TargetAssess({ target, linkedSamples, api, activeElement }) {
  const element = target.provenance?.element || activeElement;
  const best = bestLinkedGrade(linkedSamples, element);
  const t = elementInfo(element);
  const assessed = target.status === 'confirmed' || target.status === 'barren';
  return (
    <div className="mx-target-assess">
      <div className="mx-target-assess-line">
        <span className="mx-target-assess-label">Result</span>
        {best != null
          ? <span className="mx-target-assess-val">{formatAssay(element, best)}{best >= t.high ? ' · high' : best >= t.anom ? ' · anomalous' : ' · background'}</span>
          : <span className="mx-target-assess-val mx-target-assess-pending">awaiting assay on linked sample{linkedSamples.length === 1 ? '' : 's'}</span>}
      </div>
      {best != null && (
        <div className="mx-target-assess-actions">
          <button type="button"
            className={`mx-assess-btn ${target.status === 'confirmed' ? 'mx-assess-confirmed' : ''}`}
            onClick={(e) => { e.stopPropagation(); api.setTargetStatus(target.project.id, target.id, 'confirmed'); }}>
            Confirmed
          </button>
          <button type="button"
            className={`mx-assess-btn ${target.status === 'barren' ? 'mx-assess-barren' : ''}`}
            onClick={(e) => { e.stopPropagation(); api.setTargetStatus(target.project.id, target.id, 'barren'); }}>
            Barren
          </button>
        </div>
      )}
      {assessed && <div className="mx-target-assess-done">Feeds the model hit-rate in the Layers panel.</div>}
    </div>
  );
}

// A small project tag on a data row, so records from different projects
// (often different countries) are distinguishable when viewing the whole
// program at once.
function ProjectBadge({ project }) {
  return (
    <span className="mx-data-project" title={project.name}>
      <span className="mx-data-project-dot" style={{ background: project.color }} />
      {project.name}
    </span>
  );
}

// Downhole assay intercepts for one hole — the drill-assay table.
function IntervalTable({ collar, activeElement, onAddIntervals }) {
  const rows = [...collar.intervals].sort((a, b) => a.from - b.from);
  // Elements assayed anywhere in this hole (including below-detection-only
  // results), active element first.
  const elements = [...new Set(rows.flatMap(r => [...Object.keys(r.assays || {}), ...Object.keys(r.detectionLimits || {})]))]
    .sort((a, b) => (a === activeElement ? -1 : b === activeElement ? 1 : 0));

  if (!rows.length) {
    return (
      <div className="mx-interval-empty">
        No downhole assays for {collar.id} yet.
        <button type="button" className="mx-interval-add" onClick={onAddIntervals}>Import intervals</button>
      </div>
    );
  }

  return (
    <div className="mx-interval-table">
      <div className="mx-interval-head">
        <span className="mx-iv-depth">From–To (m)</span>
        <span className="mx-iv-width">Width</span>
        {elements.map(el => <span key={el} className="mx-iv-el">{el}</span>)}
      </div>
      {rows.map((r, i) => {
        const v = r.assays?.[activeElement];
        const high = v != null && v >= elementInfo(activeElement).high;
        return (
          <div key={i} className={`mx-interval-row ${high ? 'mx-interval-hot' : ''}`}>
            <span className="mx-iv-depth">{r.from}–{r.to}</span>
            <span className="mx-iv-width">{(r.to - r.from).toFixed(1)} m</span>
            {elements.map(el => <span key={el} className="mx-iv-el">{assayDisplay(r, el) ?? '—'}</span>)}
          </div>
        );
      })}
    </div>
  );
}

// Downhole survey shots for one hole — the actual deviation path, as
// distinct from the collar's own planned azimuth/dip. Only rendered when
// the hole has survey data at all; a collar with none doesn't need an
// empty-state nudge the way intervals do (surveys are a specialist import,
// not every program runs a downhole survey tool on every hole).
function SurveyTable({ collar }) {
  if (!collar.surveys.length) return null;
  const rows = [...collar.surveys].sort((a, b) => a.depth - b.depth);
  return (
    <div className="mx-interval-table mx-survey-table">
      <div className="mx-interval-head">
        <span className="mx-iv-depth">Depth (m)</span>
        <span className="mx-iv-el">Azimuth</span>
        <span className="mx-iv-el">Dip</span>
      </div>
      {rows.map((s, i) => (
        <div key={i} className="mx-interval-row">
          <span className="mx-iv-depth">{s.depth}</span>
          <span className="mx-iv-el">{s.azimuth.toFixed(1)}°</span>
          <span className="mx-iv-el">{s.dip.toFixed(1)}°</span>
        </div>
      ))}
    </div>
  );
}

// The geological log for one hole — lithology/alteration/structure by
// from-to, the geologist's own observation of core/chips in hand. Same
// "only render when data exists" rule as SurveyTable: not every hole gets
// logged in this tool, and an empty table isn't useful signal.
function GeologyTable({ collar }) {
  if (!collar.geology.length) return null;
  const rows = [...collar.geology].sort((a, b) => a.from - b.from);
  return (
    <div className="mx-interval-table mx-survey-table mx-geology-table">
      <div className="mx-interval-head">
        <span className="mx-iv-depth">From–to</span>
        <span className="mx-iv-el">Lithology</span>
        <span className="mx-iv-el">Alteration</span>
        <span className="mx-iv-el">Structure</span>
      </div>
      {rows.map((g, i) => (
        <div key={i} className="mx-interval-row">
          <span className="mx-iv-depth">{g.from}–{g.to}</span>
          <span className="mx-iv-el">{g.lithology || '—'}</span>
          <span className="mx-iv-el">{g.alteration || '—'}</span>
          <span className="mx-iv-el">{g.structure || '—'}</span>
        </div>
      ))}
    </div>
  );
}
