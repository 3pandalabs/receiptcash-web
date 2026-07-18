import { createClient } from "npm:@supabase/supabase-js@2";

type CartItem = { giftId: string; quantity: number };

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const { items } = (await req.json()) as { items: CartItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: "Cart is empty" }, 400);
    }
    for (const item of items) {
      if (!item.giftId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        return jsonResponse({ error: "Each cart item needs a giftId and a positive quantity" }, 400);
      }
    }

    // Service-role client - required because redeem_cart is restricted to
    // service_role (see supabase/migrations/0009_cart_redemption_and_admin.sql).
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: orderId, error: rpcError } = await adminClient.rpc("redeem_cart", {
      p_user_id: userId,
      p_items: items.map((item) => ({ gift_id: item.giftId, quantity: item.quantity })),
    });

    if (rpcError) {
      // 23514 = check_violation -> points_balances.balance >= 0 rejected this,
      // meaning the user can't afford the cart. The whole redeem_cart() call
      // rolled back, so no partial order/stock changes were written.
      if (rpcError.code === "23514") {
        return jsonResponse({ error: "Insufficient points balance" }, 422);
      }
      // Raised explicitly inside redeem_cart() for bad/out-of-stock/inactive items.
      if (rpcError.code === "P0001") {
        return jsonResponse({ error: rpcError.message }, 422);
      }
      throw rpcError;
    }

    return jsonResponse({ orderId }, 200);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
