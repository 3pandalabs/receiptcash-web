-- "Automatically expose new tables" was deliberately disabled when the Data API
-- was configured (see project notes) so that new tables don't get default
-- privileges the moment they're created - access must be granted explicitly,
-- table by table. RLS policies alone are not sufficient: Postgres checks
-- table-level GRANTs first, and only then applies RLS to filter rows. Without
-- these grants, every operation fails with "permission denied for table X"
-- regardless of how permissive the RLS policies are.
--
-- These grants intentionally mirror the RLS policies already in place:
-- clients get exactly the verbs their policies allow, nothing more. Tables
-- with no client-facing policy at all (points_ledger writes, points_balances
-- writes) are not granted INSERT/UPDATE/DELETE here - those stay service-role-only.

grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert on public.receipts to authenticated;
grant select on public.points_ledger to authenticated;
grant select on public.points_balances to authenticated;
grant select on public.gifts to authenticated;
grant select on public.redemptions to authenticated;
