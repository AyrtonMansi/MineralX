// Unit tests for lib/geores-normalize.js — the fuzzy field-name detection
// (detectCommodity/detectMineType) and point-feature validation
// (normalizeOccurrenceFeature/normalizeHistoricMineFeature) shared by
// app/api/mineral-occurrences and app/api/historic-mines. These functions
// used to live inline in each route.js, unexported (and so untestable) by
// Next's route-export type checker — extracted here for the same reason
// geores-sources.js already exists outside app/api. The upstream ArcGIS
// schema's real field names are unverified (CLAUDE.md's "Data-source
// integrity" section), so this fuzziness is deliberate; these tests pin
// down what the fuzziness actually does rather than second-guessing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCommodity,
  detectMineType,
  normalizeOccurrenceFeature,
  normalizeHistoricMineFeature,
} from '../lib/geores-normalize.js';

test('detectCommodity: recognises a known field name regardless of case/punctuation', () => {
  assert.equal(detectCommodity({ COMMODITY: 'Gold' }), 'Gold');
  assert.equal(detectCommodity({ main_commodity: 'copper' }), 'Copper');
  assert.equal(detectCommodity({ 'Target-Commodity': 'Silver' }), 'Silver');
});

test('detectCommodity: falls back to scanning every string value when no known field name matches', () => {
  assert.equal(detectCommodity({ weird_field_name: 'Tin occurrence, minor' }), 'Tin');
});

test('detectCommodity: an unrecognised commodity or no properties at all is Unknown, never guessed', () => {
  assert.equal(detectCommodity({ commodity: 'Molybdenum' }), 'Unknown');
  assert.equal(detectCommodity({}), 'Unknown');
  assert.equal(detectCommodity(null), 'Unknown');
});

test('detectCommodity: single-letter symbol tokens only match as an isolated word, not inside another word', () => {
  // Tungsten's ' w ' token must not fire on "Now mining" or "raw material".
  assert.equal(detectCommodity({ commodity: 'Now mining, raw material' }), 'Unknown');
  assert.equal(detectCommodity({ commodity: 'W prospect' }), 'Tungsten');
});

test('detectMineType: recognises a known field name and trims whitespace', () => {
  assert.equal(detectMineType({ MINE_TYPE: '  Open cut  ' }), 'Open cut');
  assert.equal(detectMineType({ feature_type: 'Abandoned shaft' }), 'Abandoned shaft');
});

test('detectMineType: no known field or an empty value falls back to the generic label, never invented', () => {
  assert.equal(detectMineType({ unrelated: 'x' }), 'Historic mine');
  assert.equal(detectMineType({ type: '' }), 'Historic mine');
  assert.equal(detectMineType(null), 'Historic mine');
});

const point = (lng, lat, properties = {}) => ({
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties,
});

test('normalizeOccurrenceFeature: builds id/lat/lng/name/commodity from a well-formed point', () => {
  const f = normalizeOccurrenceFeature(point(146.26, -20.07, { OBJECTID: 42, NAME: 'Mount Example', commodity: 'Gold' }), 0);
  assert.deepEqual(f, { id: 42, lat: -20.07, lng: 146.26, name: 'Mount Example', commodity: 'Gold' });
});

test('normalizeOccurrenceFeature: falls back to a numbered name and synthetic id when neither is present', () => {
  const f = normalizeOccurrenceFeature(point(146.26, -20.07, {}), 3);
  assert.equal(f.name, 'Occurrence 4');
  assert.equal(f.id, 'f3');
});

test('normalizeOccurrenceFeature: a malformed feature (wrong geometry type, missing/non-numeric coords) is dropped, not passed through', () => {
  assert.equal(normalizeOccurrenceFeature({ geometry: { type: 'Polygon', coordinates: [] }, properties: {} }, 0), null);
  assert.equal(normalizeOccurrenceFeature({ geometry: null, properties: {} }, 0), null);
  assert.equal(normalizeOccurrenceFeature(point('not-a-number', -20, {}), 0), null);
});

test('normalizeHistoricMineFeature: builds id/lat/lng/name/mineType from a well-formed point', () => {
  const f = normalizeHistoricMineFeature(point(145.9, -19.5, { MINE_NAME: 'Old Reliable', minetype: 'Open cut' }), 0);
  assert.deepEqual(f, { id: 'f0', lat: -19.5, lng: 145.9, name: 'Old Reliable', mineType: 'Open cut' });
});
