export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ product: 'MineralX Geology', release: '2026-09-06-recovery', commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local', storage: 'browser-local' }, { headers: { 'Cache-Control': 'no-store' } });
}
