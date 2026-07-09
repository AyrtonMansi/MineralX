import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded, getProjection } from './helpers.js';

// Regression coverage for two real bugs caught during the Leaflet ->
// MapLibre migration:
//  1. MapLibre v5's Map constructor silently ignores a top-level
//     `projection` option; globe must be declared in the style spec or
//     the map silently renders flat Mercator.
//  2. `.mx-map` lost a CSS specificity fight against maplibre-gl.css's
//     `.maplibregl-map { position: relative }`, collapsing the container
//     to height:0 and stranding MapLibre on its 300px fallback canvas.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
});

test('loads in globe projection with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/mineralx');
  await waitForMapLoaded(page);

  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
  expect(await getProjection(page)).toBe('globe');
  expect(errors).toEqual([]);
});

test('auto fly-in narrows from whole-globe zoom to the active project', async ({ page }) => {
  await page.goto('/mineralx');
  await waitForMapLoaded(page);

  await page.waitForFunction(() => window.__mxDebugMap.getZoom() > 10, null, { timeout: 20_000 });
  const center = await page.evaluate(() => {
    const c = window.__mxDebugMap.getCenter();
    return { lat: Number(c.lat.toFixed(1)), lng: Number(c.lng.toFixed(1)) };
  });
  // Demo project is Charters Towers, North QLD (~-20.07, 146.26).
  expect(center.lat).toBeCloseTo(-20.1, 0);
  expect(center.lng).toBeCloseTo(146.3, 0);
});

test('map fills its container at a phone viewport (responsiveness)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.waitForTimeout(500);

  const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
  expect(box.width).toBeCloseTo(390, 0);
  expect(box.height).toBeCloseTo(780, 0);
});

test('canvas tracks a viewport resize after load', async ({ page }) => {
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.waitForTimeout(500);

  await page.setViewportSize({ width: 500, height: 900 });
  await page.waitForTimeout(500);

  const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
  expect(box.width).toBeCloseTo(500, 0);
  expect(box.height).toBeCloseTo(900, 0);
});
