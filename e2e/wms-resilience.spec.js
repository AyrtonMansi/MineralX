import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded, getProjection } from './helpers.js';

// A network-failing WMS raster (a wrong/guessed GEORES endpoint, or one
// that's simply unreachable) used to throw inside MapLibre's globe render
// loop on every frame ("Cannot read properties of undefined (reading
// 'bind')") because Leaflet's <img> tiles degrade silently but MapLibre's
// WebGL raster path does not. The fix tears a failed source out of the
// style and badges it "unavailable" instead of leaving it in the style to
// keep crashing.

test('a WMS layer that fails at the network level does not crash the globe', async ({ page }) => {
  await mockBasemap(page);
  let wmsHits = 0;
  await page.route('**/gisservices.information.qld.gov.au/**', (route) => {
    wmsHits++;
    route.abort('failed');
  });
  const rasterCrashes = [];
  page.on('pageerror', (e) => {
    if (/reading 'bind'/.test(e.message)) rasterCrashes.push(e.message);
  });

  await page.goto('/mineralx');
  await waitForMapLoaded(page);

  await page.locator('.mx-dock-btn[title="Layers"]').click();
  await page.locator('.mx-tree-row:has-text("GeoResGlobe") .mx-tree-caret').click();
  await page.locator('.mx-tree-row:has-text("Surface geology") .mx-tree-eye').click();
  await page.waitForTimeout(2500); // let the render loop crash if it's going to

  expect(wmsHits).toBeGreaterThan(0);
  await expect(page.locator('.mx-tree-row:has-text("Surface geology") .mx-tree-error')).toHaveCount(1);
  expect(rasterCrashes).toEqual([]);
  expect(await getProjection(page)).toBe('globe'); // map is still alive and responsive

  // Toggling the layer off clears the badge, so off -> on is a real retry
  // path rather than a permanent lock-out.
  await page.locator('.mx-tree-row:has-text("Surface geology") .mx-tree-eye').click();
  await expect(page.locator('.mx-tree-row:has-text("Surface geology") .mx-tree-error')).toHaveCount(0);
});
