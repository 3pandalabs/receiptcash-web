-- So a user's Orders screen updates live when an admin changes order status/tracking.
alter publication supabase_realtime add table public.redemption_orders;
