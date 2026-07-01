'use client';
import { useState } from 'react';
import { LAYER_TYPES, PUBLIC_DATA_CATALOG } from './layer-data';
import { MxIcons } from './MineralXIcons';

export default function ManageDrawer({ node, onClose, catalog, onAddPublicLayer }) {
  if (!node) return null;

  return (
    <div className="mx-manage-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-manage-drawer mx-anim-rise">
        <div className="mx-manage-header">
          <div>
            <div className="mx-eyebrow">{typeLabel(node.type)}</div>
            <h2 className="mx-manage-title">{node.name}</h2>
          </div>
          <button type="button" className="mx-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="mx-manage-body">
          {node.type === LAYER_TYPES.PROJECT && <ProjectManager node={node} />}
          {node.type === LAYER_TYPES.ROCK_CHIPS && <RockChipManager node={node} />}
          {node.type === LAYER_TYPES.DRILL_HOLES && <DrillHoleManager node={node} />}
          {node.type === LAYER_TYPES.BOUNDARY && <BoundaryManager node={node} />}
          {node.type === LAYER_TYPES.BASEMAP && <BasemapManager catalog={catalog} onAddPublicLayer={onAddPublicLayer} />}
          {node.type === LAYER_TYPES.PUBLIC_GROUP && <PublicDataManager catalog={catalog} onAddPublicLayer={onAddPublicLayer} />}
        </div>
      </div>
    </div>
  );
}

function typeLabel(type) {
  const map = {
    [LAYER_TYPES.PROJECT]: 'PROJECT SETTINGS',
    [LAYER_TYPES.ROCK_CHIPS]: 'ROCK CHIP MANAGER',
    [LAYER_TYPES.DRILL_HOLES]: 'DRILL HOLE MANAGER',
    [LAYER_TYPES.BOUNDARY]: 'BOUNDARY MANAGER',
    [LAYER_TYPES.BASEMAP]: 'BASEMAP & PUBLIC DATA',
    [LAYER_TYPES.PUBLIC_GROUP]: 'PUBLIC DATA CATALOG',
  };
  return map[type] || 'MANAGE';
}

// ── Project settings ───────────────────────────────────────────────────
function ProjectManager({ node }) {
  return (
    <div className="mx-manage-sections">
      <ManageField label="Project name" value={node.name} />
      <ManageField label="Tenement ID" value="E45/1234" />
      <ManageField label="Datum" value="GDA2020 Zone 52" />
      <ManageField label="Team" value="Field team Alpha" />
      <ManageField label="Boundary source" value="Uploaded KML" />
      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm">{MxIcons.download} Export all data</button>
        <button type="button" className="mx-btn-danger mx-btn-sm">{MxIcons.trash} Delete project</button>
      </div>
    </div>
  );
}

