import { cookies } from "next/headers";

// INTERNAL_API_URL (server-only, not NEXT_PUBLIC_-prefixed so it's never
// inlined into client bundles) points at a DNS-only hostname for this same
// origin. Same-account Cloudflare Worker subrequests to a Cloudflare-proxied
// hostname get 403'd by Cloudflare's "orange-to-orange" restriction, which
// sits ahead of WAF evaluation and can't be bypassed by a WAF skip rule (see
// nrighar's migration - hit this in production 2026-07-21). Routing through
// the unproxied hostname avoids the same-zone proxy path entirely.
const API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const ACCESS_COOKIE = "receiptcash_access";
const REFRESH_COOKIE = "receiptcash_refresh";

export type ApiUser = { id: string; email: string; isAdmin: boolean };

export type Receipt = {
  id: string;
  merchantName: string | null;
  receiptTotal: string | null;
  status: "pending" | "processed" | "rejected" | "duplicate" | "flagged_for_review";
  statusReason: string | null;
  createdAt: string;
};

export type Gift = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  isActive: boolean;
  stockLevel: number | null;
  imageEmoji: string | null;
};

export type RedemptionOrderItem = { orderId: string; quantity: number; pointsCostEach: number; gift: Gift };
export type RedemptionOrder = {
  id: string;
  userId: string;
  totalPointsCost: number;
  status: "pending" | "fulfilled" | "failed" | "cancelled";
  trackingNumber: string | null;
  createdAt: string;
  items: RedemptionOrderItem[];
};

export type Wallet = { userId: string; email: string; displayName: string | null; balance: number; updatedAt: string };
export type AdminUserDetail = {
  userId: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: string;
  balance: number;
};
export type PointsLedgerEntry = {
  id: string;
  entryType: "credit" | "debit";
  points: number;
  sourceType: "receipt" | "redemption" | "adjustment";
  createdAt: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function rawFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, headers, body, ...rest } = init;
  return fetch(`${API_URL}${path}`, {
    ...rest,
    body,
    headers: {
      ...(body && typeof body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });
}

async function parseOrThrow(res: Response) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? "unknown_error");
  }
  return body;
}

// ---- Cookie-backed token storage (server-only: Server Components / Actions) ----
// Tokens never reach the browser as JS-readable values - httpOnly cookies only.

async function getTokens() {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: store.get(REFRESH_COOKIE)?.value ?? null,
  };
}

async function setTokens(accessToken: string, refreshToken: string) {
  const store = await cookies();
  const common = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
  store.set(ACCESS_COOKIE, accessToken, { ...common, maxAge: 60 * 15 });
  store.set(REFRESH_COOKIE, refreshToken, { ...common, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearTokens() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/**
 * Authenticated fetch for Server Components / Server Actions. Handles the
 * 401 -> refresh -> retry-once flow from api/ROUTES.md automatically.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { accessToken, refreshToken } = await getTokens();
  if (!accessToken) throw new ApiError(401, "not_signed_in");

  let res = await rawFetch(path, { ...init, token: accessToken });

  if (res.status === 401 && refreshToken) {
    const refreshRes = await rawFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    if (refreshRes.ok) {
      const pair = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
      await setTokens(pair.accessToken, pair.refreshToken);
      res = await rawFetch(path, { ...init, token: pair.accessToken });
    }
  }

  return parseOrThrow(res);
}

export async function apiGetCurrentUser(): Promise<ApiUser | null> {
  try {
    return (await apiFetch("/auth/me")) as ApiUser;
  } catch {
    return null;
  }
}

// ---- Auth entry points - call from Server Actions only, they set cookies ----

export async function apiSignup(email: string, password: string, displayName?: string): Promise<ApiUser> {
  const res = await rawFetch("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = (await parseOrThrow(res)) as { accessToken: string; refreshToken: string; user: ApiUser };
  await setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function apiLogin(email: string, password: string): Promise<ApiUser> {
  const res = await rawFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = (await parseOrThrow(res)) as { accessToken: string; refreshToken: string; user: ApiUser };
  await setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function apiLogout(): Promise<void> {
  const { refreshToken } = await getTokens();
  if (refreshToken) {
    await rawFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await clearTokens();
}

// ---- Account-scoped reads ----

export const apiGetBalance = () => apiFetch("/balance") as Promise<{ balance: number }>;
export const apiGetReceipts = () => apiFetch("/receipts") as Promise<Receipt[]>;
export const apiGetRedemptionOrders = () => apiFetch("/redemption-orders") as Promise<RedemptionOrder[]>;
export const apiGetGifts = () => apiFetch("/gifts") as Promise<Gift[]>;

// ---- Admin ----

export const apiAdminListWallets = () => apiFetch("/admin/wallets") as Promise<Wallet[]>;
export const apiAdminGetUser = (id: string) => apiFetch(`/admin/users/${id}`) as Promise<AdminUserDetail>;

export const apiAdminGetUserReceipts = (id: string) => apiFetch(`/admin/users/${id}/receipts`) as Promise<Receipt[]>;
export const apiAdminGetUserOrders = (id: string) =>
  apiFetch(`/admin/users/${id}/redemption-orders`) as Promise<RedemptionOrder[]>;
export const apiAdminGetUserLedger = (id: string) =>
  apiFetch(`/admin/users/${id}/ledger`) as Promise<PointsLedgerEntry[]>;

export const apiAdminListAllOrders = () => apiFetch("/admin/redemption-orders") as Promise<RedemptionOrder[]>;

export const apiAdminListGifts = () => apiFetch("/admin/gifts") as Promise<Gift[]>;
export const apiAdminCreateGift = (input: {
  name: string;
  description?: string | null;
  pointsCost: number;
  stockLevel?: number | null;
  imageEmoji?: string | null;
}) =>
  apiFetch("/admin/gifts", { method: "POST", body: JSON.stringify(input) }) as Promise<Gift>;
export const apiAdminUpdateGift = (id: string, fields: Partial<Gift>) =>
  apiFetch(`/admin/gifts/${id}`, { method: "PATCH", body: JSON.stringify(fields) }) as Promise<Gift>;
export const apiAdminUpdateOrder = (id: string, fields: { status?: string; trackingNumber?: string }) =>
  apiFetch(`/admin/redemption-orders/${id}`, { method: "PATCH", body: JSON.stringify(fields) }) as Promise<RedemptionOrder>;
