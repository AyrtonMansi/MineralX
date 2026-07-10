'use client';
import { useMemo, useState } from 'react';
import { gradeOf, GRADE_COLORS, formatAssay, elementInfo, samplesToCsv, collarsToCsv, downloadText, TARGET_STATUSES, bestLinkedGrade } from './project-store';
import { evidenceSummary, targetStatusMeta } from './map-render-helpers';
import { orderTargetsForField, targetsToGpx, targetsToWaypointCsv } from './target-tasking';
import { MxIcons } from './MineralXIcons';

// The home of all project data: a clean list per dataset, not a GIS
// attribute table. Row click → zoom to the feature and open its popup.
export default function DataDrawer({ store, api, tab, setTab, activeElement, initialFilter, onAdd, onClose }) {
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

  const allSamples = useMemo(() =>
    store.projects.flatMap(p => p.samples.map(s => ({ ...s, project: p }))), [store]);
  const allCollars = useMemo(() =>
    store.projects.flatMap(p => p.collars.map(c => ({ ...c, project: p, intervals: (p.intervals || []).filter(i => i.holeId === c.id) }))), [store]);
  const allFiles = useMemo(() =>
    store.projects.flatMap(p => p.files.map(f => ({ ...f, project: p }))), [store]);
  // Highest-scoring targets first — the worklist is a ranked queue.
  const allTargets = useMemo(() =>
    store.projects
      .flatMap(p => (p.targets || []).map(t => ({ ...t, project: p })))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [store]);

  // 'pending' is a status filter, not just text: matches unassayed chips.
  const samples = q
    ? allSamples.filter(s =>
        (q === 'pending' && Object.keys(s.assays || {}).length === 0) ||
        s.id.toLowerCase().includes(q) || (s.lith || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q))
    : allSamples;
  const collars = q ? allCollars.filter(c => c.id.toLowerCase().includes(q)) : allCollars;
  const files = q ? allFiles.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) : allFiles;
  const targets = q
    ? allTargets.filter(t => t.id.toLowerCase().includes(q) || t.status.includes(q) || evidenceSummary(t).toLowerCase().includes(q))
    : allTargets;

  const exportCurrent = () => {
    if (tab === 'chips') downloadText('rock_chips.csv', samplesToCsv(allSamples));
    if (tab === 'holes') downloadText('drill_collars.csv', collarsToCsv(allCollars));
  };

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
    const byId = new Map(allSamples.map(s => [s.id, s]));
    return (t.linkedSampleIds || []).map(id => byId.get(id)).filter(Boolean);
  };

  const sampleValue = (s) => {
    const v = s.assays?.[activeElement];
    if (v != null) return formatAssay(activeElement, v);
    const other = Object.entries(s.assays || {});
    if (other.length) return other.map(([el, val]) => formatAssay(el, val)).slice(0, 2).join(' · ');
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
            <button type="button" className={`mx-manage-tab ${tab === 'chips' ? 'active' : ''}`} onClick={() => setTab('chips')}>Rock chips ({allSamples.length})</button>
            <button type="button" className={`mx-manage-tab ${tab === 'holes' ? 'active' : ''}`} onClick={() => setTab('holes')}>Drill holes ({allCollars.length})</button>
            <button type="button" className={`mx-manage-tab ${tab === 'targets' ? 'active' : ''}`} onClick={() => setTab('targets')}>Targets ({allTargets.length})</button>
            <button type="button" className={`mx-manage-tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>Files ({allFiles.length})</button>
          </div>
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
                      </div>
                      <div className="mx-data-sub">{s.lith || '—'}{s.notes ? ` · ${s.notes}` : ''}</div>
                    </div>
                    <span className="mx-data-value">{sampleValue(s)}</span>
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
                        <div className="mx-data-id">{c.id}</div>
                        <div className="mx-data-sub">
                          {c.depth != null ? `${c.depth} m` : 'depth n/a'}
                          {c.azimuth != null ? ` · ${c.azimuth}°/${c.dip ?? '?'}°` : ''}
                          {c.intervals.length ? ` · ${c.intervals.length} assay${c.intervals.length === 1 ? '' : 's'}` : ' · no assays'}
                        </div>
                      </div>
                      <span className="mx-data-value">{best != null ? `best ${formatAssay(activeElement, best)}` : ''}</span>
                      <button
                        type="button" className="mx-data-delete" title="Delete hole"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete ${c.id} and its intervals? (Undo with Ctrl+Z if you change your mind.)`)) api.deleteCollar(c.project.id, c.id);
                        }}
                      >{MxIcons.trash}</button>
                    </div>
                    {open && <IntervalTable collar={c} activeElement={activeElement} onAddIntervals={() => onAdd('holes')} />}
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
                        <div className="mx-data-id">{t.id}</div>
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
                    <div className="mx-data-id">{f.name}</div>
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
            <button type="button" className="mx-btn-primary mx-btn-sm" onClick={() => onAdd(tab)}>
              + {tab === 'chips' ? 'Add sample' : 'Add collar'}
            </button>
            <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={exportCurrent}>
              {MxIcons.download} Export CSV
            </button>
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

// Downhole assay intercepts for one hole — the drill-assay table.
function IntervalTable({ collar, activeElement, onAddIntervals }) {
  const rows = [...collar.intervals].sort((a, b) => a.from - b.from);
  // Elements assayed anywhere in this hole, active element first.
  const elements = [...new Set(rows.flatMap(r => Object.keys(r.assays || {})))]
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
            {elements.map(el => (
              <span key={el} className="mx-iv-el">{r.assays?.[el] != null ? formatAssay(el, r.assays[el]) : '—'}</span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
