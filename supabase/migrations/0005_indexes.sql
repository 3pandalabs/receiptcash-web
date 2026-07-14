-- Every query in the app (and every RLS policy check) filters by user_id.
-- Foreign key columns aren't automatically indexed in Postgres, so add these
-- explicitly now while the tables are empty rather than as a retrofit later.
create index idx_receipts_user_id on public.receipts (user_id);
create index idx_points_ledger_user_id on public.points_ledger (user_id);
create index idx_redemptions_user_id on public.redemptions (user_id);

-- Receipt/redemption history views order by created_at desc - a composite
-- index matches that access pattern directly.
create index idx_receipts_user_created on public.receipts (user_id, created_at desc);
create index idx_redemptions_user_created on public.redemptions (user_id, created_at desc);
