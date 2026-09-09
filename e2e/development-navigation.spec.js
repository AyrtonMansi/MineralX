import { test, expect } from '@playwright/test';

const facility = 'de000000-0000-4000-8000-000000000003';
const project = 'de000000-0000-4000-8000-000000000004';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64');

async function openDevelopment(page, path = '/ops') {
  await page.route('**/api/basemap/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}mode=development`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ops-development-banner')).toBeVisible({ timeout: 30_000 });
}

test('the device workspace presents one minimal navigation without internal development scopes', async ({ page }) => {
  await openDevelopment(page);

  const navigation = page.locator('#operations-navigation');
  const primary = ['Home', 'Work', 'Geology Globe', 'Exploration', 'Pits & stockpiles', 'Processing', 'Gold', 'Meetings'];
  for (const name of primary) await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveCount(primary.length);

  await expect(navigation.getByRole('link', { name: 'Geology Globe', exact: true })).toHaveAttribute('href', `/ops/geology?view=map&scope=${project}`);
  await expect(navigation.getByRole('link', { name: 'Exploration', exact: true })).toHaveAttribute('href', `/ops/geology?scope=${project}`);

  await navigation.getByRole('link', { name: 'Geology Globe', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('map');
  await expect(page.getByLabel('Globe work programs')).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Geology Globe', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', { name: 'Exploration', exact: true })).not.toHaveAttribute('aria-current', 'page');

  await navigation.getByRole('link', { name: 'Exploration', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).not.toBe('map');
  await expect(navigation.getByRole('link', { name: 'Exploration', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', { name: 'Geology Globe', exact: true })).not.toHaveAttribute('aria-current', 'page');

  await expect(page.getByRole('combobox', { name: 'Workspace or site' })).toHaveCount(0);
  await expect(page.getByText('Development facility', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Development geology', { exact: true })).toHaveCount(0);
  for (const removed of ['Development settings', 'Legacy processing register', 'Local geology workspace', 'Plant layout reference']) {
    await expect(navigation.getByRole('link', { name: removed, exact: true })).toHaveCount(0);
  }
});

test('development deep links choose the right internal record set and retire removed destinations safely', async ({ page }) => {
  await openDevelopment(page, `/ops/geology?view=map&scope=${facility}`);
  await expect.poll(() => new URL(page.url()).searchParams.get('scope')).toBe(project);
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('map');
  await expect(page.getByRole('heading', { name: 'Geology', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Globe work programs')).toBeVisible();
  await expect(page.getByText('Development geology', { exact: true })).toHaveCount(0);

  await page.goto(`/ops/plant?scope=${project}&mode=development`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => new URL(page.url()).searchParams.get('scope')).toBe(facility);
  await expect(page.locator('#operations-navigation').getByRole('link', { name: 'Processing', exact: true })).toBeVisible();
  await expect(page.getByText('Development facility', { exact: true })).toHaveCount(0);

  for (const retired of [`/ops/admin?scope=${facility}&mode=development`, `/ops/field?scope=${project}&mode=development`]) {
    await page.goto(retired, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ops');
    await expect(page.locator('#operations-navigation').getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  }
});
