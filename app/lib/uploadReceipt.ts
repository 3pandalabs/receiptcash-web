import * as Crypto from "expo-crypto";
// SDK 54+ moved the string-based API to a class-based File/Directory API;
// the legacy import path is Expo's documented compatibility shim.
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import { supabase } from "./supabase";

export async function uploadReceipt(userId: string, imageUri: string): Promise<string> {
  const base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });

  const contentHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);

  const storagePath = `${userId}/${contentHash}.jpg`;

  const response = await fetch(imageUri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, blob, { contentType: "image/jpeg", upsert: false });

  if (uploadError && !uploadError.message.includes("already exists")) {
    throw uploadError;
  }

  const { data: receipt, error: insertError } = await supabase
    .from("receipts")
    .insert({ user_id: userId, storage_path: storagePath, content_hash: contentHash })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation on (user_id, content_hash) means this exact image was
    // already uploaded before - surface that clearly rather than a generic error.
    if (insertError.code === "23505") {
      throw new Error("This receipt has already been uploaded.");
    }
    throw insertError;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { error: fnError } = await supabase.functions.invoke("process-receipt", {
    body: { receiptId: receipt.id },
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (fnError) {
    // supabase-js's default error message ("Edge Function returned a non-2xx
    // status code") hides the actual JSON error body the function returned -
    // read it from the raw Response on `context` to surface the real reason.
    const context = (fnError as { context?: Response }).context;
    if (context) {
      let body: { error?: string } | null = null;
      try {
        body = await context.json();
      } catch {
        // context wasn't valid JSON - fall through to the generic error below.
      }
      if (body) {
        throw new Error(body.error ?? JSON.stringify(body));
      }
    }
    throw fnError;
  }

  return receipt.id as string;
}
