import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = 'node_modules/maplibre-gl/dist';
const destination = 'public/maplibre';
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

test('the MapLibre v6 worker and its shared ESM dependency are self-hosted together', async () => {
  for (const file of files) {
    const [installed, mounted] = await Promise.all([
      readFile(`${source}/${file}`),
      readFile(`${destination}/${file}`),
    ]);
    assert.deepEqual(mounted, installed, `${file} must match the pinned MapLibre package`);
  }

  const worker = await readFile(`${destination}/maplibre-gl-worker.mjs`, 'utf8');
  assert.match(worker, /from["']\.\/maplibre-gl-shared\.mjs["']/);
});
