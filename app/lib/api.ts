import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("Missing EXPO_PUBLIC_API_URL - check .env.local");
}

const ACCESS_TOKEN_KEY = "receiptcash_access_token";
const REFRESH_TOKEN_KEY = "receiptcash_refresh_token";

// Tokens live in SecureStore (not AsyncStorage) - this app handles a real
// points/wallet balance, so a leaked refresh token is an account-takeover
// risk, not just a UX nuisance.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  hydrated = true;
}

async function persistTokens(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  hydrated = true;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  hydrated = true;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Set false for the auth endpoints themselves, which never send/expect a bearer token. */
  auth?: boolean;
};

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function refreshAccessToken(): Promise<boolean> {
  await hydrate();
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    await clearTokens();
    return false;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  await persistTokens(data);
  return true;
}

/** Every 401 on an authenticated request gets exactly one refresh-and-retry. */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  await hydrate();
  let res = await rawRequest(path, opts);

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawRequest(path, opts);
    }
  }

  if (!res.ok) {
    let code = "request_failed";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) code = data.error;
    } catch {
      // body wasn't JSON - keep the generic code
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export type AuthUser = { id: string; email: string; isAdmin: boolean };
type AuthResponse = { accessToken: string; refreshToken: string; user: AuthUser };

export async function signup(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const data = await request<AuthResponse>("/auth/signup", {
    method: "POST",
    body: { email, password, displayName },
    auth: false,
  });
  await persistTokens(data);
  return data.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  await persistTokens(data);
  return data.user;
}

export async function logout(): Promise<void> {
  await hydrate();
  if (refreshToken) {
    try {
      await request("/auth/logout", { method: "POST", body: { refreshToken }, auth: false });
    } catch {
      // best-effort server-side revoke - local tokens are cleared regardless
    }
  }
  await clearTokens();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  await hydrate();
  if (!accessToken && !refreshToken) return null;
  try {
    return await request<AuthUser>("/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function getBalance(): Promise<{ balance: number }> {
  return api.get("/balance");
}

export type ApiReceipt = {
  id: string;
  merchantName: string | null;
  receiptTotal: string | null;
  status: "pending" | "processed" | "rejected" | "duplicate" | "flagged_for_review";
  statusReason: string | null;
  createdAt: string;
};

export function getReceipts(): Promise<ApiReceipt[]> {
  return api.get("/receipts");
}

export function createReceipt(body: { storagePath: string; contentHash: string }): Promise<ApiReceipt> {
  return api.post("/receipts", body);
}

export function processReceipt(id: string): Promise<{ pointsCredited?: number; message?: string }> {
  return api.post(`/receipts/${id}/process`);
}

export type ApiGift = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  isActive: boolean;
  stockLevel: number | null;
  imageEmoji: string | null;
};

export function getGifts(): Promise<ApiGift[]> {
  return api.get("/gifts");
}

export function redeemCart(items: { giftId: string; quantity: number }[]): Promise<{ orderId: string }> {
  return api.post("/redemption-orders", { items });
}

export type ApiRedemptionOrderItem = {
  orderId: string;
  quantity: number;
  pointsCostEach: number;
  gift: ApiGift;
};

export type ApiRedemptionOrder = {
  id: string;
  totalPointsCost: number;
  status: "pending" | "fulfilled" | "failed" | "cancelled";
  trackingNumber: string | null;
  createdAt: string;
  items: ApiRedemptionOrderItem[];
};

export function getRedemptionOrders(): Promise<ApiRedemptionOrder[]> {
  return api.get("/redemption-orders");
}

export function presignUpload(key: string): Promise<{ url: string }> {
  return api.post("/storage/presign-upload", { key });
}

export function presignDownload(key: string): Promise<{ url: string }> {
  return api.post("/storage/presign-download", { key });
}
