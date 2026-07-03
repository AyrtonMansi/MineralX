'use client';
import { useMemo, useState } from 'react';
import { gradeOf, GRADE_COLORS, formatAssay, samplesToCsv, collarsToCsv, downloadText } from './project-store';
import { MxIcons } from './MineralXIcons';

// The home of all project data: a clean list per dataset, not a GIS
// attribute table. Row click → zoom to the feature and open its popup.
export default function DataDrawer({ store, api, tab, setTab, activeElement, initialFilter, onAdd, onClose }) {
  const [filter, setFilter] = useState(initialFilter || '');
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

  // 'pending' is a status filter, not just text: matches unassayed chips.
  const samples = q
    ? allSamples.filter(s =>
        (q === 'pending' && Object.keys(s.assays || {}).length === 0) ||
        s.id.toLowerCase().includes(q) || (s.lith || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q))
    : allSamples;
  const collars = q ? allCollars.filter(c => c.id.toLowerCase().includes(q)) : allCollars;
  const files = q ? allFiles.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) : allFiles;

  const exportCurrent = () => {
    if (tab === 'chips') downloadText('rock_chips.csv', samplesToCsv(allSamples));
    if (tab === 'holes') downloadText('drill_collars.csv', collarsToCsv(allCollars));
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
                        if (window.confirm(`Delete ${s.id}? This cannot be undone.`)) api.deleteSample(s.project.id, s.id);
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
              {collars.map(c => (
                <div key={`${c.project.id}-${c.id}`} className="mx-data-row" role="button" tabIndex={0}
                  onClick={() => focusFeature(c.lat, c.lng, c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') focusFeature(c.lat, c.lng, c.id); }}>
                  <span className="mx-data-collar" />
                  <div className="mx-data-main">
                    <div className="mx-data-id">{c.id}</div>
                    <div className="mx-data-sub">
                      {c.depth != null ? `${c.depth} m` : 'depth n/a'}
                      {c.azimuth != null ? ` · ${c.azimuth}°/${c.dip ?? '?'}°` : ''}
                      {c.intervals.length ? ` · ${c.intervals.length} intervals` : ''}
                    </div>
                  </div>
                  <span className="mx-data-value">
                    {(() => {
                      const best = c.intervals.reduce((b, i) => {
                        const v = i.assays?.[activeElement];
                        return v != null && (b == null || v > b) ? v : b;
                      }, null);
                      return best != null ? `best ${formatAssay(activeElement, best)}` : '';
                    })()}
                  </span>
                  <button
                    type="button" className="mx-data-delete" title="Delete hole"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete ${c.id} and its intervals? This cannot be undone.`)) api.deleteCollar(c.project.id, c.id);
                    }}
                  >{MxIcons.trash}</button>
                </div>
              ))}
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

        {tab !== 'files' && (
          <div className="mx-data-footer">
            <button type="button" className="mx-btn-primary mx-btn-sm" onClick={() => onAdd(tab)}>
              + {tab === 'chips' ? 'Add sample' : 'Add collar'}
            </button>
            <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={exportCurrent}>
              {MxIcons.download} Export CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
