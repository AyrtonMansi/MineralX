// Shared mocks for the MapLibre-based /mineralx workspace. The globe
// renders through WebGL, which refuses to texture a cross-origin tile
// without CORS — so every mock here either goes through the app's own
// same-origin /api/basemap proxy or sends an explicit CORS header, the
// same requirement production traffic has to satisfy for real.

async function makeCanvasTile(page, paint) {
  return page.evaluate((paintFn) => {
    const T = 256;
    const c = document.createElement('canvas');
    c.width = T;
    c.height = T;
    const g = c.getContext('2d');
    // eslint-disable-next-line no-new-func
    new Function('ctx', 'T', paintFn)(g, T);
    return c.toDataURL('image/png');
  }, paint);
}

// A flat, single-colour tile — enough to give MapLibre's raster layer a
// valid texture so its render loop doesn't throw on an empty source.
export async function mockBasemap(page) {
  const dataUrl = await makeCanvasTile(page, "ctx.fillStyle='#234'; ctx.fillRect(0,0,T,T);");
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.route('**/api/basemap/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: buf })
  );
}

// A tilted-ridge elevation surface (Mapzen terrarium RGB encoding) so the
// D8 flow analysis has real relief to route water across instead of a
// flat no-op grid.
export async function mockElevationTiles(page) {
  await page.route('**/elevation-tiles-prod/**', async (route) => {
    const m = route.request().url().match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/);
    if (!m) return route.abort();
    const [, z, x, y] = m.map(Number);
    const dataUrl = await page.evaluate(([xi, yi]) => {
      const T = 256;
      const c = document.createElement('canvas');
      c.width = T;
      c.height = T;
      const g = c.getContext('2d');
      const img = g.createImageData(T, T);
      const axis = (xi + 0.5) * T;
      for (let py = 0; py < T; py++) {
        for (let px = 0; px < T; px++) {
          const gx = xi * T + px;
          const gy = yi * T + py;
          const wall = Math.abs(gx - axis) * 5.0;
          const upper = gy % 512 < 350;
          const down = upper ? (350 - (gy % 512)) * 3.5 : 0;
          const tilt = upper ? 30 : (512 - (gy % 512)) * 0.05;
          const elevation = 500 + wall + down + tilt;
          const v = elevation + 32768;
          const p = (py * T + px) * 4;
          img.data[p] = Math.floor(v / 256);
          img.data[p + 1] = Math.floor(v % 256);
          img.data[p + 2] = Math.floor((v % 1) * 256);
          img.data[p + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    }, [x, y]);
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(dataUrl.split(',')[1], 'base64') });
  });
}

// Deterministic mineral-occurrence/historic-mine responses so tests don't
// depend on the real (partly unverified) GEORES upstream. Places one
// feature just off the viewport centre.
export async function mockOccurrences(page, { commodity = 'Gold' } = {}) {
  let hits = 0;
  await page.route('**/api/mineral-occurrences**', (route) => {
    hits++;
    const u = new URL(route.request().url());
    const midLat = (Number(u.searchParams.get('s')) + Number(u.searchParams.get('n'))) / 2;
    const midLng = (Number(u.searchParams.get('w')) + Number(u.searchParams.get('e'))) / 2;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'test',
        features: [{ id: 1, lat: midLat + 0.01, lng: midLng + 0.01, name: 'Test Reef', commodity }],
      }),
    });
  });
  return () => hits;
}

export async function mockHistoricMines(page) {
  let hits = 0;
  await page.route('**/api/historic-mines**', (route) => {
    hits++;
    const u = new URL(route.request().url());
    const midLat = (Number(u.searchParams.get('s')) + Number(u.searchParams.get('n'))) / 2;
    const midLng = (Number(u.searchParams.get('w')) + Number(u.searchParams.get('e'))) / 2;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'test',
        features: [{ id: 1, lat: midLat + 0.005, lng: midLng - 0.005, name: 'Old Reef Shaft', mineType: 'Abandoned shaft' }],
      }),
    });
  });
  return () => hits;
}

export async function waitForMapLoaded(page) {
  await page.waitForFunction(() => window.__mxMapLoaded === true, null, { timeout: 20_000 });
}

export async function getProjection(page) {
  return page.evaluate(() => {
    try {
      return window.__mxDebugMap.getProjection().type;
    } catch {
      return null;
    }
  });
}
