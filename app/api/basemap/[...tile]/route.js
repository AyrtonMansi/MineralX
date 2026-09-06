// Same-origin raster proxy. Await route params on the supported Next.js baseline.
export const runtime = 'edge';
const SERVICES = { satellite: 'World_Imagery', topo: 'World_Topo_Map' };
const BLANK = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
function unavailable() {
  return new Response(BLANK, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=30', 'X-MineralX-Tile': 'upstream-unavailable' } });
}
export async function GET(_request, { params }) {
  const parts = (await params).tile || [];
  const [style, z, x, y] = parts;
  if (parts.length !== 4 || !Object.hasOwn(SERVICES, style) || ![z, x, y].every(v => /^\d+$/.test(v)) || +z > 22 || +x >= 2 ** +z || +y >= 2 ** +z) {
    return new Response('Invalid tile path', { status: 400 });
  }
  try {
    const res = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/${SERVICES[style]}/MapServer/tile/${z}/${y}/${x}`, { headers: { Accept: 'image/*' }, next: { revalidate: 604800 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return unavailable();
    return new Response(await res.arrayBuffer(), { headers: { 'Content-Type': res.headers.get('content-type'), 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });
  } catch { return unavailable(); }
}
