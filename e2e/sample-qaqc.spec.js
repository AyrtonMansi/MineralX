import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// Sample provenance & QAQC (sample type, QAQC type, duplicate-of, coord
// source) are the metadata a JORC Table 1 disclosure actually needs on
// top of the grade — this locks in the manual-add form, the Data-drawer
// badge that lets a manager audit QAQC coverage at a glance, and that the
// fields round-trip through CSV export/import.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

test('adding a field duplicate sample shows a QAQC badge and exports with its provenance fields', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();

  await page.locator('.mx-field:has-text("Sample type") select').selectOption('soil');
  await page.locator('.mx-field:has-text("Coordinate source") select').selectOption('dgps');
  await page.locator('.mx-field:has-text("Easting") input').fill('146.30');
  await page.locator('.mx-field:has-text("Northing") input').fill('-20.10');
  await page.locator('.mx-field:has-text("QAQC type") select').selectOption('duplicate');
  // Choosing "duplicate" reveals the original-sample-id field.
  await page.locator('.mx-field:has-text("Original sample ID") input').fill('CT-RC-0428');
  await page.locator('button:has-text("Add sample")').last().click();
  await page.waitForTimeout(500);

  // The Data drawer shows a QAQC badge so lab-quality coverage is visible
  // at a glance, and the non-default sample type is tagged too. The demo
  // project's own samples are all qaqcType 'none', so the row carrying a
  // badge at all is unambiguously the one just added.
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  const row = page.locator('.mx-data-row', { has: page.locator('.mx-data-qaqc-tag') });
  await expect(row.locator('.mx-data-qaqc-tag')).toHaveText('DUP');
  await expect(row.locator('.mx-data-type-tag')).toContainText('Soil');

  // Export CSV includes the provenance columns and this row's values.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Export CSV")').click(),
  ]);
  const path = await download.path();
  const fs = await import('node:fs');
  const csv = fs.readFileSync(path, 'utf8');
  const lines = csv.split('\n');
  expect(lines[0]).toMatch(/sample_type,qaqc_type,duplicate_of,coord_source/);
  // The new sample is the last row (demo samples were exported ahead of it).
  const newRow = lines[lines.length - 1] || lines[lines.length - 2];
  expect(newRow).toContain('soil');
  expect(newRow).toContain('duplicate');
  expect(newRow).toContain('CT-RC-0428');
  expect(newRow).toContain('dgps');
});

test('a CSV with QAQC columns imports correctly, including a common lab abbreviation', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Add data"]').click();
  const csv = 'sample_id,lat,lng,au,sample_type,qaqc_type,coord_source\n'
    + 'QC-RC-0001,-20.11,146.31,3.2,rock_chip,none,gps\n'
    + 'QC-RC-0002,-20.12,146.32,0.02,,std,survey\n'; // "std" lab abbreviation
  await page.locator('.mx-upload-zone input[type="file"]').setInputFiles({
    name: 'qaqc_chips.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('imported 2 samples');

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('.mx-data-filter').fill('QC-RC-0002');
  const row = page.locator('.mx-data-row').first();
  await expect(row.locator('.mx-data-qaqc-tag')).toHaveText('STD');
});
