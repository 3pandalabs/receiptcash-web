import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const testEmail = `test-${Date.now()}@gmail.com`;
const testPassword = "TestPassword123!";

console.log("1. Signing up test user:", testEmail);
let session;
{
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  if (signUpError) throw signUpError;
  session = signUpData.session;
  if (!session) {
    throw new Error("Signup succeeded but no session returned - email confirmation may still be required");
  }
}
const userId = session.user.id;
console.log("   User ID:", userId);

console.log("2. Uploading test receipt image to storage");
const imageBuffer = readFileSync(
  "C:/Users/Anil/AppData/Local/Temp/claude/C--Users-Anil/96079cd7-1d4d-49b2-89b9-b0b04e94bfb3/scratchpad/test-receipt.jpg"
);
const contentHash = crypto.createHash("sha256").update(imageBuffer).digest("hex");
const storagePath = `${userId}/${contentHash}.jpg`;

const { error: uploadError } = await supabase.storage
  .from("receipts")
  .upload(storagePath, imageBuffer, { contentType: "image/jpeg" });
if (uploadError) throw uploadError;
console.log("   Uploaded to:", storagePath);

console.log("3. Inserting receipts row");
const { data: receipt, error: insertError } = await supabase
  .from("receipts")
  .insert({ user_id: userId, storage_path: storagePath, content_hash: contentHash })
  .select("id")
  .single();
if (insertError) throw insertError;
console.log("   Receipt ID:", receipt.id);

console.log("4. Invoking process-receipt Edge Function");
const { data: fnData, error: fnError } = await supabase.functions.invoke("process-receipt", {
  body: { receiptId: receipt.id },
  headers: { Authorization: `Bearer ${session.access_token}` },
});
if (fnError) {
  console.error("   Function error:", fnError);
  if (fnError.context) {
    const text = await fnError.context.text().catch(() => null);
    console.error("   Response body:", text);
  }
  process.exit(1);
}
console.log("   Function response:", fnData);

console.log("5. Checking final receipt + balance state");
const { data: finalReceipt } = await supabase
  .from("receipts")
  .select("status, merchant_name, receipt_total, purchase_date")
  .eq("id", receipt.id)
  .single();
console.log("   Receipt:", finalReceipt);

const { data: balance } = await supabase
  .from("points_balances")
  .select("balance")
  .eq("user_id", userId)
  .maybeSingle();
console.log("   Balance:", balance);
