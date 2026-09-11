import { z } from 'zod';
import { trustedDatabase } from '@/lib/ops/server';
import { body, noStore, failure } from '@/lib/ops/http';
export const dynamic = 'force-dynamic';
const REDEEM_MESSAGE = 'If an access invitation is waiting for this address, a fresh invitation email has been sent. Check your inbox and spam folder.';
export async function POST(request: Request) {
 try {
  const p = await body(request, 1000);
  const email = z.string().trim().email().max(254).parse(p.email).toLowerCase();
  const service = trustedDatabase();
  // Never confirm or deny whether an invitation exists — same non-enumeration
  // posture as the GIC password reset flow (app/gic/actions.ts).
  const { data: pending } = await service.rpc('mx_ops_invitation_pending', { p_email: email });
  if (pending) {
   await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: new URL('/ops/auth/complete', request.url).toString(),
   });
  }
  return noStore({ message: REDEEM_MESSAGE });
 } catch (e) {
  return failure(e);
 }
}
