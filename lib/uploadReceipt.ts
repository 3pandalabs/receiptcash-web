import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { supabase } from "./supabase";

export async function uploadReceipt(userId: string, imageUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: "base64" });

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
    throw fnError;
  }

  return receipt.id as string;
}
