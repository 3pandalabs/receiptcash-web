import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { giftId } = await req.json();
    if (!giftId) {
      return jsonResponse({ error: "giftId is required" }, 400);
    }

    // Service-role client - required because the redeem_points RPC is restricted
    // to service_role (see supabase/migrations/0002_ledger_functions.sql).
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: redemptionId, error: rpcError } = await adminClient.rpc("redeem_points", {
      p_user_id: userId,
      p_gift_id: giftId,
    });

    if (rpcError) {
      // 23514 = check_violation -> the points_balances.balance >= 0 constraint
      // rejected this, meaning the user doesn't have enough points. The whole
      // redeem_points() call rolled back, so no partial state was written.
      if (rpcError.code === "23514") {
        return jsonResponse({ error: "Insufficient points balance" }, 422);
      }
      throw rpcError;
    }

    return jsonResponse({ redemptionId }, 200);
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
