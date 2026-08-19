import { test, expect } from '@playwright/test';
import { mockBasemap, mockElevationTiles, mockOccurrences, mockHistoricMines, waitForMapLoaded } from './helpers.js';

// Stage 3 of the exploration cycle: Task & Engage. A sample taken near a
// target auto-links to it and advances it to 'sampled' (the app does the
// bookkeeping), the geologist can unlink, and the worklist exports to a
// handheld GPS as ordered waypoints.

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
    const store = JSON.parse(localStorage.getItem('mx-store-v8'));
    const t = store.projects.flatMap((p) => p.targets || [])[0];
    return { lat: t.lat, lng: t.lng };
  });
}

test('a sample taken near a target auto-links and advances it to sampled; unlink detaches it', async ({ page }) => {
  test.slow();
  const t = await promoteOne(page);

  // Add a rock chip ~33 m north of the target — inside the 100 m radius.
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill(String(t.lng));
  await page.locator('.mx-field:has-text("Northing") input').fill(String(t.lat + 0.0003));
  await page.locator('button:has-text("Add sample")').last().click();

  // The target now reads as sampled with one linked chip — no manual step.
  await page.locator('.mx-dock-btn[title="Targets"]').click();
  const row = page.locator('.mx-data-list .mx-data-row').first();
  await expect(row.locator('.mx-target-status')).toHaveValue('sampled');
  await expect(row).toContainText('1 linked sample');

  // Expand and unlink — the human override on the machine's bookkeeping.
  await row.click();
  await page.locator('.mx-target-unlink').click();
  await expect(page.locator('.mx-data-list .mx-data-row').first()).not.toContainText('linked sample');
});

test('a sample far from every target does not link to any of them', async ({ page }) => {
  test.slow();
  const t = await promoteOne(page);

  // ~1.1 km south — well outside the link radius.
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill(String(t.lng));
  await page.locator('.mx-field:has-text("Northing") input').fill(String(t.lat - 0.01));
  await page.locator('button:has-text("Add sample")').last().click();

  await page.locator('.mx-dock-btn[title="Targets"]').click();
  const row = page.locator('.mx-data-list .mx-data-row').first();
  await expect(row.locator('.mx-target-status')).toHaveValue('proposed'); // unchanged
  await expect(row).not.toContainText('linked sample');
});

test('exporting field waypoints downloads a GPX file', async ({ page }) => {
  test.slow();
  await promoteOne(page);
  await page.locator('.mx-dock-btn[title="Targets"]').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export field waypoints")').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
});
