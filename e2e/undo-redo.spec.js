import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// Undo/redo over the project store: every data mutation snapshots first,
// Ctrl/Cmd+Z walks back, Ctrl/Cmd+Shift+Z walks forward, and the guard
// keeps native text-field editing untouched.

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

async function addSample(page, lng = '146.30', lat = '-20.10') {
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('button:has-text("+ Add sample")').click();
  await page.locator('.mx-field:has-text("Easting") input').fill(lng);
  await page.locator('.mx-field:has-text("Northing") input').fill(lat);
  await page.locator('button:has-text("Add sample")').last().click();
  // Opening the manage drawer closed the data drawer, and the manage
  // drawer closes itself on add — nothing is left open here.
  await page.waitForTimeout(300);
}

test('Ctrl+Z undoes an added sample; Ctrl+Shift+Z restores it', async ({ page }) => {
  const before = await page.locator('.mx-mgl-marker').count();

  await addSample(page);
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before + 1);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before);

  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before + 1);
});

test('topbar buttons mirror history state and perform undo/redo', async ({ page }) => {
  const undoBtn = page.locator('.mx-undo-btn[title^="Undo"]');
  const redoBtn = page.locator('.mx-undo-btn[title^="Redo"]');

  // Fresh session: nothing to undo or redo.
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();

  const before = await page.locator('.mx-mgl-marker').count();
  await addSample(page);
  await expect(undoBtn).toBeEnabled();
  await expect(redoBtn).toBeDisabled();

  await undoBtn.click();
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before);
  await expect(redoBtn).toBeEnabled();

  await redoBtn.click();
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before + 1);
});

test('Ctrl+Z inside a text input does not revert map data', async ({ page }) => {
  const before = await page.locator('.mx-mgl-marker').count();
  await addSample(page);

  await page.locator('.mx-search-input').click();
  await page.locator('.mx-search-input').pressSequentially('test');
  await page.keyboard.press('Control+z'); // native input undo, not store undo

  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before + 1);
});

test('deleting a sample is undoable', async ({ page }) => {
  const before = await page.locator('.mx-mgl-marker').count();
  page.on('dialog', (d) => d.accept());

  // Delete a demo sample from the Data drawer.
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  const firstRow = page.locator('.mx-data-row').first();
  await firstRow.hover();
  await firstRow.locator('.mx-data-delete').click();
  await page.locator('.mx-data-drawer-wrap .mx-close-btn').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before - 1);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before);
});
