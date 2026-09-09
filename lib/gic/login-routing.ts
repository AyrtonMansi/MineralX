/** Sign-in selects an available portal; it never creates or elevates membership. */
export type Lookup<T> = { data: T | null; error: unknown };
type OperationsIdentity = { userId?: unknown; schemaVersion?: unknown };
type LegacyMembership = { role: string };
export type SignInLanding = { destination: string; operationsReady: boolean };

export function safeSignInNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/ops';
  try {
    const url = new URL(value, 'https://mineralx.invalid');
    if (url.origin !== 'https://mineralx.invalid' || url.pathname.includes('%')) return '/ops';
    if (url.pathname !== '/ops' && !url.pathname.startsWith('/ops/')) return '/ops';
    // Authentication callbacks and the sign-in page must not become redirect loops.
    if (/^\/ops\/(?:auth|login)(?:\/|$)/.test(url.pathname)) return '/ops';
    return url.pathname + url.search;
  } catch { return '/ops'; }
}

export async function resolveSignInLanding(input: {
  userId: string;
  requestedNext: string | null;
  requiredSchema: number;
  readOperations: () => Promise<Lookup<OperationsIdentity>>;
  readLegacy: (userId: string) => Promise<Lookup<LegacyMembership[]>>;
}): Promise<SignInLanding> {
  if (!input.userId) throw new Error('A verified account is required.');
  const destination = safeSignInNext(input.requestedNext);
  // Password and MFA management must not depend on an operational schema or role.
  if (['/ops/account','/ops/meetings'].includes(new URL(destination, 'https://mineralx.invalid').pathname)) {
    return { destination, operationsReady: false };
  }
  const operations = await input.readOperations().catch(() => ({ data: null, error: true }));
  if (!operations.error && operations.data) {
    if (operations.data.userId !== input.userId) throw new Error('Account verification changed.');
    if (typeof operations.data.schemaVersion === 'number' && operations.data.schemaVersion >= input.requiredSchema) {
      return { destination, operationsReady: true };
    }
  }
  const legacy = await input.readLegacy(input.userId).catch(() => ({ data: null, error: true }));
  if (!legacy.error && legacy.data?.length === 1 && ['owner', 'editor', 'viewer'].includes(legacy.data[0].role)) {
    // /gic independently rechecks this account's membership and existing role.
    return { destination: '/gic', operationsReady: false };
  }
  // No usable legacy membership: retain the explicit Operations activation/access state.
  return { destination: '/ops', operationsReady: false };
}

export function signInFailureMessage(error: unknown): string {
  const e = error as { code?: string; status?: number; name?: string } | null;
  if (e?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(e?.code || '')) {
    return 'Too many sign-in attempts. Wait a few minutes before trying again.';
  }
  if (e?.name === 'AuthRetryableFetchError' || e?.name === 'TypeError' || e?.status === 0 || (e?.status || 0) >= 500) {
    return 'The sign-in service could not be reached. Your password has not been changed. Please try again shortly.';
  }
  if (e?.code === 'email_not_confirmed') return 'Your email has not been confirmed. Open your account invitation or request a fresh invitation.';
  return 'Sign-in failed. Check your email and password, or use Forgot password.';
}

export function resetFailureMessage(error: unknown): string {
  const e = error as { code?: string; status?: number } | null;
  if (e?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(e?.code || '')) {
    return 'Reset requests are temporarily rate-limited. Wait a few minutes before requesting another link.';
  }
  return 'The password reset request could not be completed. Please try again shortly. No reset has been confirmed.';
}
