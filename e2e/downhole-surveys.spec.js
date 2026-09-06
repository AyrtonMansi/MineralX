import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// A collar's own azimuth/dip is only the planned orientation — a real
// diamond/RC hole deviates with depth. Downhole survey shots (a
// depth-indexed azimuth/dip series from a gyro/EMS/single-shot tool) are
// the actual record of the hole's path, previously not capturable at all.
// This locks in import → display (collar sub-label + expandable survey
// table) → export, and that deleting a collar cleans up its surveys too.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

test('a downhole survey CSV imports, shows in the collar expansion, and exports', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('button:has-text("Surveys")').click();

  const csv = 'hole_id,depth,azimuth,dip\nCT-DD-001,50,91,-59\nCT-DD-001,150,88,-62\n';
  await page.locator('.mx-drop-area input[type="file"]').setInputFiles({
    name: 'ct_dd001_survey.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('Imported 2 survey shots');

  // Export from right here in the manager.
  const [download1] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Surveys CSV")').click(),
  ]);
  expect(download1.suggestedFilename()).toBe('drill_downhole_surveys.csv');

  await page.locator('.mx-manage-header .mx-close-btn').click();

  // The collar row shows the survey count, and expanding it lists the shots.
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  const row = page.locator('.mx-data-row', { hasText: 'CT-DD-001' });
  await expect(row).toContainText('2 survey shots');
  await row.click();
  await expect(page.locator('.mx-survey-table .mx-interval-row')).toHaveCount(2);
  await expect(page.locator('.mx-survey-table')).toContainText('91.0°');

  // Export from the Data drawer's Drill holes footer too.
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button:has-text("Surveys CSV")').click(),
  ]);
  const fs = await import('node:fs');
  const out = fs.readFileSync(await download2.path(), 'utf8');
  expect(out.split('\n')[0]).toBe('hole_id,depth,azimuth,dip');
  expect(out).toContain('CT-DD-001,50,91,-59');
});

test('a survey CSV for an unknown hole ID is rejected, not silently attached to the wrong hole', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('button:has-text("Surveys")').click();

  const csv = 'hole_id,depth,azimuth,dip\nNOT-A-REAL-HOLE,50,90,-60\n';
  await page.locator('.mx-drop-area input[type="file"]').setInputFiles({
    name: 'orphan_survey.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('No hole IDs in this file matched the project');
});

test('deleting a collar removes its survey shots too', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('button:has-text("Surveys")').click();
  const csv = 'hole_id,depth,azimuth,dip\nCT-DD-002,60,90,-55\n';
  await page.locator('.mx-drop-area input[type="file"]').setInputFiles({
    name: 'ct_dd002_survey.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.mx-import-msg')).toContainText('Imported 1 survey shot.');
  await page.locator('.mx-manage-header .mx-close-btn').click();

  // Opening the manager closed the Data drawer — reopen it to see the row.
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  page.on('dialog', (d) => d.accept());
  const row = page.locator('.mx-data-row', { hasText: 'CT-DD-002' });
  await row.hover();
  await row.locator('.mx-data-delete').click();
  await page.waitForTimeout(400);

  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('mx-store-v8')));
  const surveys = store.projects.flatMap((p) => p.surveys || []);
  expect(surveys.some((s) => s.holeId === 'CT-DD-002')).toBe(false);
});
