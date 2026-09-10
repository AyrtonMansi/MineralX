import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const serviceSource = readFileSync(new URL('../../lib/intelligence/service.ts', import.meta.url), 'utf8');
const componentSource = readFileSync(new URL('../../components/ops/Intelligence.tsx', import.meta.url), 'utf8');

test('native intake requires an explicit source area when more than one is authorised', () => {
  assert.match(componentSource, /allowedFamilies\.length === 1\s*\? allowedFamilies\[0\]/);
  assert.match(componentSource, /<option value="" disabled>Select a source area<\/option>/);
  assert.match(componentSource, /canChange && activeFamily/);
});

test('service intake creation rejects mixed source families after resolving stored records', () => {
  assert.match(serviceSource, /const sourceFamilies = new Set\(inspected\.map\(\(\{record\}\) => record\.family\)\)/);
  assert.match(serviceSource, /if \(sourceFamilies\.size !== 1\)/);
  assert.match(serviceSource, /Split mixed sources into separate intakes/);
});

test('intelligence detail reads cannot fall through to compact list rows', () => {
  assert.match(serviceSource, /export async function readIntelligence\(db: DatabaseClient, scopeId: string, intakeId: string\)/);
  assert.match(serviceSource, /return normalizeIntake\(await rawIntake\(db, scopeId, intakeId\)\)/);
  assert.doesNotMatch(serviceSource, /p_intake: intakeId \|\| null/);
});
