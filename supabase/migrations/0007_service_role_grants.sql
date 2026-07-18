-- Same root cause as 0006_grants.sql: "Automatically expose new tables" is
-- disabled, so every role - including service_role - needs explicit GRANTs
-- before it can touch a table, regardless of RLS. Migration 0006 only
-- covered `authenticated` (for client-facing queries); service_role was
-- missed, which is what the Edge Functions use for direct table access
-- outside the SECURITY DEFINER RPC functions (those already have their own
-- EXECUTE grants from 0002_ledger_functions.sql and are unaffected by this).
--
-- service_role is the trusted server-side role and bypasses RLS by design,
-- so granting it full access here is correct, not a security loosening -
-- these are the tables the Edge Functions manage directly.

grant select, insert, update, delete on
  public.profiles,
  public.receipts,
  public.points_ledger,
  public.points_balances,
  public.gifts,
  public.redemptions
to service_role;
