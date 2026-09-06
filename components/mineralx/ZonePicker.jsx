'use client';
import { useState } from 'react';
import { CRS_SYSTEMS } from './project-store';

// Shown instead of a normal import result when parseSampleCsv/
// parseCollarCsv detects the lat/lng-named columns actually hold projected
// easting/northing (see isProjectedCoord() in project-store.js). Never
// auto-applies a grid — the geologist confirms the coordinate system and
// zone before anything is reprojected and placed on the map. Supports
// Australian MGA and worldwide UTM so a program can run in more than one
// country.
export default function ZonePicker({ easting, northing, onConfirm, onCancel }) {
  const [systemId, setSystemId] = useState('mga2020'); // Australia is this app's home region
  const [zone, setZone] = useState(55); // North QLD, the demo's own focus

  const system = CRS_SYSTEMS.find(s => s.id === systemId) || CRS_SYSTEMS[0];
  const zoneInSystem = system.zones.includes(zone) ? zone : system.defaultZone;
  const useChips = system.zones.length <= 12; // MGA: chips; UTM's 60 zones: a select

  const pickSystem = (id) => {
    const next = CRS_SYSTEMS.find(s => s.id === id) || CRS_SYSTEMS[0];
    setSystemId(id);
    if (!next.zones.includes(zone)) setZone(next.defaultZone);
  };

  return (
    <div className="mx-zone-picker">
      <div className="mx-zone-title">This looks like projected coordinates, not lat/lng</div>
      <div className="mx-zone-body">
        Found easting <strong>{easting}</strong>, northing <strong>{northing}</strong> —
        those are grid metres, not decimal degrees. Confirm the coordinate
        system and zone so this is placed correctly; nothing is imported
        until you do.
      </div>

      <div className="mx-zone-select-row">
        <label className="mx-field-label">Coordinate system</label>
        <div className="mx-zone-systems">
          {CRS_SYSTEMS.map(s => (
            <button
              key={s.id}
              type="button"
              className={`mx-cat-chip ${systemId === s.id ? 'active' : ''}`}
              onClick={() => pickSystem(s.id)}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div className="mx-zone-select-row">
        <label className="mx-field-label">Zone</label>
        {useChips ? (
          <div className="mx-zone-options">
            {system.zones.map(z => (
              <button
                key={z}
                type="button"
                className={`mx-cat-chip ${zoneInSystem === z ? 'active' : ''}`}
                onClick={() => setZone(z)}
              >Zone {z}{system.id === 'mga2020' && z === 55 ? ' (likely)' : ''}</button>
            ))}
          </div>
        ) : (
          <select
            className="mx-input mx-zone-number"
            value={zoneInSystem}
            onChange={(e) => setZone(Number(e.target.value))}
          >
            {system.zones.map(z => <option key={z} value={z}>Zone {z}</option>)}
          </select>
        )}
      </div>

      <div className="mx-zone-actions">
        <button type="button" className="mx-btn-primary mx-btn-sm" onClick={() => onConfirm({ system: system.id, zone: zoneInSystem })}>Reproject &amp; import</button>
        <button type="button" className="mx-btn-secondary mx-btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
