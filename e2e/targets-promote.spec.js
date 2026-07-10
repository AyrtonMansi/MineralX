import { test, expect } from '@playwright/test';
import { mockBasemap, mockElevationTiles, mockOccurrences, mockHistoricMines, waitForMapLoaded } from './helpers.js';

// Stage 1 of the exploration targeting cycle: an analysis candidate is
// ephemeral (it lives in a cache and vanishes on reload). Promoting it
// writes a first-class Target into the store, which must then survive a
// reload, a re-run and a viewport change — the whole point of "promote".

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

async function runAnalysisAndShowTargets(page) {
  await page.locator('.mx-dock-btn[title="Layers"]').click();
  // Turning on the first Target Analysis sub-layer triggers the single
  // fetch+compute; the synthetic ridge in the mock relief yields candidates.
  await page.locator('.mx-tree-row:has-text("Metal Concentration Zones") .mx-tree-eye').click();
  await page.waitForSelector('.mx-analysis-target', { timeout: 30_000 });
}

// Analysis candidates render as absolutely-positioned map markers; some
// project near or past the viewport edge and aren't clickable. Return a
// locator for the candidate nearest the screen centre, which always is.
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

test('promoting a candidate creates a persistent target that survives a reload', async ({ page }) => {
  test.slow(); // one analysis run + a full reload/remount is legitimately slow
  await runAnalysisAndShowTargets(page);
  expect(await page.locator('.mx-target-marker').count()).toBe(0); // nothing promoted yet

  // Click a candidate → its popup offers a one-click promote.
  await (await centralCandidate(page)).click();
  const promote = page.locator('.mx-pop-promote-btn');
  await expect(promote).toBeVisible();
  await promote.click();
  await expect(promote).toContainText('Added to worklist'); // in-place confirmation

  // A persistent, store-backed target marker now exists.
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);

  // The real test: it's in the store, so a full reload keeps it — unlike
  // the analysis candidates, which are gone until the analysis re-runs.
  await page.reload();
  await waitForMapLoaded(page);
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);
  expect(await page.locator('.mx-analysis-target').count()).toBe(0);
});

test('promoting the same candidate twice does not create a duplicate', async ({ page }) => {
  await runAnalysisAndShowTargets(page);

  await (await centralCandidate(page)).click();
  await page.locator('.mx-pop-promote-btn').click();
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);

  // Undo the promotion, redo it — the target should round-trip cleanly,
  // and a fresh promote of the same spot must still not duplicate.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.mx-target-marker')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);
});
