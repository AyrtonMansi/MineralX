-- Membership records are an internal access-control allowlist, not a JV roster.
-- Product reads use the scoped RPCs; browser roles do not need direct table access.
begin;
drop policy if exists meeting_member_read on mx_meetings.members;
revoke all on table mx_meetings.members from anon,authenticated;
commit;
