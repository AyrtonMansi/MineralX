import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// Real lab certificates report below-detection results as "<0.01" (or a
// legacy negative-number convention). Before this, such a cell was
// silently dropped by parseFloat — real assay data vanishing on import
// with no trace. This locks in that a below-detection result imports,
// displays as "<0.01 g/t Au" (not blank, not "pending"), and round-trips
// through export — plus that assay-interval data (previously not
// exportable at all) now has its own CSV export.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

test('a below-detection rock-chip result imports, displays correctly and survives export', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Add data"]').click();
  const csv = 'sample_id,lat,lng,au,ag\nBDL-RC-0001,-20.11,146.31,<0.01,12\n';
  await page.locator('.mx-upload-zone input[type="file"]').setInputFiles({
    name: 'bdl_chips.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('imported 1 sample');

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('.mx-data-filter').fill('BDL-RC-0001');
  const row = page.locator('.mx-data-row').first();
  // Reads as a below-detection Au result, not "pending" (it WAS tested).
  await expect(row.locator('.mx-data-value')).toContainText('<0.01');
  await expect(row.locator('.mx-data-value')).not.toContainText('pending');

  // Export CSV preserves the "<0.01" cell instead of leaving it blank.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export CSV")').click(),
  ]);
  const fs = await import('node:fs');
  const csvOut = fs.readFileSync(await download.path(), 'utf8');
  expect(csvOut).toMatch(/<0\.01/);
});

test('the map popup for a below-detection-only sample shows the result, not "awaiting assay"', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Add data"]').click();
  const csv = 'sample_id,lat,lng,au\nBDL-RC-0002,-20.12,146.32,<0.01\n';
  await page.locator('.mx-upload-zone input[type="file"]').setInputFiles({
    name: 'bdl_chip2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('imported 1 sample');

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('.mx-data-filter').fill('BDL-RC-0002');
  await page.locator('.mx-data-row').first().click();
  await expect(page.locator('.mx-pop-assay').first()).toContainText('<0.01');
  await expect(page.locator('.mx-pop-pending')).toHaveCount(0);
});

test('assay intervals export as their own CSV, separate from the collar list', async ({ page }) => {
  // The demo project already ships with drill intervals.
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Assay intervals CSV")').click(),
  ]);
  expect(download.suggestedFilename()).toBe('drill_assay_intervals.csv');
  const fs = await import('node:fs');
  const csv = fs.readFileSync(await download.path(), 'utf8');
  const header = csv.split('\n')[0];
  expect(header).toMatch(/^hole_id,from,to,width_m/);
  expect(csv).toContain('CT-DD-001');
});
