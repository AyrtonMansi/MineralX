#!/usr/bin/env node
// Verifies every guessed GEORES/GA endpoint this app depends on against
// the real, live services. This CANNOT be run from the sandbox this app
// was originally built in (outbound to *.qld.gov.au, arcgisonline.com,
// services.ga.gov.au, and even *.vercel.app is blocked there) — run it
// from anywhere with normal internet access: your own machine, or CI
// (see .github/workflows/verify-endpoints.yml, which runs this weekly
// since these are third-party services that can change without notice).
//
// Reuses the exact CANDIDATES arrays the live API routes import from —
// and the exact PUBLIC_DATA_CATALOG the Layers panel renders — so there
// is no separate list to drift out of sync with what's actually deployed.
//
// Usage: node scripts/verify-endpoints.mjs

import { PUBLIC_DATA_CATALOG } from '../components/mineralx/layer-data.js';
import {
  MINERAL_OCCURRENCE_CANDIDATES as OCCURRENCE_CANDIDATES,
  HISTORIC_MINE_CANDIDATES,
} from '../lib/geores-sources.js';

// Charters Towers, the demo project's area — real QLD ground, so a
// correct layer should return something (or at least a valid, non-error
// response) here.
const BBOX_4326 = '145.9,-20.4,146.6,-19.7'; // w,s,e,n

async function checkWms(layer) {
  const capsUrl = `${layer.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`;
  try {
    const res = await fetch(capsUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const text = await res.text();
    if (!/<(WMT_MS_Capabilities|WMS_Capabilities)/.test(text)) {
      return { ok: false, detail: 'response is not WMS capabilities XML (wrong path, or an HTML error page)' };
    }
    const layerNames = [...text.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    const requestedIndex = Number(layer.wmsLayers);
    const indexLooksValid = layerNames.length === 0 || Number.isNaN(requestedIndex) || layerNames.length > requestedIndex;
    return {
      ok: true,
      detail: `service reachable, ${layerNames.length} layer(s) advertised${
        indexLooksValid ? '' : ` — WARNING: configured index ${layer.wmsLayers} looks out of range`
      }`,
    };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

async function checkVectorCandidate(candidate) {
  try {
    const res = await fetch(candidate.url(BBOX_4326), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.error) return { ok: false, detail: `service returned an error: ${JSON.stringify(data.error)}` };
    if (!Array.isArray(data.features)) return { ok: false, detail: 'response has no features array (wrong path/layer index)' };
    return { ok: true, detail: `${data.features.length} feature(s) in the Charters Towers bbox` };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

async function main() {
  const results = [];

  console.log('Checking WMS layers (Layers panel / GeoResGlobe catalog)...\n');
  for (const group of PUBLIC_DATA_CATALOG) {
    for (const layer of group.layers) {
      const r = await checkWms(layer);
      results.push({ kind: 'WMS', name: layer.name, source: layer.url, ...r });
      console.log(`${r.ok ? '✓' : '✗'} ${layer.name} — ${r.detail}`);
    }
  }

  console.log('\nChecking mineral-occurrences candidates...\n');
  for (const c of OCCURRENCE_CANDIDATES) {
    const r = await checkVectorCandidate(c);
    results.push({ kind: 'vector', name: `mineral-occurrences: ${c.source}`, ...r });
    console.log(`${r.ok ? '✓' : '✗'} ${c.source} — ${r.detail}`);
  }

  console.log('\nChecking historic-mines candidates...\n');
  for (const c of HISTORIC_MINE_CANDIDATES) {
    const r = await checkVectorCandidate(c);
    results.push({ kind: 'vector', name: `historic-mines: ${c.source}`, ...r });
    console.log(`${r.ok ? '✓' : '✗'} ${c.source} — ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} endpoints OK.`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  - [${f.kind}] ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
}

main();
