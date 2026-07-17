-- Extends credit_points_for_receipt for the new fields, replaces
-- redeem_points with a cart-capable redeem_cart, and adds an is_admin()
-- helper + RLS policies for the admin panel.

-- 1. credit_points_for_receipt: now also persists tax/tip/fingerprint.
drop function public.credit_points_for_receipt(uuid, text, numeric, date, jsonb, integer);

create function public.credit_points_for_receipt(
  p_receipt_id uuid,
  p_merchant_name text,
  p_receipt_total numeric,
  p_purchase_date date,
  p_tax_amount numeric,
  p_tip_amount numeric,
  p_fingerprint_hash text,
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
      tax_amount = p_tax_amount,
      tip_amount = p_tip_amount,
      fingerprint_hash = p_fingerprint_hash,
      ocr_raw = p_ocr_raw,
      processed_at = now()
  where id = p_receipt_id;

  insert into public.points_ledger (user_id, entry_type, points, source_type, source_id, idempotency_key)
  values (v_user_id, 'credit', p_points, 'receipt', p_receipt_id, 'receipt:' || p_receipt_id::text);
end;
$$;

revoke execute on function public.credit_points_for_receipt
  (uuid, text, numeric, date, numeric, numeric, text, jsonb, integer) from public;
grant execute on function public.credit_points_for_receipt
  (uuid, text, numeric, date, numeric, numeric, text, jsonb, integer) to service_role;

-- 2. redeem_cart: replaces the single-item redeem_points. Validates every
-- item (and locks the gift rows via FOR UPDATE to prevent a stock race
-- between two concurrent checkouts), then atomically creates the order,
-- its line items, decrements stock, and debits points in one function call.
-- As before, the points_balances.balance >= 0 CHECK constraint is what
-- actually enforces affordability - if the debit would overdraw, the whole
-- function (order + items + stock decrements) rolls back together.
drop function public.redeem_points(uuid, uuid);

create function public.redeem_cart(
  p_user_id uuid,
  p_items jsonb -- array of {"gift_id": uuid, "quantity": int}
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_gift_id uuid;
  v_quantity integer;
  v_points_cost integer;
  v_stock integer;
  v_total_points integer := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_gift_id := (v_item->>'gift_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid quantity for gift %', v_gift_id;
    end if;

    select points_cost, stock_level into v_points_cost, v_stock
    from public.gifts
    where id = v_gift_id and is_active = true
    for update;

    if v_points_cost is null then
      raise exception 'Gift % not found or inactive', v_gift_id;
    end if;

    if v_stock is not null and v_stock < v_quantity then
      raise exception 'Insufficient stock for gift %', v_gift_id;
    end if;

    v_total_points := v_total_points + (v_points_cost * v_quantity);
  end loop;

  v_order_id := gen_random_uuid();

  insert into public.redemption_orders (id, user_id, total_points_cost, status)
  values (v_order_id, p_user_id, v_total_points, 'pending');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_gift_id := (v_item->>'gift_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    select points_cost into v_points_cost from public.gifts where id = v_gift_id;

    insert into public.redemption_order_items (order_id, gift_id, quantity, points_cost_each)
    values (v_order_id, v_gift_id, v_quantity, v_points_cost);

    update public.gifts
    set stock_level = stock_level - v_quantity
    where id = v_gift_id and stock_level is not null;
  end loop;

  insert into public.points_ledger (user_id, entry_type, points, source_type, source_id, idempotency_key)
  values (p_user_id, 'debit', v_total_points, 'redemption', v_order_id, 'redemption:' || v_order_id::text);

  return v_order_id;
end;
$$;

revoke execute on function public.redeem_cart(uuid, jsonb) from public;
grant execute on function public.redeem_cart(uuid, jsonb) to service_role;

-- 3. Admin access: a simple boolean flag is proportionate for a small team,
-- not worth a full roles/permissions system yet. SECURITY DEFINER here is
-- required, not just convenient - without it, using is_admin() inside a
-- policy ON profiles itself would recurse into RLS and fail.
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

create policy "admin_select_all_profiles" on public.profiles for select using (public.is_admin());
create policy "admin_select_all_receipts" on public.receipts for select using (public.is_admin());
create policy "admin_select_all_receipt_items" on public.receipt_items for select using (public.is_admin());
create policy "admin_select_all_points_ledger" on public.points_ledger for select using (public.is_admin());
create policy "admin_select_all_points_balances" on public.points_balances for select using (public.is_admin());
create policy "admin_select_all_redemption_orders" on public.redemption_orders for select using (public.is_admin());
create policy "admin_select_all_redemption_order_items" on public.redemption_order_items for select using (public.is_admin());
create policy "admin_select_all_gifts" on public.gifts for select using (public.is_admin());

create policy "admin_insert_gifts" on public.gifts for insert with check (public.is_admin());
create policy "admin_update_gifts" on public.gifts for update using (public.is_admin());
create policy "admin_update_redemption_orders" on public.redemption_orders for update using (public.is_admin());

grant insert, update on public.gifts to authenticated;
