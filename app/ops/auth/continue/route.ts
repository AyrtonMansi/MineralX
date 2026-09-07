import { NextRequest, NextResponse } from 'next/server';
import { configured, database } from '@/lib/gic/server';
import { resolveSignInLanding, safeSignInNext } from '@/lib/gic/login-routing';
import { OPS_SCHEMA } from '@/lib/ops/contracts';

export const dynamic = 'force-dynamic';

/** Verify the server cookie before choosing either existing protected workspace. */
export async function GET(request: NextRequest) {
  const next = safeSignInNext(request.nextUrl.searchParams.get('next'));
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  const login = '/ops/login?next=' + encodeURIComponent(next);
  if (!configured()) return redirect(login + '&service=unavailable');
  try {
    const db = await database();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return redirect(login + '&session=unconfirmed');
    const landing = await resolveSignInLanding({
      userId: user.id,
      requestedNext: next,
      requiredSchema: OPS_SCHEMA,
      readOperations: async () => {
        const { data, error } = await db.rpc('mx_ops_context');
        return { data, error };
      },
      readLegacy: async userId => {
        const { data, error } = await db.from('gic_members').select('role').eq('user_id', userId).limit(2);
        return { data, error };
      },
    });
    if (landing.operationsReady) {
      // Retain the existing invite-claim flow, only after the schema is available.
      // An invitation failure must not invalidate an already verified identity.
      try { await db.rpc('mx_ops_claim_invitations'); } catch { /* Access remains independently checked. */ }
    }
    return redirect(landing.destination);
  } catch {
    return redirect(login + '&access=unavailable');
  }
}
