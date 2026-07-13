import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// A program spans several projects, often in different countries. The Data
// drawer must let a manager scope to one project or view the whole program
// with each record tagged by its project — otherwise a QLD drill hole and
// a WA one are an undifferentiated pile.

const TWO_PROJECT_STORE = {
  version: 7,
  activeProjectId: 'p-qld',
  projects: [
    {
      id: 'p-qld', name: 'Charters Towers Au', color: '#C15F3C', idPrefix: 'CT-RC-', createdAt: '2026-06-01',
      boundary: null,
      samples: [
        { id: 'CT-RC-0001', lat: -20.07, lng: 146.26, assays: { Au: 4.2 }, lith: 'Quartz vein', notes: '', date: '2026-06-01' },
        { id: 'CT-RC-0002', lat: -20.08, lng: 146.27, assays: { Au: 0.3 }, lith: 'Siltstone', notes: '', date: '2026-06-01' },
      ],
      collars: [], intervals: [], surveys: [], geology: [], targets: [], dismissedTargets: [], files: [],
    },
    {
      id: 'p-wa', name: 'Kalgoorlie JV', color: '#6E7A5E', idPrefix: 'KAL-RC-', createdAt: '2026-06-02',
      boundary: null,
      samples: [
        { id: 'KAL-RC-0001', lat: -30.75, lng: 121.47, assays: { Au: 8.1 }, lith: 'Banded iron', notes: '', date: '2026-06-02' },
      ],
      collars: [], intervals: [], surveys: [], geology: [], targets: [], dismissedTargets: [], files: [],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate((store) => localStorage.setItem('mx-store-v7', JSON.stringify(store)), TWO_PROJECT_STORE);
  await page.reload();
  await waitForMapLoaded(page);
});

test('the Data drawer scopes to one project and tags records by project across the program', async ({ page }) => {
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();

  // Opens focused on the active project (QLD) — not every site's data at once.
  const select = page.locator('.mx-data-project-select');
  await expect(select).toBeVisible();
  await expect(select).toHaveValue('p-qld');
  await expect(page.locator('.mx-data-list .mx-data-row')).toHaveCount(2);
  await expect(page.locator('.mx-data-list')).toContainText('CT-RC-0001');
  await expect(page.locator('.mx-data-list')).not.toContainText('KAL-RC-0001');

  // Whole program: both projects' chips, each tagged with its project.
  await select.selectOption('all');
  await expect(page.locator('.mx-data-list .mx-data-row')).toHaveCount(3);
  await expect(page.locator('.mx-data-project')).toHaveCount(3);
  await expect(page.locator('.mx-data-list')).toContainText('Kalgoorlie JV');

  // Scope to the WA project only.
  await select.selectOption('p-wa');
  await expect(page.locator('.mx-data-list .mx-data-row')).toHaveCount(1);
  await expect(page.locator('.mx-data-list')).toContainText('KAL-RC-0001');
  await expect(page.locator('.mx-data-list')).not.toContainText('CT-RC-0001');
});
