-- Atomic RPC functions backing the two Edge Functions (process-receipt, redeem-points).
-- Both run as a single plpgsql function invocation, which Postgres executes as one
-- transaction: if anything inside raises (including the points_balances.balance >= 0
-- CHECK constraint failing), every statement in the function rolls back together.
-- These are SECURITY DEFINER and EXECUTE is restricted to service_role only below -
-- clients must go through the Edge Functions, never call these directly.

create or replace function public.credit_points_for_receipt(
  p_receipt_id uuid,
  p_merchant_name text,
  p_receipt_total numeric,
  p_purchase_date date,
  p_ocr_raw jsonb,
  p_points integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.receipts where id = p_receipt_id;

  if v_user_id is null then
    raise exception 'Receipt % not found', p_receipt_id;
  end if;

  update public.receipts
  set status = 'processed',
      merchant_name = p_merchant_name,
      receipt_total = p_receipt_total,
      purchase_date = p_purchase_date,
      ocr_raw = p_ocr_raw,
      processed_at = now()
  where id = p_receipt_id;

  -- idempotency_key is UNIQUE, so re-invoking this for the same receipt raises a
  -- unique_violation (23505) instead of double-crediting - the Edge Function treats
  -- that as "already processed" rather than a failure.
  insert into public.points_ledger (user_id, entry_type, points, source_type, source_id, idempotency_key)
  values (v_user_id, 'credit', p_points, 'receipt', p_receipt_id, 'receipt:' || p_receipt_id::text);
end;
$$;

revoke execute on function public.credit_points_for_receipt(uuid, text, numeric, date, jsonb, integer) from public;
grant execute on function public.credit_points_for_receipt(uuid, text, numeric, date, jsonb, integer) to service_role;

create or replace function public.redeem_points(
  p_user_id uuid,
  p_gift_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points_cost integer;
  v_redemption_id uuid;
begin
  select points_cost into v_points_cost
  from public.gifts
  where id = p_gift_id and is_active = true;

  if v_points_cost is null then
    raise exception 'Gift % not found or inactive', p_gift_id;
  end if;

  v_redemption_id := gen_random_uuid();

  insert into public.redemptions (id, user_id, gift_id, points_cost, status)
  values (v_redemption_id, p_user_id, p_gift_id, v_points_cost, 'pending');

  -- No explicit balance check needed here: the points_balances.balance >= 0 CHECK
  -- constraint (fired by the trigger this insert activates) rolls back this entire
  -- function - including the redemptions insert above - if the user can't afford it.
  insert into public.points_ledger (user_id, entry_type, points, source_type, source_id, idempotency_key)
  values (p_user_id, 'debit', v_points_cost, 'redemption', v_redemption_id, 'redemption:' || v_redemption_id::text);

  return v_redemption_id;
end;
$$;

revoke execute on function public.redeem_points(uuid, uuid) from public;
grant execute on function public.redeem_points(uuid, uuid) to service_role;
