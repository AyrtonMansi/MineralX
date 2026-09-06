import { test, expect } from '@playwright/test';
import { mockBasemap, waitForMapLoaded } from './helpers.js';

// The AI extraction flow. The Claude call itself is mocked (deterministic
// fixture) — what's under test is the panel flow, the review-before-import
// contract, the coordinate-safety `skipped` surfacing, and that the real
// route fails honestly (503, no fabricated data) when unconfigured.

const FIXTURE = {
  success: true,
  extracted: {
    samples: [
      { id: 'EX-RC-001', lat: -20.0701, lng: 146.2611, assays: { Au: 2.8, Ag: 12 }, lith: 'Quartz vein', notes: 'From table 2' },
      { id: '', lat: -20.0712, lng: 146.2633, assays: { Au: 0.4 }, lith: '', notes: '' },
    ],
    collars: [
      { id: 'EX-DD-001', lat: -20.0725, lng: 146.2601, azimuth: 90, dip: -60, depth: 180 },
    ],
    intervals: [
      { holeId: 'EX-DD-001', from: 42, to: 48, assays: { Au: 3.1 } },
    ],
    boundary: null,
    confidence: 0.9,
    sourceHighlights: [
      { text: 'Sample EX-RC-001 returned 2.8 g/t Au and 12 g/t Ag', type: 'assay' },
    ],
  },
  skipped: [
    { kind: 'sample', id: 'EX-RC-009', reason: 'projected easting/northing — import via CSV so the MGA zone can be confirmed' },
  ],
  model: 'test',
  fileName: null,
};

test('extract flow: review shows counts, confidence, quotes and skipped rows; import lands the data', async ({ page }) => {
  await mockBasemap(page);
  await page.route('**/api/extract', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) })
  );

  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
  const before = await page.locator('.mx-mgl-marker').count();

  await page.locator('.mx-dock-btn[title="Add data"]').click();
  await page.locator('.mx-extract-open').click();
  await page.locator('.mx-extract-textarea').fill('Sample EX-RC-001 returned 2.8 g/t Au…');
  await page.locator('button:has-text("Extract")').click();

  // Review state — nothing imported yet.
  await expect(page.locator('.mx-extract-count').first()).toContainText('2 samples');
  await expect(page.locator('.mx-extract-confidence')).toContainText('90% confidence');
  await expect(page.locator('.mx-extract-quote-text')).toContainText('EX-RC-001 returned 2.8 g/t Au');
  await expect(page.locator('.mx-extract-skip-row')).toContainText('MGA zone');
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before);

  // Import: 2 samples + 1 collar become markers; interval attaches to the
  // extracted collar.
  await page.locator('button:has-text("Import into")').click();
  await expect(page.locator('.mx-import-msg.mx-import-ok')).toContainText('Imported');
  await expect(page.locator('.mx-mgl-marker')).toHaveCount(before + 3);

  // The auto-ID fallback filled the blank sample ID from the project prefix.
  await page.locator('.mx-extract-back').click();
  await page.locator('.mx-dock-btn[title="Rock chips"]').click();
  await page.locator('.mx-data-filter').fill('EX-RC-001');
  await expect(page.locator('.mx-data-row').first()).toContainText('EX-RC-001');
});

test('extraction API errors surface in the panel instead of fabricating data', async ({ page }) => {
  await mockBasemap(page);
  await page.route('**/api/extract', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'AI extraction is not configured on this deployment. Set ANTHROPIC_API_KEY in the environment to enable it.', notConfigured: true }) })
  );

  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.locator('.mx-dock-btn[title="Add data"]').click();
  await page.locator('.mx-extract-open').click();
  await page.locator('.mx-extract-textarea').fill('some report text');
  await page.locator('button:has-text("Extract")').click();

  await expect(page.locator('.mx-import-msg.mx-import-err')).toContainText('not configured');
  await expect(page.locator('.mx-extract-count')).toHaveCount(0); // no invented results
});

test('the real route (no API key in this environment) returns an honest 503, never mock data', async ({ request }) => {
  const res = await request.post('/api/extract', { data: { text: 'Sample X-1 returned 5 g/t Au at -20.07, 146.26' } });
  // This test environment has no ANTHROPIC_API_KEY, so the route must
  // refuse to pretend: 503 + notConfigured, not a fabricated extraction.
  expect(res.status()).toBe(503);
  const body = await res.json();
  expect(body.notConfigured).toBe(true);
  expect(body.extracted).toBeUndefined();
});
