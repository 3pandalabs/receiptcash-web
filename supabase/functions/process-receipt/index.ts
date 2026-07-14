import { createClient } from "npm:@supabase/supabase-js@2";

// Placeholder cashback rule: 2% of receipt total, expressed in points (1 point = $0.01).
// Replace with real business rules once decided.
const CASHBACK_RATE = 0.02;

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Scoped to the caller's own JWT - used only to identify who's calling.
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const { receiptId } = await req.json();
    if (!receiptId) {
      return jsonResponse({ error: "receiptId is required" }, 400);
    }

    // Service-role client - required to read/write receipts and points_ledger,
    // since RLS deliberately blocks direct client writes to those tables.
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: receipt, error: receiptError } = await adminClient
      .from("receipts")
      .select("id, user_id, storage_path, status")
      .eq("id", receiptId)
      .single();

    if (receiptError || !receipt) {
      return jsonResponse({ error: "Receipt not found" }, 404);
    }
    if (receipt.user_id !== userId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (receipt.status !== "pending") {
      return jsonResponse({ error: `Receipt already ${receipt.status}` }, 409);
    }

    const ocrResult = await extractReceiptData(receipt.storage_path);

    const points = Math.round(ocrResult.total * CASHBACK_RATE * 100);

    const { error: rpcError } = await adminClient.rpc("credit_points_for_receipt", {
      p_receipt_id: receipt.id,
      p_merchant_name: ocrResult.merchant,
      p_receipt_total: ocrResult.total,
      p_purchase_date: ocrResult.date,
      p_ocr_raw: ocrResult.raw,
      p_points: points,
    });

    if (rpcError) {
      // 23505 = unique_violation on idempotency_key -> this receipt was already
      // credited by a prior/retried call. Treat as a no-op, not an error.
      if (rpcError.code === "23505") {
        return jsonResponse({ message: "Already processed" }, 200);
      }
      throw rpcError;
    }

    return jsonResponse({ pointsCredited: points }, 200);
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

// TODO: replace with a real call to AWS Textract's AnalyzeExpense API.
// Steps once AWS credentials are wired up (see AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// as function secrets - `supabase secrets set`):
//   1. Download the image: adminClient.storage.from("receipts").download(storagePath)
//   2. Send the bytes to Textract's AnalyzeExpense API
//   3. Parse merchant name, total, and purchase date out of the ExpenseDocument response
async function extractReceiptData(storagePath: string): Promise<{
  merchant: string;
  total: number;
  date: string;
  raw: Record<string, unknown>;
}> {
  console.warn(
    `extractReceiptData: AWS Textract not yet wired up - returning placeholder for ${storagePath}`
  );
  return {
    merchant: "Unknown (OCR not yet connected)",
    total: 0,
    date: new Date().toISOString().slice(0, 10),
    raw: { placeholder: true, storagePath },
  };
}
