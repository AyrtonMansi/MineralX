import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// The assay-interval table only ever carried lab grades for a from-to; it
// was never a substitute for the geologist's own logging of what's in the
// core/chip tray — lithology, alteration, structure. This locks in
// import → display (collar sub-label + expandable geology table) → export,
// and that deleting a collar cleans up its logged intervals too.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

test('a geological log CSV imports, shows in the collar expansion, and exports', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('button:has-text("Geology")').click();

  const csv = 'hole_id,from,to,lithology,alteration,structure,notes\n'
    + 'CT-DD-001,100,110,Quartz vein,Silicification,Sheared contact,Coarse sulphides\n'
    + 'CT-DD-001,110,125,Sheared granodiorite,Sericite-chlorite,,\n';
  await page.locator('.mx-drop-area input[type="file"]').setInputFiles({
    name: 'ct_dd001_geology.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('Imported 2 logged intervals');

  // Export from right here in the manager.
  const [download1] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Geology CSV")').click(),
  ]);
  expect(download1.suggestedFilename()).toBe('drill_geological_log.csv');

  await page.locator('.mx-manage-header .mx-close-btn').click();

  // The collar row shows the logged-interval count, and expanding it lists them.
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  const row = page.locator('.mx-data-row', { hasText: 'CT-DD-001' });
  await expect(row).toContainText('2 logged');
  await row.click();
  await expect(page.locator('.mx-geology-table .mx-interval-row')).toHaveCount(2);
  await expect(page.locator('.mx-geology-table')).toContainText('Quartz vein');
  await expect(page.locator('.mx-geology-table')).toContainText('Silicification');

  // Export from the Data drawer's Drill holes footer too.
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Geology CSV")').click(),
  ]);
  const fs = await import('node:fs');
  const out = fs.readFileSync(await download2.path(), 'utf8');
  expect(out.split('\n')[0]).toBe('hole_id,from,to,lithology,alteration,structure,notes');
  expect(out).toContain('CT-DD-001,100,110,Quartz vein,Silicification,Sheared contact,Coarse sulphides');
});

test('a geology CSV for an unknown hole ID is rejected, not silently attached to the wrong hole', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('button:has-text("Geology")').click();

  const csv = 'hole_id,from,to,lithology\nNOT-A-REAL-HOLE,10,20,Granite\n';
  await page.locator('.mx-drop-area input[type="file"]').setInputFiles({
    name: 'orphan_geology.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('No hole IDs in this file matched the project');
});

test('deleting a collar removes its logged intervals too', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('button:has-text("Geology")').click();
  const csv = 'hole_id,from,to,lithology\nCT-DD-002,40,50,Siltstone\n';
  await page.locator('.mx-drop-area input[type="file"]').setInputFiles({
    name: 'ct_dd002_geology.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('Imported 1 logged interval.');
  await page.locator('.mx-manage-header .mx-close-btn').click();

  // Opening the manager closed the Data drawer — reopen it to see the row.
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  page.on('dialog', (d) => d.accept());
  const row = page.locator('.mx-data-row', { hasText: 'CT-DD-002' });
  await row.hover();
  await row.locator('.mx-data-delete').click();
  await page.waitForTimeout(400);

  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('mx-store-v7')));
  const geology = store.projects.flatMap((p) => p.geology || []);
  expect(geology.some((g) => g.holeId === 'CT-DD-002')).toBe(false);
});
