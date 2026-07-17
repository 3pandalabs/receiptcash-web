import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { TextractClient, AnalyzeExpenseCommand } from "npm:@aws-sdk/client-textract@3";

// Configurable reward rate (percent of receipt total), rather than a
// hardcoded constant - set REWARD_RATE_PERCENT as a function secret to change.
const REWARD_RATE_PERCENT = Number(Deno.env.get("REWARD_RATE_PERCENT") ?? "2");

// Line-item math must add up to within this tolerance of the stated total
// (tax/tip included) or the receipt is rejected as likely tampered/misread.
const MATH_TOLERANCE_DOLLARS = 5.0;

// A receipt counts as a near-duplicate of a prior one if at least this
// fraction of its line items exactly match a previous receipt's items.
const DEEP_DUPLICATE_THRESHOLD = 0.75;

const textractClient = new TextractClient({
  region: Deno.env.get("AWS_REGION") ?? "us-east-1",
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  },
});

type LineItem = { description: string; unitPrice: number; quantity: number };
type OcrResult = {
  merchant: string | null;
  total: number;
  tax: number | null;
  tip: number | null;
  date: string;
  lineItems: LineItem[];
  raw: Record<string, unknown>;
};

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

    const { receiptId } = await req.json();
    if (!receiptId) {
      return jsonResponse({ error: "receiptId is required" }, 400);
    }

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

    const ocr = await extractReceiptData(adminClient, receipt.storage_path);

    // OCR totally failed to find the basics - flag for a human, don't reject
    // outright (might just be a bad photo, not fraud).
    if (!ocr.merchant || ocr.total <= 0) {
      await markReceipt(adminClient, receipt.id, {
        status: "flagged_for_review",
        status_reason: "We couldn't read this receipt clearly. It's been flagged for manual review.",
        ocr_raw: ocr.raw,
      });
      return jsonResponse({ error: "Could not read this receipt clearly - flagged for review" }, 422);
    }

    if (ocr.lineItems.length > 0) {
      await adminClient.from("receipt_items").insert(
        ocr.lineItems.map((item) => ({
          receipt_id: receipt.id,
          description: item.description,
          unit_price: item.unitPrice,
          quantity: item.quantity,
        }))
      );
    }

    if (!verifyLineItemMath(ocr)) {
      await markReceipt(adminClient, receipt.id, {
        status: "rejected",
        status_reason: "The item totals didn't match the receipt total. Please retake a clearer photo and try again.",
        merchant_name: ocr.merchant,
        receipt_total: ocr.total,
        tax_amount: ocr.tax,
        tip_amount: ocr.tip,
        purchase_date: ocr.date,
        ocr_raw: ocr.raw,
      });
      return jsonResponse({ error: "Item totals didn't match the receipt total" }, 422);
    }

    const fingerprintHash = await computeFingerprint(ocr.merchant, ocr.total, ocr.date);

    const { data: fingerprintMatches } = await adminClient
      .from("receipts")
      .select("id, user_id")
      .eq("fingerprint_hash", fingerprintHash)
      .neq("id", receipt.id);

    const sameUserMatch = fingerprintMatches?.find((m) => m.user_id === userId);
    const otherUserMatch = fingerprintMatches?.find((m) => m.user_id !== userId);

    if (sameUserMatch) {
      await markReceipt(adminClient, receipt.id, {
        status: "rejected",
        status_reason: "This bill has already been rewarded on your account.",
        merchant_name: ocr.merchant,
        receipt_total: ocr.total,
        tax_amount: ocr.tax,
        tip_amount: ocr.tip,
        purchase_date: ocr.date,
        fingerprint_hash: fingerprintHash,
        ocr_raw: ocr.raw,
      });
      return jsonResponse({ error: "This receipt has already been processed" }, 409);
    }

    if (otherUserMatch) {
      // Same receipt content submitted by a DIFFERENT account - don't auto-reject
      // (could be a shared bill or a real fraud attempt), flag for a human.
      await markReceipt(adminClient, receipt.id, {
        status: "flagged_for_review",
        status_reason: "Receipt flagged for manual review.",
        merchant_name: ocr.merchant,
        receipt_total: ocr.total,
        tax_amount: ocr.tax,
        tip_amount: ocr.tip,
        purchase_date: ocr.date,
        fingerprint_hash: fingerprintHash,
        ocr_raw: ocr.raw,
      });
      return jsonResponse({ message: "Receipt flagged for manual review" }, 200);
    }

    if (await isDeepDuplicate(adminClient, receipt.id, ocr)) {
      await markReceipt(adminClient, receipt.id, {
        status: "rejected",
        status_reason: "This bill appears to duplicate a previous submission.",
        merchant_name: ocr.merchant,
        receipt_total: ocr.total,
        tax_amount: ocr.tax,
        tip_amount: ocr.tip,
        purchase_date: ocr.date,
        fingerprint_hash: fingerprintHash,
        ocr_raw: ocr.raw,
      });
      return jsonResponse({ error: "Duplicate receipt content detected" }, 409);
    }

    const points = Math.round(ocr.total * (REWARD_RATE_PERCENT / 100) * 100);

    const { error: rpcError } = await adminClient.rpc("credit_points_for_receipt", {
      p_receipt_id: receipt.id,
      p_merchant_name: ocr.merchant,
      p_receipt_total: ocr.total,
      p_purchase_date: ocr.date,
      p_tax_amount: ocr.tax,
      p_tip_amount: ocr.tip,
      p_fingerprint_hash: fingerprintHash,
      p_ocr_raw: ocr.raw,
      p_points: points,
    });

    if (rpcError) {
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

async function markReceipt(
  adminClient: SupabaseClient,
  receiptId: string,
  fields: Record<string, unknown>
) {
  await adminClient
    .from("receipts")
    .update({ ...fields, processed_at: new Date().toISOString() })
    .eq("id", receiptId);
}

function verifyLineItemMath(ocr: OcrResult): boolean {
  if (ocr.lineItems.length === 0) {
    // No parsed line items to check against - don't block on this alone.
    return true;
  }
  const itemsTotal = ocr.lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const calculatedTotal = itemsTotal + (ocr.tax ?? 0) + (ocr.tip ?? 0);
  const variance = Math.abs(ocr.total - calculatedTotal);
  return variance <= MATH_TOLERANCE_DOLLARS;
}

async function computeFingerprint(merchant: string, total: number, date: string): Promise<string> {
  const composite = `${merchant}_${total.toFixed(2)}_${date}`;
  const bytes = new TextEncoder().encode(composite);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isDeepDuplicate(
  adminClient: SupabaseClient,
  receiptId: string,
  ocr: OcrResult
): Promise<boolean> {
  if (ocr.lineItems.length === 0) return false;

  const { data: candidates } = await adminClient
    .from("receipt_items")
    .select("description, unit_price, receipts!inner(id, merchant_name, receipt_total, purchase_date)")
    .eq("receipts.merchant_name", ocr.merchant)
    .eq("receipts.receipt_total", ocr.total)
    .eq("receipts.purchase_date", ocr.date)
    .neq("receipts.id", receiptId);

  if (!candidates || candidates.length === 0) return false;

  let matched = 0;
  for (const item of ocr.lineItems) {
    const hasMatch = candidates.some(
      (c) => c.description === item.description && Number(c.unit_price) === item.unitPrice
    );
    if (hasMatch) matched++;
  }

  return matched / ocr.lineItems.length >= DEEP_DUPLICATE_THRESHOLD;
}

// Strips manager/cashier names, phone numbers, and non-standard punctuation
// that Textract sometimes bundles into the merchant name field.
function normalizeVendor(rawVendor: string | undefined): string | null {
  if (!rawVendor || !rawVendor.trim()) return null;
  let clean = rawVendor.toUpperCase().replace(/[\r\n]+/g, " ").trim();
  clean = clean.replace(/(MGR|MANAGER|STST|STORE|CASHIER|OP|HOST|TELLER|SERVED BY).*/i, "").trim();
  clean = clean.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "").trim();
  clean = clean.replace(/[^A-Z0-9\s&'-]/g, "").trim();
  clean = clean.replace(/\s+/g, " ").trim();
  return clean || null;
}

async function extractReceiptData(adminClient: SupabaseClient, storagePath: string): Promise<OcrResult> {
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

  const expenseDoc = response.ExpenseDocuments?.[0];
  const summaryFields = expenseDoc?.SummaryFields ?? [];
  const findField = (type: string) =>
    summaryFields.find((f) => f.Type?.Text === type)?.ValueDetection?.Text;

  const merchant = normalizeVendor(findField("VENDOR_NAME") ?? findField("MERCHANT_NAME"));

  const totalText = findField("TOTAL");
  const total = totalText ? parseFloat(totalText.replace(/[^0-9.]/g, "")) : 0;

  const taxText = findField("TAX");
  const tax = taxText ? parseFloat(taxText.replace(/[^0-9.]/g, "")) : null;

  const tipText = findField("GRATUITY") ?? findField("TIP");
  const tip = tipText ? parseFloat(tipText.replace(/[^0-9.]/g, "")) : null;

  const dateText = findField("INVOICE_RECEIPT_DATE");
  const date = normalizeDate(dateText);

  const lineItems: LineItem[] = [];
  for (const group of expenseDoc?.LineItemGroups ?? []) {
    for (const lineItem of group.LineItems ?? []) {
      const fields = lineItem.LineItemExpenseFields ?? [];
      const description = fields.find((f) => f.Type?.Text === "ITEM")?.ValueDetection?.Text;
      const priceText = fields.find((f) => f.Type?.Text === "PRICE")?.ValueDetection?.Text;
      const quantityText = fields.find((f) => f.Type?.Text === "QUANTITY")?.ValueDetection?.Text;

      const unitPrice = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, "")) : NaN;
      if (!description || !Number.isFinite(unitPrice)) continue;

      const quantity = quantityText ? parseInt(quantityText.replace(/[^0-9]/g, ""), 10) : 1;
      lineItems.push({
        description: description.trim(),
        unitPrice,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      });
    }
  }

  return {
    merchant,
    total: Number.isFinite(total) ? total : 0,
    tax: tax !== null && Number.isFinite(tax) ? tax : null,
    tip: tip !== null && Number.isFinite(tip) ? tip : null,
    date,
    lineItems,
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
