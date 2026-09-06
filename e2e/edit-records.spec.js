import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// Editing an already-recorded sample/collar — a typo'd lithology, a
// re-picked coordinate, a wrong assay value — previously had no path
// except delete-and-re-add, which loses the sample's id (and everything
// that referenced it: target links, detection limits, photo) and its
// place in the undo history. This locks in the edit-in-place flow added
// to the Data drawer: a pencil icon on each row opens the same manager
// form pre-filled, with the id locked, and writes a patch instead of
// appending a new record.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

test('editing an existing sample updates its fields in place, keeps its id, and survives a reload', async ({ page }) => {
  test.slow(); // add + edit + re-verify + reload, like the other reload-involving specs
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Lithology") input').fill('Test edit lithology alpha');
  await page.locator('.mx-field:has-text("Easting") input').fill('146.30');
  await page.locator('.mx-field:has-text("Northing") input').fill('-20.10');
  await page.locator('.mx-assay-row').first().locator('.mx-assay-val').fill('1.2');
  await page.locator('button:has-text("Add sample")').last().click();
  await page.waitForTimeout(500);

  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  const row = page.locator('.mx-data-row', { hasText: 'Test edit lithology alpha' });
  await expect(row).toHaveCount(1);
  const sampleId = await row.locator('.mx-data-id').first().innerText();

  // Open the edit form via the row's pencil icon.
  await row.locator('.mx-data-edit').click();

  // The id field is present but locked — the whole point is that editing
  // never renames a sample out from under its own references.
  const idField = page.locator('.mx-field:has-text("Sample ID") input');
  await expect(idField).toHaveAttribute('readonly', '');
  await expect(idField).toHaveValue(sampleId.trim());

  // Import CSV tab must not exist while editing — it doesn't fit a
  // single-row correction, and its absence is itself the "am I in edit
  // mode" signal this test leans on next.
  await expect(page.locator('.mx-manage-tab:has-text("Import CSV")')).toHaveCount(0);

  await page.locator('.mx-field:has-text("Lithology") input').fill('Silicified breccia');
  await page.locator('.mx-assay-row').first().locator('.mx-assay-val').fill('<0.01');
  await page.locator('button:has-text("Save changes")').click();
  await page.waitForTimeout(500);

  // Same id, updated lithology, and the below-detection value round-trips
  // as a real result (CLAUDE.md hard rule 9), not a blank/awaiting state.
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  const updatedRow = page.locator('.mx-data-row', { hasText: sampleId.trim() });
  await expect(updatedRow).toHaveCount(1);
  await expect(updatedRow.locator('.mx-data-sub')).toContainText('Silicified breccia');
  await expect(page.locator('.mx-data-row', { hasText: 'Test edit lithology alpha' })).toHaveCount(0);

  // Re-opening the edit form after the save shows the round-tripped
  // below-detection value in its original "<0.01" text form, not blank.
  await updatedRow.locator('.mx-data-edit').click();
  await expect(page.locator('.mx-assay-row').first().locator('.mx-assay-val')).toHaveValue('<0.01');
  await page.locator('.mx-manage-drawer .mx-close-btn').click();

  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  const afterReload = page.locator('.mx-data-row', { hasText: sampleId.trim() });
  await expect(afterReload).toHaveCount(1);
  await expect(afterReload.locator('.mx-data-sub')).toContainText('Silicified breccia');
});

test('editing an existing collar updates its fields in place and keeps its id', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  await page.locator('button:has-text("+ Add collar")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill('146.31');
  await page.locator('.mx-field:has-text("Northing") input').fill('-20.11');
  await page.locator('.mx-field:has-text("Planned depth") input').fill('150');
  await page.locator('button:has-text("Add collar")').last().click();
  await page.waitForTimeout(500);

  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  const row = page.locator('.mx-data-row', { hasText: '150 m' });
  await expect(row).toHaveCount(1);
  const holeId = await row.locator('.mx-data-id').first().innerText();

  await row.locator('.mx-data-edit').click();
  const idField = page.locator('.mx-field:has-text("Hole ID") input');
  await expect(idField).toHaveAttribute('readonly', '');
  await expect(idField).toHaveValue(holeId.trim());

  await page.locator('.mx-field:has-text("Planned depth") input').fill('300');
  await page.locator('.mx-field:has-text("Notes") textarea').fill('Rig moved off in wet weather');
  await page.locator('button:has-text("Save changes")').click();
  await page.waitForTimeout(500);

  await page.locator('.mx-dock-btn[title="Drill holes"]').click();
  const updatedRow = page.locator('.mx-data-row', { hasText: holeId.trim() });
  await expect(updatedRow.locator('.mx-data-sub')).toContainText('300 m');
  await expect(updatedRow.locator('.mx-data-sub')).toContainText('Rig moved off in wet weather');
});
