import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

// R2 is S3-compatible; the AWS SDK v3 client works against it unchanged by
// pointing endpoint at the account's R2 endpoint.
export const r2 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  // AWS SDK v3 defaults to always attaching a CRC32 request checksum, which
  // R2 doesn't honor the same way S3 does - presigned PUT URLs come back
  // AccessDenied for any client that doesn't replicate the exact checksum
  // added at signing time. Only compute one when a command explicitly asks.
  requestChecksumCalculation: "WHEN_REQUIRED",
});

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 10 * 60; // matches the old Supabase signed-URL TTL

export function presignUpload(key: string): Promise<string> {
  return getSignedUrl(r2, new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
}

export function presignDownload(key: string): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

// Server-side fetch of the uploaded receipt image bytes — needed by the
// process-receipt route to hand the image to Textract.
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  const body = res.Body;
  if (!body) throw new Error(`R2 object not found: ${key}`);
  const chunks: Uint8Array[] = [];
  // @ts-expect-error - Body is a Node Readable in the Node runtime
  for await (const chunk of body) {
    chunks.push(chunk as Uint8Array);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function deleteObject(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

// A caller may read/write a key only if it's under their own user-id prefix.
// Unlike NRIGhar, ReceiptCash has no cross-owner sharing concept.
export function keyOwnerUserId(key: string): string | null {
  const prefix = key.split("/")[0];
  return prefix && /^[0-9a-f-]{36}$/i.test(prefix) ? prefix : null;
}
