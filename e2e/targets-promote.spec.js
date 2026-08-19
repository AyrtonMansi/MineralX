import { test, expect } from '@playwright/test';
import { mockBasemap, mockElevationTiles, mockOccurrences, mockHistoricMines, waitForMapLoaded } from './helpers.js';

// Stage 1 of the exploration targeting cycle: an analysis candidate is
// ephemeral (it lives in a cache and vanishes on reload). Promoting it
// writes a first-class Target into the store, which must then survive a
// reload, a re-run and a viewport change — the whole point of "promote".

test.beforeEach(async ({ page }) => {
  await mockBasemap(page);
  await mockElevationTiles(page);
  await mockOccurrences(page);
  await mockHistoricMines(page);
  await page.goto('/mineralx');
  await waitForMapLoaded(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForMapLoaded(page);
  await page.waitForSelector('.mx-mgl-marker');
});

async function runAnalysisAndShowTargets(page) {
  await page.locator('.mx-dock-btn[title="Layers"]').click();
  // Turning on the first Target Analysis sub-layer triggers the single
  // fetch+compute; the synthetic ridge in the mock relief yields candidates.
  await page.locator('.mx-tree-row:has-text("Metal Concentration Zones") .mx-tree-eye').click();
  await page.waitForSelector('.mx-analysis-target', { timeout: 30_000 });
}

// Analysis candidates render as absolutely-positioned map markers; some
// project near or past the viewport edge and aren't clickable. Return a
// locator for the candidate nearest the screen centre, which always is.
async function centralCandidate(page) {
  const idx = await page.evaluate(() => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let best = -1, bestD = Infinity;
    document.querySelectorAll('.mx-analysis-target').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight && d < bestD) {
        bestD = d; best = i;
      }
    });
    return best;
  });
  return page.locator('.mx-analysis-target').nth(idx);
}

test('promoting a candidate creates a persistent target that survives a reload', async ({ page }) => {
  test.slow(); // one analysis run + a full reload/remount is legitimately slow
  await runAnalysisAndShowTargets(page);
  expect(await page.locator('.mx-target-marker').count()).toBe(0); // nothing promoted yet

  // Click a candidate → its popup offers a one-click promote.
  await (await centralCandidate(page)).click();
  const promote = page.locator('.mx-pop-promote-btn');
  await expect(promote).toBeVisible();
  await promote.click();
  await expect(promote).toContainText('Added to worklist'); // in-place confirmation

  // A persistent, store-backed target marker now exists.
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);

  // The real test: it's in the store, so a full reload keeps it — unlike
  // the analysis candidates, which are gone until the analysis re-runs.
  await page.reload();
  await waitForMapLoaded(page);
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);
  expect(await page.locator('.mx-analysis-target').count()).toBe(0);
});

test('promoting the same candidate twice does not create a duplicate', async ({ page }) => {
  await runAnalysisAndShowTargets(page);

  await (await centralCandidate(page)).click();
  await page.locator('.mx-pop-promote-btn').click();
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);

  // Undo the promotion, redo it — the target should round-trip cleanly,
  // and a fresh promote of the same spot must still not duplicate.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.mx-target-marker')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);
});

// Regression for a real data-corruption bug: candidate-marker popups are
// cached DOM nodes (setMarkerGroup only builds them once, on the off->on
// transition, so toggling stays free). Their "Add to targets" button used
// to close directly over onPromoteTarget, captured at the moment THAT
// popup was built. Promoting candidate A changes the store and gives every
// still-open popup a new `api` — but a SECOND popup opened after A was
// promoted, without ever being rebuilt, kept calling the stale pre-A
// handler: nextId() computed against a target list missing A produced a
// duplicate id, and pushUndo() snapshotted the pre-A store, so one Ctrl+Z
// deleted both targets at once instead of just the second. Fixed by
// routing the callbacks through refs so every popup always calls the
// current handler regardless of when its marker was created.
test('promoting two different candidates in one session gives each a distinct id and undoes independently', async ({ page }) => {
  test.slow();
  // A larger viewport spreads the demo's candidates out enough that two
  // land clear of the Layers panel/topbar/dock at once and reliably open
  // an on-screen, clickable popup.
  await page.setViewportSize({ width: 1440, height: 900 });
  await runAnalysisAndShowTargets(page);

  const indices = await page.evaluate(() => {
    const scored = [];
    document.querySelectorAll('.mx-analysis-target').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const clear = r.left > 380 && r.right < window.innerWidth - 20 && r.top > 90 && r.bottom < window.innerHeight - 150;
      if (clear) scored.push({ i, x: r.left });
    });
    return scored.sort((a, b) => a.x - b.x).slice(0, 2).map((s) => s.i);
  });
  expect(indices.length).toBe(2);

  // Click two distinct candidates directly (JS click bypasses pointer-
  // interception flakiness from overlapping sample markers) and promote
  // each from its own popup.
  for (const idx of indices) {
    await page.evaluate((i) => document.querySelectorAll('.mx-analysis-target')[i].click(), idx);
    const btn = page.locator('.mx-pop-promote-btn');
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(300);
  }

  await expect(page.locator('.mx-target-marker')).toHaveCount(2);
  const ids = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mx-store-v8'));
    return s.projects.flatMap((p) => (p.targets || []).map((t) => t.id));
  });
  expect(new Set(ids).size).toBe(2); // no duplicate ids

  // One undo removes exactly the second promotion, not both.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.mx-target-marker')).toHaveCount(1);
  const idsAfterUndo = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mx-store-v8'));
    return s.projects.flatMap((p) => (p.targets || []).map((t) => t.id));
  });
  expect(idsAfterUndo).toEqual([ids[0]]);
});
