import { test, expect } from '@playwright/test';

// The /api/basemap proxy exists so MapLibre's WebGL raster path never has
// to deal with a cross-origin (CORS-less) Esri tile directly. But a proxy
// failure mode matters just as much as its happy path: MapLibre uploads
// every raster response straight into a WebGL texture, so an error-status
// response with a text body isn't decodable image data and used to crash
// the globe's render loop on every frame — the same failure class as the
// WMS-layer hardening in wms-resilience.spec.js, except hitting the
// basemap itself, which isn't optional. The fix: always return a real
// (blank) PNG with a 200, never an error status with a text body.

test('a bad tile path returns 400 (defensive only — not on the map\'s real request path)', async ({ request }) => {
  const res = await request.get('/api/basemap/not-a-style/1/2/3');
  expect(res.status()).toBe(400);
});

test('an unreachable upstream still returns a decodable image, not an error body', async ({ request }) => {
  // In this sandbox arcgisonline.com is genuinely unreachable, so this
  // exercises the real failure path without needing to mock anything.
  const res = await request.get('/api/basemap/satellite/3/3/3');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  const body = await res.body();
  // PNG signature — proves this is real image bytes, not a "upstream
  // unavailable" text message that would crash MapLibre's raster decoder.
  expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});
