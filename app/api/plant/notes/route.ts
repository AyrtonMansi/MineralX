export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function readOnly() {
  return Response.json(
    { error: 'The public plant reference is read-only. Controlled review records require an authorised MineralX workspace.' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } },
  );
}

export const GET = readOnly;
export const POST = readOnly;
export const PATCH = readOnly;
