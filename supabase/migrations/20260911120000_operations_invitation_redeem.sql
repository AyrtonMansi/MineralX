begin;
-- Supports a public "redeem invitation" affordance on /ops/login: a person who
-- lost or let an invite email expire can ask for it to be resent without an
-- authenticated session. The check must not leak whether an email exists —
-- only whether a *pending, unexpired* invitation exists for it — and must be
-- callable only with the service-role key (the Next.js route never exposes
-- this to the browser), never with anon/authenticated privileges.
create function public.mx_ops_invitation_pending(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from mx_ops.invitations
  where email=lower(trim(p_email)) and accepted_at is null and revoked_at is null and expires_at>now()
 )
$$;
revoke all on function public.mx_ops_invitation_pending(text) from public,anon,authenticated;
grant execute on function public.mx_ops_invitation_pending(text) to service_role;
commit;
