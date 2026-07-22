import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { AnalyzeExpenseCommand, TextractClient } from "@aws-sdk/client-textract";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, pool, schema } from "../db/index.js";
import { env } from "../env.js";
import { requireAuth } from "../auth/plugin.js";
import { getObjectBytes } from "../plugins/r2.js";

// Line-item math must add up to within this tolerance of the stated total
// (tax/tip included) or the receipt is rejected as likely tampered/misread.
const MATH_TOLERANCE_DOLLARS = 5.0;

// A receipt counts as a near-duplicate of a prior one if at least this
// fraction of its line items exactly match a previous receipt's items.
const DEEP_DUPLICATE_THRESHOLD = 0.75;

const textractClient = new TextractClient({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
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

const createReceiptBody = z.object({
  storagePath: z.string().min(1),
  contentHash: z.string().min(1),
});

type PgError = Error & { code?: string };

export async function receiptRoutes(app: FastifyInstance) {
  app.post("/receipts", { preHandler: requireAuth, schema: { body: createReceiptBody } }, async (req, reply) => {
    const { storagePath, contentHash } = req.body as z.infer<typeof createReceiptBody>;
    try {
      const [receipt] = await db
        .insert(schema.receipts)
        .values({ userId: req.userId!, storagePath, contentHash, status: "pending" })
        .returning();
      return reply.code(201).send(receipt);
    } catch (err) {
      if ((err as PgError).code === "23505") {
        return reply.code(409).send({ error: "duplicate_upload" });
      }
      throw err;
    }
  });

  app.get("/receipts", { preHandler: requireAuth }, async (req, reply) => {
    const rows = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.userId, req.userId!))
      .orderBy(desc(schema.receipts.createdAt));
    return reply.send(rows);
  });

  app.post("/receipts/:id/process", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [receipt] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, id));
    if (!receipt) return reply.code(404).send({ error: "not_found" });
    if (receipt.userId !== req.userId) return reply.code(404).send({ error: "not_found" });
    if (receipt.status !== "pending") {
      return reply.code(409).send({ error: `Receipt already ${receipt.status}` });
    }

    const ocr = await extractReceiptData(receipt.storagePath);

    // OCR totally failed to find the basics - flag for a human, don't reject
    // outright (might just be a bad photo, not fraud).
    if (!ocr.merchant || ocr.total <= 0) {
      await markReceipt(receipt.id, {
        status: "flagged_for_review",
        statusReason: "We couldn't read this receipt clearly. It's been flagged for manual review.",
        ocrRaw: ocr.raw,
      });
      return reply.code(422).send({ error: "Could not read this receipt clearly - flagged for review" });
    }

    if (ocr.lineItems.length > 0) {
      await db.insert(schema.receiptItems).values(
        ocr.lineItems.map((item) => ({
          receiptId: receipt.id,
          description: item.description,
          unitPrice: item.unitPrice.toString(),
          quantity: item.quantity,
        })),
      );
    }

    if (!verifyLineItemMath(ocr)) {
      await markReceipt(receipt.id, {
        status: "rejected",
        statusReason: "The item totals didn't match the receipt total. Please retake a clearer photo and try again.",
        merchantName: ocr.merchant,
        receiptTotal: ocr.total.toString(),
        taxAmount: ocr.tax?.toString() ?? null,
        tipAmount: ocr.tip?.toString() ?? null,
        purchaseDate: ocr.date,
        ocrRaw: ocr.raw,
      });
      return reply.code(422).send({ error: "Item totals didn't match the receipt total" });
    }

    const fingerprintHash = computeFingerprint(ocr.merchant, ocr.total, ocr.date);

    const fingerprintMatches = await db
      .select({ id: schema.receipts.id, userId: schema.receipts.userId })
      .from(schema.receipts)
      .where(and(eq(schema.receipts.fingerprintHash, fingerprintHash), ne(schema.receipts.id, receipt.id)));

    const sameUserMatch = fingerprintMatches.find((m) => m.userId === req.userId);
    const otherUserMatch = fingerprintMatches.find((m) => m.userId !== req.userId);

    if (sameUserMatch) {
      await markReceipt(receipt.id, {
        status: "rejected",
        statusReason: "This bill has already been rewarded on your account.",
        merchantName: ocr.merchant,
        receiptTotal: ocr.total.toString(),
        taxAmount: ocr.tax?.toString() ?? null,
        tipAmount: ocr.tip?.toString() ?? null,
        purchaseDate: ocr.date,
        fingerprintHash,
        ocrRaw: ocr.raw,
      });
      return reply.code(409).send({ error: "This receipt has already been processed" });
    }

    if (otherUserMatch) {
      // Same receipt content submitted by a DIFFERENT account - don't
      // auto-reject (could be a shared bill or real fraud), flag for a human.
      await markReceipt(receipt.id, {
        status: "flagged_for_review",
        statusReason: "Receipt flagged for manual review.",
        merchantName: ocr.merchant,
        receiptTotal: ocr.total.toString(),
        taxAmount: ocr.tax?.toString() ?? null,
        tipAmount: ocr.tip?.toString() ?? null,
        purchaseDate: ocr.date,
        fingerprintHash,
        ocrRaw: ocr.raw,
      });
      return reply.send({ message: "Receipt flagged for manual review" });
    }

    if (await isDeepDuplicate(receipt.id, ocr)) {
      await markReceipt(receipt.id, {
        status: "rejected",
        statusReason: "This bill appears to duplicate a previous submission.",
        merchantName: ocr.merchant,
        receiptTotal: ocr.total.toString(),
        taxAmount: ocr.tax?.toString() ?? null,
        tipAmount: ocr.tip?.toString() ?? null,
        purchaseDate: ocr.date,
        fingerprintHash,
        ocrRaw: ocr.raw,
      });
      return reply.code(409).send({ error: "Duplicate receipt content detected" });
    }

    const points = Math.round(ocr.total * (env.REWARD_RATE_PERCENT / 100) * 100);

    try {
      await pool.query(
        "select credit_points_for_receipt($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          receipt.id,
          ocr.merchant,
          ocr.total,
          ocr.date,
          ocr.tax,
          ocr.tip,
          fingerprintHash,
          JSON.stringify(ocr.raw),
          points,
        ],
      );
    } catch (err) {
      if ((err as PgError).code === "23505") {
        return reply.send({ message: "Already processed" });
      }
      throw err;
    }

    return reply.send({ pointsCredited: points });
  });
}

