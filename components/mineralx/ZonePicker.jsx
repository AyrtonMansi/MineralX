'use client';
import { useState } from 'react';

// Shown instead of a normal import result when parseSampleCsv/
// parseCollarCsv detects the lat/lng-named columns actually hold GDA2020
// MGA easting/northing (see isProjectedCoord() in project-store.js).
// Never auto-applies a zone — the geologist must see and confirm the
// assumption before anything gets reprojected and placed on the map.
export default function ZonePicker({ easting, northing, onConfirm, onCancel }) {
  const [zone, setZone] = useState(55); // North QLD, this app's own focus region

  return (
    <div className="mx-zone-picker">
      <div className="mx-zone-title">This looks like projected coordinates, not lat/lng</div>
      <div className="mx-zone-body">
        Found easting <strong>{easting}</strong>, northing <strong>{northing}</strong> —
        those are GDA2020 MGA metres, not decimal degrees. Confirm the zone
        so this can be placed correctly; nothing is imported until you do.
      </div>
      <div className="mx-zone-select-row">
        <label className="mx-field-label">MGA Zone (GDA2020)</label>
        <div className="mx-zone-options">
          {[54, 55, 56].map(z => (
            <button
              key={z}
              type="button"
              className={`mx-cat-chip ${zone === z ? 'active' : ''}`}
              onClick={() => setZone(z)}
            >Zone {z}{z === 55 ? ' (likely)' : ''}</button>
          ))}
        </div>
      </div>
      <div className="mx-zone-actions">
        <button type="button" className="mx-btn-primary mx-btn-sm" onClick={() => onConfirm(zone)}>Reproject &amp; import</button>
        <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
