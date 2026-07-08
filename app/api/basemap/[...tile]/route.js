// Same-origin proxy for the satellite / topographic basemap tiles.
//
// Why this exists: the map renders on MapLibre GL (WebGL), which uploads
// every raster tile into a WebGL texture — and the browser refuses to
// texture a cross-origin image unless the tile server sent
// `Access-Control-Allow-Origin`. Esri's arcgisonline tile endpoints don't
// reliably send that header, so requesting them directly leaves the globe
// blank (Leaflet never hit this because plain <img> tiles don't need
// CORS). Routing tiles through our own origin makes them same-origin, so
// CORS stops being a variable at all — regardless of what the upstream
// sends. Responses are cached hard (tiles are immutable) so this is a
// one-time hop per tile, then served from the CDN/browser cache.
//
// URL shape: /api/basemap/{style}/{z}/{x}/{y}   (style = satellite | topo)

const UPSTREAM = {
  // Esri expects {z}/{y}/{x} order — note the swap when building the URL.
  satellite: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  topo: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`,
};

export async function GET(_request, { params }) {
  const parts = params.tile || [];
  const [style, z, x, y] = parts;
  if (!UPSTREAM[style] || ![z, x, y].every(v => /^\d+$/.test(v))) {
    return new Response('bad tile path; expected /api/basemap/{satellite|topo}/{z}/{x}/{y}', { status: 400 });
  }

  try {
    const upstream = await fetch(UPSTREAM[style](z, x, y), {
      headers: { Accept: 'image/*' },
      next: { revalidate: 604800 }, // a week — satellite tiles don't change
    });
    if (!upstream.ok) {
      return new Response('upstream tile unavailable', { status: 502 });
    }
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        // Long-lived, immutable: the browser and the Vercel CDN both cache,
        // so upstream is hit at most once per tile.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('tile proxy error', { status: 502 });
  }
}
