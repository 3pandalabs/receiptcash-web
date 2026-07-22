"use server";

import { ApiError, apiLogin, apiSignup } from "@/lib/api/client";

export async function loginAction(email: string, password: string): Promise<{ error: string } | { ok: true }> {
  try {
    await apiLogin(email, password);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.code : "unknown_error" };
  }
}

export async function signupAction(
  email: string,
  password: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    await apiSignup(email, password);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.code : "unknown_error" };
  }
}
