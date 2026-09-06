import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// Locks in the two data-trust fixes from this project's M0/M2 pass:
//  - a real MGA easting/northing is caught and reprojected only after an
//    explicit zone confirmation, never silently misplaced as if it were
//    decimal degrees;
//  - a localStorage write failure (quota exceeded) surfaces a banner
//    instead of silently losing the user's last change.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
});

test('an MGA easting/northing CSV prompts for zone confirmation and reprojects correctly', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Add data"]').click();
  const mgaCsv = 'sample_id,lat,lng,au\nZ-TEST-1,7778000,445000,5.5\n';
  await page.locator('.mx-upload-zone input[type="file"]').setInputFiles({
    name: 'mga_chips.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(mgaCsv),
  });

  await expect(page.locator('.mx-zone-picker')).toHaveCount(1);
  await page.locator('.mx-zone-options button.active').click();
  await page.locator('button:has-text("Reproject & import")').click();

  await expect(page.locator('.mx-import-msg')).toContainText('Reprojected from MGA Zone 55');

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('.mx-data-filter').fill('Z-TEST-1');
  await page.locator('.mx-data-row').first().click();
  // Lands near North QLD (~-20.09, 146.47), not at some wild MGA-as-degrees location.
  await expect(page.locator('.mx-pop-coords').first()).toContainText('-20.09');
});

test('a localStorage write failure surfaces a save-failed banner with a working export', async ({ page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem = () => { throw new DOMException('QuotaExceededError'); };
  });

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill('146.30');
  await page.locator('.mx-field:has-text("Northing") input').fill('-20.10');
  await page.locator('button:has-text("Add sample")').last().click();

  await expect(page.locator('.mx-storage-banner.mx-import-err')).toContainText("didn't save");

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.mx-storage-banner-btn').first().click(),
  ]);
  expect(download).toBeTruthy();
});
