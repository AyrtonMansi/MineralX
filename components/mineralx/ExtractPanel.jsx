'use client';
import { useCallback, useRef, useState } from 'react';
import { nextId } from './project-store';

// AI extraction flow inside the Add-data panel: paste (or drop a text
// file of) report text, send it to /api/extract, review what came back —
// counts, the model's own confidence, verbatim source quotes, and
// anything the server rejected (projected coordinates, invalid rows) —
// then import in one click. Review-before-import is deliberate: an
// extraction is a model's reading of a document, not a lab export, so
// the geologist confirms it before it lands in the project.
export default function ExtractPanel({ project, api, onBack }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { extracted, skipped }
  const [imported, setImported] = useState(false);
  const fileInput = useRef(null);

  const readFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result));
      setFileName(file.name);
      setResult(null);
      setImported(false);
      setError(null);
    };
    reader.readAsText(file);
  }, []);

  const runExtraction = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setImported(false);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fileName: fileName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Extraction failed.');
        return;
      }
      setResult(data);
    } catch {
      setError('Could not reach the extraction service.');
    } finally {
      setBusy(false);
    }
  }, [text, fileName]);

  const importAll = useCallback(() => {
    if (!result || !project) return;
    const { samples, collars, intervals } = result.extracted;
    const label = fileName ? `AI extract · ${fileName}` : 'AI extract';

    if (samples.length) {
      // Fill any IDs the document didn't provide from the project's
      // auto-ID sequence, without colliding within this batch.
      let pool = [...project.samples];
      const withIds = samples.map(s => {
        const sample = { ...s, id: s.id || nextId(pool, project.idPrefix), date: new Date().toISOString().slice(0, 10) };
        pool = [...pool, sample];
        return sample;
      });
      api.addSamples(project.id, withIds, label);
    }
    if (collars.length) {
      let pool = [...project.collars];
      const prefix = project.idPrefix.replace('-RC-', '-DD-');
      const withIds = collars.map(c => {
        const collar = { ...c, id: c.id || nextId(pool, prefix), date: new Date().toISOString().slice(0, 10) };
        pool = [...pool, collar];
        return collar;
      });
      api.addCollars(project.id, withIds, label);
    }
    if (intervals.length) {
      // Only intervals whose hole exists (already in the project, or in
      // this same extraction) — same matching rule as the CSV importer.
      const known = new Set([...project.collars.map(c => c.id), ...collars.map(c => c.id)]);
      const matched = intervals.filter(iv => known.has(iv.holeId));
      if (matched.length) api.addIntervals(project.id, matched, label);
    }
    setImported(true);
  }, [result, project, api, fileName]);

  const counts = result && {
    samples: result.extracted.samples.length,
    collars: result.extracted.collars.length,
    intervals: result.extracted.intervals.length,
  };
  const nothingFound = counts && !counts.samples && !counts.collars && !counts.intervals && !result.extracted.boundary;

  return (
    <div className="mx-extract">
      <div className="mx-extract-intro">
        Paste text from an assay report, drill log or announcement — Claude
        reads it into samples, collars and intervals for review before import.
      </div>

      <textarea
        className="mx-extract-textarea"
        placeholder="Paste report text here…"
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); setImported(false); }}
        rows={7}
      />

      <div className="mx-extract-actions">
        <button type="button" className="mx-btn-secondary" onClick={() => fileInput.current?.click()}>
          Load .txt / .md / .csv
        </button>
        <input
          ref={fileInput} type="file" accept=".txt,.md,.csv,.log,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          type="button" className="mx-btn-primary"
          disabled={busy || !text.trim()}
          onClick={runExtraction}
        >
          {busy ? 'Extracting…' : 'Extract'}
        </button>
      </div>

      {error && <div className="mx-import-msg mx-import-err">{error}</div>}

      {result && (
        <div className="mx-extract-result">
          <div className="mx-extract-summary">
            <span className="mx-extract-count">{counts.samples} sample{counts.samples === 1 ? '' : 's'}</span>
            <span className="mx-extract-count">{counts.collars} collar{counts.collars === 1 ? '' : 's'}</span>
            <span className="mx-extract-count">{counts.intervals} interval{counts.intervals === 1 ? '' : 's'}</span>
            {result.extracted.boundary && <span className="mx-extract-count">1 boundary</span>}
            <span className="mx-extract-confidence" title="The model's own confidence in this extraction">
              {Math.round(result.extracted.confidence * 100)}% confidence
            </span>
          </div>

          {nothingFound && (
            <div className="mx-import-msg mx-import-err">No structured geology data found in this text.</div>
          )}

          {result.extracted.sourceHighlights.length > 0 && (
            <div className="mx-extract-quotes">
              <div className="mx-section-label">SOURCE QUOTES</div>
              {result.extracted.sourceHighlights.slice(0, 5).map((h, i) => (
                <div key={i} className="mx-extract-quote">
                  <span className="mx-extract-quote-type">{h.type}</span>
                  <span className="mx-extract-quote-text">&ldquo;{h.text}&rdquo;</span>
                </div>
              ))}
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="mx-extract-skipped">
              <div className="mx-section-label">NOT IMPORTED</div>
              {result.skipped.slice(0, 6).map((s, i) => (
                <div key={i} className="mx-extract-skip-row">{s.kind} {s.id}: {s.reason}</div>
              ))}
            </div>
          )}

          {!nothingFound && !imported && (
            <button type="button" className="mx-btn-primary mx-extract-import" onClick={importAll}>
              Import into {project?.name || 'project'}
            </button>
          )}
          {result.extracted.boundary && !imported && (
            <button
              type="button" className="mx-btn-secondary mx-extract-import"
              onClick={() => api.setBoundary(project.id, result.extracted.boundary.name, result.extracted.boundary.coords, fileName || 'AI extract')}
            >
              Set extracted boundary (replaces current)
            </button>
          )}
          {imported && <div className="mx-import-msg mx-import-ok">Imported. Review the new records on the map — undo with Ctrl+Z if needed.</div>}
        </div>
      )}

      <button type="button" className="mx-extract-back" onClick={onBack}>&larr; Back to file upload</button>
    </div>
  );
}
