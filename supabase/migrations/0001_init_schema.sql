-- ReceiptCash initial schema: profiles, receipts, points ledger, balances, gifts, redemptions
-- Design principle: points_ledger is an append-only ledger. points_balances is derived from it
-- via trigger, with a CHECK constraint enforcing balance >= 0 at the database level — so a
-- debit that would overdraw a user's balance fails the whole transaction, not just app logic.
-- Idempotency is enforced via a UNIQUE key on points_ledger so retried/duplicate credit
-- attempts for the same receipt cannot double-credit.

-- 1. Profiles (extends auth.users with app-specific fields)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- 2. Receipts
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  content_hash text not null,
  merchant_name text,
  receipt_total numeric(10, 2) check (receipt_total >= 0),
  purchase_date date,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'rejected', 'duplicate')),
  ocr_raw jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, content_hash)
);

alter table public.receipts enable row level security;

create policy "receipts_select_own" on public.receipts
  for select using (auth.uid() = user_id);

create policy "receipts_insert_own" on public.receipts
  for insert with check (auth.uid() = user_id);

-- No update/delete policy for clients: only the Edge Function (service role,
-- which bypasses RLS) transitions status from pending -> processed/rejected/duplicate.

-- 3. Points ledger (append-only, source of truth for all balance movements)
create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('credit', 'debit')),
  points integer not null check (points > 0),
  source_type text not null check (source_type in ('receipt', 'redemption', 'adjustment')),
  source_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.points_ledger enable row level security;

create policy "points_ledger_select_own" on public.points_ledger
  for select using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy: only Edge Functions (service role)
-- write to the ledger. Clients can only ever read their own history.

-- 4. Points balances (maintained by trigger below, never written directly by clients)
create table public.points_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.points_balances enable row level security;

create policy "points_balances_select_own" on public.points_balances
  for select using (auth.uid() = user_id);

-- Trigger: every ledger insert atomically updates the running balance.
-- The balance >= 0 check above means an over-drafting debit rolls back
-- the entire transaction (ledger insert included) rather than allowing
-- a negative balance to ever be persisted.
create function public.apply_points_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.points_balances (user_id, balance)
  values (
    new.user_id,
    case when new.entry_type = 'credit' then new.points else -new.points end
  )
  on conflict (user_id) do update
    set balance = public.points_balances.balance
        + case when new.entry_type = 'credit' then new.points else -new.points end,
        updated_at = now();
  return new;
end;
$$;

create trigger trg_apply_points_ledger_entry
  after insert on public.points_ledger
  for each row execute function public.apply_points_ledger_entry();

-- 5. Gifts catalog
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  points_cost integer not null check (points_cost > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.gifts enable row level security;

create policy "gifts_select_active" on public.gifts
  for select using (is_active = true);

-- No client write policy: catalog is managed via the dashboard/service role for now.

-- 6. Redemptions
create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gift_id uuid not null references public.gifts(id),
  points_cost integer not null check (points_cost > 0),
  status text not null default 'pending'
    check (status in ('pending', 'fulfilled', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

alter table public.redemptions enable row level security;

create policy "redemptions_select_own" on public.redemptions
  for select using (auth.uid() = user_id);

-- No client insert/update policy: redemption requests are created and processed
-- entirely by the "redeem-points" Edge Function (validates balance, deducts points,
-- and creates this record in one atomic transaction — see planning doc section 8b).
