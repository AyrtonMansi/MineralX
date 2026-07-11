import { test, expect } from '@playwright/test';
import { mockBasemap, mockElevationTiles, mockOccurrences, mockHistoricMines, waitForMapLoaded } from './helpers.js';

// Stage 2 of the exploration targeting cycle: the promoted targets form a
// ranked worklist with a status pipeline, and a dismissed target is
// remembered so a re-run never resurfaces a spot the geologist already
// walked off.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await mockElevationTiles(page);
  await mockOccurrences(page);
  await mockHistoricMines(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

async function centralCandidate(page) {
  const idx = await page.evaluate(() => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let best = -1, bestD = Infinity;
    document.querySelectorAll('.mx-analysis-target').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight && d < bestD) {
        bestD = d; best = i;
      }
    });
    return best;
  });
  return page.locator('.mx-analysis-target').nth(idx);
}

async function promoteOne(page) {
  await page.locator('.mx-dock-btn[title="Layers"]').click();
  await page.locator('.mx-tree-row:has-text("Metal Concentration Zones") .mx-tree-eye').click();
  await page.waitForSelector('.mx-analysis-target', { timeout: 30_000 });
  await (await centralCandidate(page)).click();
  await page.locator('.mx-pop-promote-btn').click();
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);
}

test('the Targets worklist lists a promoted target and its status persists across reload', async ({ page }) => {
  test.slow();
  await promoteOne(page);

  await page.locator('.mx-dock-btn[title="Targets"]').click();
  const row = page.locator('.mx-data-list .mx-data-row').first();
  await expect(row).toBeVisible();
  await expect(row.locator('.mx-target-status')).toHaveValue('proposed');

  // Advance it along the pipeline.
  await row.locator('.mx-target-status').selectOption('planned');

  await page.reload();
  await waitForMapLoaded(page);
  await page.locator('.mx-dock-btn[title="Targets"]').click();
  await expect(page.locator('.mx-data-list .mx-data-row').first().locator('.mx-target-status')).toHaveValue('planned');
});

test('dismissing a target removes it and remembers the spot so it will not resurface', async ({ page }) => {
  test.slow();
  await promoteOne(page);

  await page.locator('.mx-dock-btn[title="Targets"]').click();
  page.on('dialog', (d) => d.accept());
  await page.locator('.mx-data-list .mx-data-row').first().locator('.mx-data-delete').click();

  // Gone from the worklist and the map.
  await expect(page.locator('.mx-data-list .mx-data-row')).toHaveCount(0);
  await expect(page.locator('.mx-target-marker')).toHaveCount(0);

  // The rejection is durable: its location is recorded in dismissedTargets,
  // which is what the re-run filter consults to keep it from coming back.
  const dismissedCount = await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('mx-store-v5'));
    return store.projects.reduce((n, p) => n + (p.dismissedTargets || []).length, 0);
  });
  expect(dismissedCount).toBe(1);
});
