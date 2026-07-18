-- Schema additions for: line-item fraud checks, receipt fingerprinting,
-- a flagged-for-review status, cart-based redemption, and admin access.
-- Ported concepts from a reference implementation (different stack, same ideas).

-- 1. Receipts: tax/tip breakdown, a content-based fingerprint (distinct from
-- content_hash, which hashes the image bytes - fingerprint_hash instead hashes
-- merchant+total+date, so it catches the same physical receipt even if
-- re-photographed differently), a persisted rejection reason, and a new status.
alter table public.receipts
  add column tax_amount numeric(10, 2),
  add column tip_amount numeric(10, 2),
  add column fingerprint_hash text,
  add column status_reason text;

alter table public.receipts drop constraint receipts_status_check;
alter table public.receipts add constraint receipts_status_check
  check (status in ('pending', 'processed', 'rejected', 'duplicate', 'flagged_for_review'));

create index idx_receipts_fingerprint_hash on public.receipts (fingerprint_hash);

-- 2. Receipt line items - needed for the math-verification fraud check.
create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  description text,
  unit_price numeric(10, 2) not null,
  quantity integer not null default 1
);

alter table public.receipt_items enable row level security;

create policy "receipt_items_select_own" on public.receipt_items
  for select using (
    exists (select 1 from public.receipts r where r.id = receipt_id and r.user_id = auth.uid())
  );

grant select on public.receipt_items to authenticated;
grant select, insert, update, delete on public.receipt_items to service_role;

-- 3. Admin flag on profiles - simple boolean is proportionate for a
-- small team; not worth a full roles/permissions system yet.
alter table public.profiles add column is_admin boolean not null default false;

-- 4. Gifts: stock tracking + a display icon.
alter table public.gifts
  add column stock_level integer,
  add column image_emoji text;

-- 5. Cart-based redemption: replaces the single-item redemptions table with
-- an order + order-items structure so a checkout can atomically cover
-- multiple different gifts at once. No real redemption data exists yet
-- (pre-launch), so replacing outright rather than maintaining both.
drop table public.redemptions;

create table public.redemption_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_points_cost integer not null check (total_points_cost > 0),
  status text not null default 'pending'
    check (status in ('pending', 'fulfilled', 'failed', 'cancelled')),
  tracking_number text,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

alter table public.redemption_orders enable row level security;

create policy "redemption_orders_select_own" on public.redemption_orders
  for select using (auth.uid() = user_id);

grant select on public.redemption_orders to authenticated;
grant update on public.redemption_orders to authenticated; -- admin-only in practice, gated by RLS below
grant select, insert, update, delete on public.redemption_orders to service_role;

create table public.redemption_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.redemption_orders(id) on delete cascade,
  gift_id uuid not null references public.gifts(id),
  quantity integer not null check (quantity > 0),
  points_cost_each integer not null check (points_cost_each > 0)
);

alter table public.redemption_order_items enable row level security;

create policy "redemption_order_items_select_own" on public.redemption_order_items
  for select using (
    exists (select 1 from public.redemption_orders o where o.id = order_id and o.user_id = auth.uid())
  );

grant select on public.redemption_order_items to authenticated;
grant select, insert, update, delete on public.redemption_order_items to service_role;

create index idx_redemption_orders_user_id on public.redemption_orders (user_id);
create index idx_redemption_order_items_order_id on public.redemption_order_items (order_id);