// ── Rock chip manager ──────────────────────────────────────────────────
function RockChipManager({ node }) {
  const [tab, setTab] = useState('add');

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-tabs">
        <button type="button" className={`mx-manage-tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>Add sample</button>
        <button type="button" className={`mx-manage-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>Import CSV</button>
        <button type="button" className={`mx-manage-tab ${tab === 'scheme' ? 'active' : ''}`} onClick={() => setTab('scheme')}>ID scheme</button>
      </div>

      {tab === 'add' && (
        <div className="mx-manage-form">
          <ManageField label="Sample ID" value="" placeholder="Auto: TN-RC-0448" />
          <ManageField label="Lithology" value="" placeholder="e.g. Quartz vein float" />
          <div className="mx-manage-row-2">
            <ManageField label="Easting" value="" placeholder="129.7402" />
            <ManageField label="Northing" value="" placeholder="-20.5468" />
          </div>
          <ManageField label="Elevation (m)" value="" placeholder="498" />
          <ManageField label="Alteration" value="" placeholder="Qz-sericite" />
          <ManageField label="Notes" value="" placeholder="Surface float, quartz reef" multiline />
          <button type="button" className="mx-btn-primary mx-btn-full">Add sample</button>
        </div>
      )}

      {tab === 'import' && (
        <div className="mx-manage-form">
          <div className="mx-drop-area mx-drop-area-sm">
            <div className="mx-drop-icon">&#8593;</div>
            <div className="mx-drop-text">Drop CSV or <span className="mx-drop-browse">browse</span></div>
            <div className="mx-drop-hint">Headers auto-mapped to fields</div>
          </div>
          <div className="mx-column-map">
            <div className="mx-section-label">COLUMN MAPPING</div>
            <ColumnMapRow from="sample_id" to="Sample ID" />
            <ColumnMapRow from="easting" to="Easting" />
            <ColumnMapRow from="northing" to="Northing" />
            <ColumnMapRow from="lith" to="Lithology" />
            <ColumnMapRow from="au_ppm" to="Au (g/t)" />
          </div>
          <button type="button" className="mx-btn-primary mx-btn-full">Import rows</button>
        </div>
      )}

      {tab === 'scheme' && (
        <div className="mx-manage-form">
          <ManageField label="Prefix" value="TN-RC-" />
          <ManageField label="Next number" value="0448" />
          <ManageField label="Padding" value="4 digits" />
          <p className="mx-scheme-preview">Next ID: <strong>TN-RC-0448</strong></p>
        </div>
      )}

      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm">{MxIcons.download} Export CSV</button>
        <span className="mx-manage-count">{node.count || 0} samples</span>
      </div>
    </div>
  );
}

// ── Drill hole manager ─────────────────────────────────────────────────
function DrillHoleManager({ node }) {
  const [tab, setTab] = useState('collar');

  return (
    <div className="mx-manage-sections">
      <div className="mx-manage-tabs">
        <button type="button" className={`mx-manage-tab ${tab === 'collar' ? 'active' : ''}`} onClick={() => setTab('collar')}>Add collar</button>
        <button type="button" className={`mx-manage-tab ${tab === 'survey' ? 'active' : ''}`} onClick={() => setTab('survey')}>Import survey</button>
        <button type="button" className={`mx-manage-tab ${tab === 'intervals' ? 'active' : ''}`} onClick={() => setTab('intervals')}>Intervals</button>
      </div>

      {tab === 'collar' && (
        <div className="mx-manage-form">
          <ManageField label="Hole ID" value="" placeholder="Auto: TNDD-007" />
          <div className="mx-manage-row-2">
            <ManageField label="Easting" value="" placeholder="129.7440" />
            <ManageField label="Northing" value="" placeholder="-20.5489" />
          </div>
          <div className="mx-manage-row-2">
            <ManageField label="Azimuth (°)" value="" placeholder="90" />
            <ManageField label="Dip (°)" value="" placeholder="-60" />
          </div>
          <ManageField label="Planned depth (m)" value="" placeholder="300" />
          <button type="button" className="mx-btn-primary mx-btn-full">Add collar</button>
        </div>
      )}

      {tab === 'survey' && (
        <div className="mx-manage-form">
          <div className="mx-drop-area mx-drop-area-sm">
            <div className="mx-drop-icon">&#8593;</div>
            <div className="mx-drop-text">Drop downhole survey CSV</div>
            <div className="mx-drop-hint">depth, azimuth, dip columns</div>
          </div>
          <button type="button" className="mx-btn-primary mx-btn-full">Import survey</button>
        </div>
      )}

      {tab === 'intervals' && (
        <div className="mx-manage-form">
          <div className="mx-drop-area mx-drop-area-sm">
            <div className="mx-drop-icon">&#8593;</div>
            <div className="mx-drop-text">Drop interval-assay CSV</div>
            <div className="mx-drop-hint">from, to, Au, Cu columns</div>
          </div>
          <button type="button" className="mx-btn-primary mx-btn-full">Import intervals</button>
        </div>
      )}

      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm">{MxIcons.download} Export all</button>
        <span className="mx-manage-count">{node.count || 0} holes</span>
      </div>
    </div>
  );
}

