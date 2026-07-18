-- Bug: `insert ... values (user_id, <raw delta>) on conflict do update set balance = balance + <raw delta>`
-- fails the `balance >= 0` CHECK for any debit, because Postgres validates the CHECK
-- constraint against the literal VALUES tuple (negative for a debit) before it ever
-- reaches the ON CONFLICT DO UPDATE branch that would compute the correct result.
-- This meant every redemption debit failed with "insufficient balance" regardless of
-- the actual balance. Fix: seed the row at 0 (always valid) then apply the delta via
-- a plain UPDATE, which reads the real existing balance correctly.
create or replace function public.apply_points_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer := case when new.entry_type = 'credit' then new.points else -new.points end;
begin
  insert into public.points_balances (user_id, balance)
  values (new.user_id, 0)
  on conflict (user_id) do nothing;

  update public.points_balances
  set balance = balance + v_delta,
      updated_at = now()
  where user_id = new.user_id;

  return new;
end;
$$;
