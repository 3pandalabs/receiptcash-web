// Supabase's storage/postgrest/functions errors aren't always `instanceof Error`,
// so a plain `err instanceof Error` check silently swallows their message and
// falls back to a useless "Unknown error". This extracts a message from any
// error-like shape before giving up.
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
