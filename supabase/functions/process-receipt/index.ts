import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { TextractClient, AnalyzeExpenseCommand } from "npm:@aws-sdk/client-textract@3";

// Placeholder cashback rule: 2% of receipt total, expressed in points (1 point = $0.01).
// Replace with real business rules once decided.
const CASHBACK_RATE = 0.02;

const textractClient = new TextractClient({
  region: Deno.env.get("AWS_REGION") ?? "us-east-1",
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  },
});

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
    console.log("process-receipt called", { userId, receiptId });
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

    console.log("receipt lookup result", { receipt, receiptError });

    if (receiptError || !receipt) {
      return jsonResponse({ error: "Receipt not found" }, 404);
    }
    if (receipt.user_id !== userId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (receipt.status !== "pending") {
      return jsonResponse({ error: `Receipt already ${receipt.status}` }, 409);
    }

    const ocrResult = await extractReceiptData(adminClient, receipt.storage_path);

    if (ocrResult.total <= 0) {
      // Textract couldn't confidently detect a total - reject rather than
      // silently crediting 0 points for an unreadable receipt.
      await adminClient
        .from("receipts")
        .update({ status: "rejected", ocr_raw: ocrResult.raw, processed_at: new Date().toISOString() })
        .eq("id", receipt.id);
      return jsonResponse({ error: "Could not read a total amount from this receipt" }, 422);
    }

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

async function extractReceiptData(
  adminClient: SupabaseClient,
  storagePath: string
): Promise<{
  merchant: string;
  total: number;
  date: string;
  raw: Record<string, unknown>;
}> {
  const { data: fileData, error: downloadError } = await adminClient.storage
    .from("receipts")
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download receipt image: ${downloadError?.message}`);
  }

  const bytes = new Uint8Array(await fileData.arrayBuffer());

  const response = await textractClient.send(
    new AnalyzeExpenseCommand({ Document: { Bytes: bytes } })
  );

  const summaryFields = response.ExpenseDocuments?.[0]?.SummaryFields ?? [];
  const findField = (type: string) =>
    summaryFields.find((f) => f.Type?.Text === type)?.ValueDetection?.Text;

  const merchant = findField("VENDOR_NAME") ?? findField("MERCHANT_NAME") ?? "Unknown merchant";

  const totalText = findField("TOTAL");
  const total = totalText ? parseFloat(totalText.replace(/[^0-9.]/g, "")) : 0;

  const dateText = findField("INVOICE_RECEIPT_DATE");
  const date = normalizeDate(dateText);

  return {
    merchant,
    total: Number.isFinite(total) ? total : 0,
    date,
    raw: response as unknown as Record<string, unknown>,
  };
}

function normalizeDate(text: string | undefined): string {
  if (text) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}
