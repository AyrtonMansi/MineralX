import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// The workspace runs programs in more than one country, so projected-
// coordinate import can't be limited to Queensland MGA zones. A non-
// Australian UTM file must import correctly once the geologist confirms
// its coordinate system — and, as ever, never be reprojected on a guess.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
});

test('a Ghana UTM rock-chip file prompts for its CRS and reprojects into West Africa', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Add data"]').click();
  // Ashanti-belt rock chips in WGS84 UTM zone 30N metres.
  const csv = 'sample_id,lat,lng,au\nGH-RC-1,740000,650000,5.5\nGH-RC-2,741200,651000,1.2\n';
  await page.locator('.mx-upload-zone input[type="file"]').setInputFiles({
    name: 'ghana_chips.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });

  // The picker appears — nothing imported yet (no silent guess).
  await expect(page.locator('.mx-zone-picker')).toHaveCount(1);

  // Choose the correct system + zone: UTM northern hemisphere, zone 30.
  await page.locator('.mx-zone-systems button', { hasText: 'Northern' }).click();
  await page.locator('.mx-zone-number').selectOption('30');
  await page.locator('button:has-text("Reproject & import")').click();

  await expect(page.locator('.mx-import-msg')).toContainText('Reprojected from UTM Zone 30N');

  // The chip landed in West Africa (~6.7N, 1.6W), not misplaced as degrees.
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('.mx-data-filter').fill('GH-RC-1');
  await page.locator('.mx-data-row').first().click();
  await expect(page.locator('.mx-pop-coords').first()).toContainText('6.');
});
