import {NextResponse} from 'next/server';
import {database, configured} from '@/lib/gic/server';

export const dynamic = 'force-dynamic';

function privateRedirect(url: string) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

async function decisionForm(request: Request) {
  if (!request.body) throw new Error('missing_form');
  const chunks: Uint8Array[] = [];
  const reader = request.body.getReader();
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new Error('oversized_form');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new URLSearchParams(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const announcedBytes = Number(request.headers.get('content-length') || 0);
  if (!origin || origin !== new URL(request.url).origin || !configured()) {
    return NextResponse.json({error: 'invalid_request'}, {status: 403, headers: {'Cache-Control': 'no-store'}});
  }
  if (mediaType !== 'application/x-www-form-urlencoded'
    || !Number.isFinite(announcedBytes) || announcedBytes < 0 || announcedBytes > 16_384) {
    return NextResponse.json({error: 'invalid_request'}, {status: 400, headers: {'Cache-Control': 'no-store'}});
  }
  let form: URLSearchParams;
  try { form = await decisionForm(request); }
  catch { return NextResponse.json({error: 'invalid_request'}, {status: 400, headers: {'Cache-Control': 'no-store'}}); }
  const authorizationId = String(form.get('authorization_id') || '');
  const decision = String(form.get('decision') || '');
  if (!authorizationId || authorizationId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(authorizationId) || !['approve', 'deny'].includes(decision)) {
    return NextResponse.json({error: 'invalid_request'}, {status: 400, headers: {'Cache-Control': 'no-store'}});
  }

  const db = await database();
  const {data: {user}} = await db.auth.getUser();
  if (!user) return privateRedirect(`/ops/login?next=${encodeURIComponent(`/ops/oauth/consent?authorization_id=${authorizationId}`)}`);

  // Re-read the request under the current session before taking a consent decision.
  const details = await db.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error || !details.data) {
    return NextResponse.json({error: 'invalid_or_expired_authorization'}, {status: 400, headers: {'Cache-Control': 'no-store'}});
  }
  if (!('authorization_id' in details.data)) return privateRedirect(details.data.redirect_url);
  const result = decision === 'approve'
    ? await db.auth.oauth.approveAuthorization(authorizationId, {skipBrowserRedirect: true})
    : await db.auth.oauth.denyAuthorization(authorizationId, {skipBrowserRedirect: true});
  if (result.error || !result.data?.redirect_url) {
    return NextResponse.json({error: 'authorization_failed'}, {status: 400, headers: {'Cache-Control': 'no-store'}});
  }
  return privateRedirect(result.data.redirect_url);
}
