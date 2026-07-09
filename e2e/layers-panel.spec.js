import { test, expect } from '@playwright/test';
import { mockBasemap, mockElevationTiles, mockOccurrences, mockHistoricMines, waitForMapLoaded } from './helpers.js';

// Locks in the reorganized Layers panel: raw GeoResGlobe catalog data
// (organized by GeoResGlobe's own official themes) is separate from
// "Target Analysis", this app's own computed hydrology/correlation engine
// — and the one-fetch-then-cache guarantee that makes toggling any
// sub-layer free once the first analysis has run.

test('GeoResGlobe holds the theme taxonomy; Target Analysis is the computed engine only', async ({ page }) => {
  await mockBasemap(page);
  await mockElevationTiles(page);
  await mockOccurrences(page);
  await mockHistoricMines(page);

  await page.goto('/mineralx');
  await waitForMapLoaded(page);

  await page.locator('.mx-dock-btn[title="Layers"]').click();
  await expect(page.locator('.mx-tree-row-group:has-text("GeoResGlobe")')).toHaveCount(1);
  await expect(page.locator('.mx-tree-row-group:has-text("Target Analysis")')).toHaveCount(1);
  await expect(page.locator('.mx-tree-row-group').filter({ hasText: /^Occurrences$/ })).toHaveCount(0);

  await page.locator('.mx-tree-row:has-text("GeoResGlobe") .mx-tree-caret').click();
  for (const theme of ['Geology', 'Geophysics', 'Geochemistry', 'Groundwater', 'Mine Maps', 'Boreholes']) {
    await expect(page.locator(`.mx-tree-subheading:has-text("${theme}")`)).toHaveCount(1);
  }
  // Mineral Occurrences / Historic Mines are raw catalog data — they live
  // under GeoResGlobe, not under the computed-analysis group.
  await expect(page.locator('.mx-tree-subheading:has-text("Mineral Occurrences")')).toHaveCount(1);
  await expect(page.locator('.mx-tree-subheading:has-text("Historic Mines")')).toHaveCount(1);
});

test('toggling any sub-layer after the first analysis run never triggers another fetch', async ({ page }) => {
  await mockBasemap(page);
  await mockElevationTiles(page);
  const occurrenceHits = await mockOccurrences(page);
  const mineHits = await mockHistoricMines(page);

  await page.goto('/mineralx');
  await waitForMapLoaded(page);

  await page.locator('.mx-dock-btn[title="Layers"]').click();
  await page.locator('.mx-tree-row:has-text("Drainage channels") .mx-tree-eye').click();
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll('.mx-tree-row-group')].find((r) => r.textContent.includes('Target Analysis'));
    return row && (row.textContent.includes('targets') || row.textContent.includes('failed'));
  }, null, { timeout: 30_000 });

  expect(occurrenceHits()).toBe(1);
  expect(mineHits()).toBe(1);

  await page.locator('.mx-tree-row:has-text("GeoResGlobe") .mx-tree-caret').click();
  await page.locator('.mx-tree-row').filter({ hasText: /^Gold$/ }).locator('.mx-tree-eye').click();
  await page.locator('.mx-tree-row:has-text("Historic mine sites") .mx-tree-eye').click();
  await page.waitForTimeout(500);

  expect(occurrenceHits()).toBe(1); // unchanged — served from cache
  expect(mineHits()).toBe(1);
});