// ── Boundary manager ───────────────────────────────────────────────────
function BoundaryManager({ node }) {
  return (
    <div className="mx-manage-sections">
      <ManageField label="Boundary name" value={node.name} />
      <ManageField label="Source" value="Uploaded KML" />
      <ManageField label="Area" value="~2.4 km²" readOnly />
      <div className="mx-manage-form">
        <div className="mx-drop-area mx-drop-area-sm">
          <div className="mx-drop-icon">&#8593;</div>
          <div className="mx-drop-text">Replace KML / re-upload</div>
          <div className="mx-drop-hint">KML · KMZ · GeoJSON · Shapefile</div>
        </div>
      </div>
      <div className="mx-manage-actions">
        <button type="button" className="mx-btn-secondary mx-btn-sm">Set as active area</button>
        <button type="button" className="mx-btn-secondary mx-btn-sm">{MxIcons.download} Export KML</button>
      </div>
    </div>
  );
}

// ── Basemap / public data manager ──────────────────────────────────────
function BasemapManager({ catalog, onAddPublicLayer }) {
  return <PublicDataManager catalog={catalog} onAddPublicLayer={onAddPublicLayer} />;
}

function PublicDataManager({ catalog, onAddPublicLayer }) {
  const [customUrl, setCustomUrl] = useState('');

  return (
    <div className="mx-manage-sections">
      <p className="mx-manage-hint">Toggle public reference layers. Read-only overlays with attribution.</p>
      {catalog.map(group => (
        <div key={group.id} className="mx-public-group">
          <div className="mx-section-label">{group.group.toUpperCase()}</div>
          {group.layers.map(layer => (
            <div key={layer.id} className="mx-public-layer-row">
              <div className="mx-public-dot" />
              <div className="mx-public-info">
                <div className="mx-public-name">{layer.name}</div>
                <div className="mx-public-attr">{layer.attribution}</div>
              </div>
              <span className="mx-public-type">{layer.type.toUpperCase()}</span>
              <button type="button" className="mx-btn-tiny" onClick={() => onAddPublicLayer({ id: `custom-${Date.now()}`, name: layer.name, color: '#95A5A6', attribution: layer.attribution, wmsUrl: layer.url, wmsType: layer.type })}>Add</button>
            </div>
          ))}
        </div>
      ))}
      <div className="mx-custom-wms">
        <div className="mx-section-label">CUSTOM WMS/WMTS</div>
        <p className="mx-manage-hint">Paste any WMS URL to add as a layer.</p>
        <div className="mx-custom-wms-row">
          <input
            type="text"
            className="mx-input"
            placeholder="https://example.com/wms?..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
          />
          <button
            type="button"
            className="mx-btn-primary mx-btn-sm"
            onClick={() => {
              if (!customUrl.trim()) return;
              onAddPublicLayer({ id: `custom-${Date.now()}`, name: 'Custom WMS layer', color: '#7F8C8D', attribution: 'Custom', wmsUrl: customUrl, wmsType: 'wms' });
              setCustomUrl('');
            }}
          >Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Shared form components ─────────────────────────────────────────────
function ManageField({ label, value, placeholder, readOnly, multiline }) {
  return (
    <div className="mx-field">
      <label className="mx-field-label">{label}</label>
      {multiline ? (
        <textarea className="mx-input mx-textarea" defaultValue={value} placeholder={placeholder} readOnly={readOnly} rows={3} />
      ) : (
        <input type="text" className="mx-input" defaultValue={value} placeholder={placeholder} readOnly={readOnly} />
      )}
    </div>
  );
}

function ColumnMapRow({ from, to }) {
  return (
    <div className="mx-col-map-row">
      <span className="mx-col-from">{from}</span>
      <span className="mx-col-arrow">&#8594;</span>
      <span className="mx-col-to">{to}</span>
    </div>
  );
}
