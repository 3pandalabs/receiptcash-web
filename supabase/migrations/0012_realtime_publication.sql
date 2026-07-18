-- points_balances/receipts postgres_changes subscriptions (usePointsBalance,
-- useReceipts) never fired: no table had ever been added to supabase_realtime.
alter publication supabase_realtime add table public.points_balances;
alter publication supabase_realtime add table public.receipts;
