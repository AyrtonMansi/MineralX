import test from 'node:test';
import assert from 'node:assert/strict';
import { elementsInStore } from '../components/mineralx/project-store.js';
test('over-range-only elements remain selectable for surface and drill samples', () => {
  const actual = elementsInStore({ projects: [{
    samples: [{ lowerLimits: { Cu: 10 } }],
    intervals: [{ lowerLimits: { Zn: 5 } }],
  }] });
  assert.ok(actual.includes('Cu'), 'Surface over-range element was hidden');
  assert.ok(actual.includes('Zn'), 'Downhole over-range element was hidden');
  assert.equal(actual.filter(element => element === 'Au').length, 1);
});
