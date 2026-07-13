import { test, expect } from '@playwright/test';
import { mockBasemap, mockElevationTiles, mockOccurrences, mockHistoricMines, waitForMapLoaded } from './helpers.js';

// Stage 4 of the exploration cycle: Assess. A linked sample's assay is put
// next to the target's predicted evidence, the geologist marks it
// confirmed or barren in one click, and the program's own hit-rate — real
// calibration of the terrain model — appears in the Layers panel.

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
  return page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('mx-store-v7'));
    const t = store.projects.flatMap((p) => p.targets || [])[0];
    return { lat: t.lat, lng: t.lng };
  });
}

async function addLinkedSampleWithGrade(page, t, auValue) {
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill(String(t.lng));
  await page.locator('.mx-field:has-text("Northing") input').fill(String(t.lat + 0.0003));
  await page.locator('.mx-assay-val').first().fill(String(auValue));
  await page.locator('button:has-text("Add sample")').last().click();
}

test('assessing a target as confirmed feeds the model hit-rate in the Layers panel', async ({ page }) => {
  test.slow();
  const t = await promoteOne(page);
  await addLinkedSampleWithGrade(page, t, 6.5); // high-grade Au on the linked chip

  // Open the target, see predicted-vs-actual, mark it confirmed.
  await page.locator('.mx-dock-btn[title="Targets"]').click();
  const row = page.locator('.mx-data-list .mx-data-row').first();
  await row.click();
  await expect(page.locator('.mx-target-assess-val')).toContainText('6.5 g/t Au');
  await page.locator('.mx-assess-btn', { hasText: 'Confirmed' }).click();
  await expect(page.locator('.mx-data-list .mx-data-row').first().locator('.mx-target-status')).toHaveValue('confirmed');

  // The Layers panel (still open from the analysis run) now shows the
  // hit-rate in the Target Analysis group — real calibration from the
  // program's own result, not a seeded number.
  await page.locator('.mx-data-drawer-wrap .mx-close-btn').click(); // reveal the panel behind
  await expect(page.locator('.mx-hitrate')).toContainText('1 target assessed');
  await expect(page.locator('.mx-hitrate')).toContainText('1 confirmed');

  // Director view: the program overview surfaces the targeting program on
  // the first screen — a targets stat and the hit-rate headline — so it
  // isn't buried in a drawer.
  await page.locator('.mx-dock-btn[title="Program"]').click();
  await expect(page.locator('.mx-stat-targets')).toHaveText('1');
  await expect(page.locator('.mx-home-targets')).toContainText('1/1');

  // Director export: "Export all program data" now includes the target
  // worklist, not just chips/collars/boundary — the program is the
  // worklist, and a report export that dropped it would be incomplete.
  const files = [];
  page.on('download', (d) => files.push(d.suggestedFilename()));
  await page.locator('.mx-panel-header .mx-close-btn').click();
  await page.locator('.mx-avatar').click();
  await page.locator('.mx-user-item', { hasText: 'Export all program data' }).click();
  await page.waitForTimeout(1000);
  expect(files.some((f) => /targets\.csv$/.test(f))).toBe(true);
});

test('the assess buttons only appear once a linked sample has been assayed', async ({ page }) => {
  test.slow();
  const t = await promoteOne(page);

  // Link a sample but leave it awaiting assay (no grade entered).
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill(String(t.lng));
  await page.locator('.mx-field:has-text("Northing") input').fill(String(t.lat + 0.0003));
  await page.locator('button:has-text("Add sample")').last().click();

  await page.locator('.mx-dock-btn[title="Targets"]').click();
  await page.locator('.mx-data-list .mx-data-row').first().click();
  await expect(page.locator('.mx-target-assess-pending')).toBeVisible();
  await expect(page.locator('.mx-assess-btn')).toHaveCount(0); // nothing to assess against yet
});
