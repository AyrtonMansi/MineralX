// MapLibre GL JS v6 ships an ESM worker that Next cannot reliably bundle as a
// worker URL. Keep the pinned worker and its relative shared-module import
// together under /public, then configure every client map before it is made.
import { copyFile, mkdir } from 'node:fs/promises';

const source = 'node_modules/maplibre-gl/dist';
const destination = 'public/maplibre';
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

await mkdir(destination, { recursive: true });
await Promise.all(files.map(file => copyFile(`${source}/${file}`, `${destination}/${file}`)));
