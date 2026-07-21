-- Ported from receiptcash/supabase/migrations/0002, 0009, 0014 (Supabase originals).
-- SECURITY DEFINER / role-grant plumbing dropped — there's no service_role/authenticated
-- role model outside Supabase; every caller here is the single app DB user, and
-- authorization happens in the Fastify route layer instead (see src/auth/plugin.ts).

-- Trigger: every points_ledger insert atomically updates the running balance.
-- The points_balances.balance >= 0 CHECK means an over-drafting debit rolls
-- back the entire transaction (ledger insert included).
--
-- Uses the migration-0014-corrected logic: seed the row at 0 (always valid
-- against the CHECK) via ON CONFLICT DO NOTHING, then apply the delta via a
-- plain UPDATE that reads the real existing balance. The original (buggy)
-- version put the raw signed delta directly in the INSERT...ON CONFLICT
-- VALUES tuple, which Postgres validates against the CHECK before the ON
-- CONFLICT branch ever runs — so every debit failed regardless of actual
-- balance. Do not reintroduce that shape.
CREATE OR REPLACE FUNCTION apply_points_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta integer := CASE WHEN new.entry_type = 'credit' THEN new.points ELSE -new.points END;
BEGIN
  INSERT INTO points_balances (user_id, balance)
  VALUES (new.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE points_balances
  SET balance = balance + v_delta,
      updated_at = now()
  WHERE user_id = new.user_id;

  RETURN new;
END;
$$;

CREATE TRIGGER trg_apply_points_ledger_entry
  AFTER INSERT ON points_ledger
  FOR EACH ROW EXECUTE FUNCTION apply_points_ledger_entry();

-- Called from POST /receipts/:id/process after the fraud pipeline passes.
-- idempotency_key is UNIQUE on points_ledger, so re-invoking this for the
-- same receipt raises a unique_violation (23505) instead of double-crediting
-- — the route treats that as "already processed" rather than a failure.
CREATE OR REPLACE FUNCTION credit_points_for_receipt(
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
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM receipts WHERE id = p_receipt_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Receipt % not found', p_receipt_id;
  END IF;

  UPDATE receipts
  SET status = 'processed',
      merchant_name = p_merchant_name,
      receipt_total = p_receipt_total,
      purchase_date = p_purchase_date,
      tax_amount = p_tax_amount,
      tip_amount = p_tip_amount,
      fingerprint_hash = p_fingerprint_hash,
      ocr_raw = p_ocr_raw,
      processed_at = now()
  WHERE id = p_receipt_id;

  INSERT INTO points_ledger (user_id, entry_type, points, source_type, source_id, idempotency_key)
  VALUES (v_user_id, 'credit', p_points, 'receipt', p_receipt_id, 'receipt:' || p_receipt_id::text);
END;
$$;

-- Called from POST /redemption-orders. Row-locks each gift via FOR UPDATE to
-- prevent a stock race between two concurrent checkouts, then atomically
-- creates the order + line items, decrements stock, and debits points. The
-- points_balances.balance >= 0 CHECK (fired by the trigger this activates)
-- is what actually enforces affordability — if the debit would overdraw, the
-- whole function (order + items + stock decrements) rolls back together.
CREATE OR REPLACE FUNCTION redeem_cart(
  p_user_id uuid,
  p_items jsonb -- array of {"gift_id": uuid, "quantity": int}
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_gift_id uuid;
  v_quantity integer;
  v_points_cost integer;
  v_stock integer;
  v_total_points integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_gift_id := (v_item->>'gift_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for gift %', v_gift_id;
    END IF;

    SELECT points_cost, stock_level INTO v_points_cost, v_stock
    FROM gifts
    WHERE id = v_gift_id AND is_active = true
    FOR UPDATE;

    IF v_points_cost IS NULL THEN
      RAISE EXCEPTION 'Gift % not found or inactive', v_gift_id;
    END IF;

    IF v_stock IS NOT NULL AND v_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for gift %', v_gift_id;
    END IF;

    v_total_points := v_total_points + (v_points_cost * v_quantity);
  END LOOP;

  v_order_id := gen_random_uuid();

  INSERT INTO redemption_orders (id, user_id, total_points_cost, status)
  VALUES (v_order_id, p_user_id, v_total_points, 'pending');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_gift_id := (v_item->>'gift_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    SELECT points_cost INTO v_points_cost FROM gifts WHERE id = v_gift_id;

    INSERT INTO redemption_order_items (order_id, gift_id, quantity, points_cost_each)
    VALUES (v_order_id, v_gift_id, v_quantity, v_points_cost);

    UPDATE gifts
    SET stock_level = stock_level - v_quantity
    WHERE id = v_gift_id AND stock_level IS NOT NULL;
  END LOOP;

  INSERT INTO points_ledger (user_id, entry_type, points, source_type, source_id, idempotency_key)
  VALUES (p_user_id, 'debit', v_total_points, 'redemption', v_order_id, 'redemption:' || v_order_id::text);

  RETURN v_order_id;
END;
$$;
