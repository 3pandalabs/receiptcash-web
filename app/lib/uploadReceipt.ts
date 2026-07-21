import * as Crypto from "expo-crypto";
// SDK 54+ moved the string-based API to a class-based File/Directory API;
// the legacy import path is Expo's documented compatibility shim.
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import { ApiError, createReceipt, presignUpload, processReceipt } from "./api";

export async function uploadReceipt(userId: string, imageUri: string): Promise<string> {
  const base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });

  const contentHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);

  const storagePath = `${userId}/${contentHash}.jpg`;

  const { url: uploadUrl } = await presignUpload(storagePath);

  const response = await fetch(imageUri);
  const blob = await response.blob();

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!putResponse.ok) {
    throw new Error("Failed to upload receipt image.");
  }

  let receiptId: string;
  try {
    const receipt = await createReceipt({ storagePath, contentHash });
    receiptId = receipt.id;
  } catch (err) {
    // Unique violation on (user_id, content_hash) means this exact image was
    // already uploaded before - surface that clearly rather than a generic error.
    if (err instanceof ApiError && err.code === "duplicate_upload") {
      throw new Error("This receipt has already been uploaded.");
    }
    throw err;
  }

  // ApiError.message is already the server's own error string (see
  // api/ROUTES.md's process-receipt outcomes) - no extra unwrapping needed,
  // unlike the old Edge Function's opaque non-2xx wrapper. Propagates as-is.
  await processReceipt(receiptId);

  return receiptId;
}
