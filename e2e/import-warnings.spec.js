import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// A CSV import that's mostly good but has a few bad rows should still land
// the good rows and say so — not silently drop the bad ones with no
// feedback, and not fail the whole import over one malformed line. This
// locks in parseSampleCsv's `warnings` field actually reaching the user
// (it was computed by the store but dropped by three of four import call
// sites in ManageDrawer.jsx until this test was added).

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
});

test('a rock-chip CSV with one bad row imports the good rows and reports the skip', async ({ page }) => {
  const before = await page.locator('.mx-mgl-marker').count();

  // Row 2 is missing lat/lng entirely — parseSampleCsv should skip only
  // that row and surface it in `warnings`, not fail the whole import.
  const csv = 'sample_id,lat,lng,au\nW-TEST-1,-20.10,146.30,4.2\nW-TEST-2,,,\nW-TEST-3,-20.11,146.31,1.1\n';

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('button:has-text("Import CSV")').click();
  await page.locator('.mx-manage-form input[type="file"]').setInputFiles({
    name: 'chips_with_bad_row.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.locator('.mx-import-msg')).toContainText('Imported 2 samples');
  await expect(page.locator('.mx-import-msg')).toContainText('Skipped 1 row');
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before + 2);
});