async function markReceipt(receiptId: string, fields: Partial<typeof schema.receipts.$inferInsert>) {
  await db
    .update(schema.receipts)
    .set({ ...fields, processedAt: new Date() })
    .where(eq(schema.receipts.id, receiptId));
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

function computeFingerprint(merchant: string, total: number, date: string): string {
  const composite = `${merchant}_${total.toFixed(2)}_${date}`;
  return crypto.createHash("sha256").update(composite).digest("hex");
}

async function isDeepDuplicate(receiptId: string, ocr: OcrResult): Promise<boolean> {
  if (ocr.lineItems.length === 0) return false;

  const candidates = await db
    .select({ description: schema.receiptItems.description, unitPrice: schema.receiptItems.unitPrice })
    .from(schema.receiptItems)
    .innerJoin(schema.receipts, eq(schema.receipts.id, schema.receiptItems.receiptId))
    .where(
      and(
        eq(schema.receipts.merchantName, ocr.merchant!),
        eq(schema.receipts.receiptTotal, ocr.total.toString()),
        eq(schema.receipts.purchaseDate, ocr.date),
        ne(schema.receipts.id, receiptId),
      ),
    );

  if (candidates.length === 0) return false;

  let matched = 0;
  for (const item of ocr.lineItems) {
    const hasMatch = candidates.some(
      (c) => c.description === item.description && Number(c.unitPrice) === item.unitPrice,
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

function normalizeDate(text: string | undefined): string {
  if (text) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

async function extractReceiptData(storagePath: string): Promise<OcrResult> {
  const bytes = await getObjectBytes(storagePath);

  const response = await textractClient.send(new AnalyzeExpenseCommand({ Document: { Bytes: bytes } }));

  const expenseDoc = response.ExpenseDocuments?.[0];
  const summaryFields = expenseDoc?.SummaryFields ?? [];
  const findField = (type: string) => summaryFields.find((f) => f.Type?.Text === type)?.ValueDetection?.Text;

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
