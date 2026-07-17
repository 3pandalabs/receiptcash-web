import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: balanceRow }, { data: receipts }, { data: orders }, { data: profile }] =
    await Promise.all([
      supabase.from("points_balances").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("receipts")
        .select("id, merchant_name, receipt_total, status, status_reason, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("redemption_orders")
        .select("id, total_points_cost, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">{user.email}</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your account</h1>
        </div>
        <div className="flex items-center gap-3">
          {profile?.is_admin && (
            <Link
              href="/admin"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Admin
            </Link>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 p-8 text-center text-white dark:bg-white dark:text-zinc-900">
        <p className="text-sm text-zinc-400 dark:text-zinc-600">Points balance</p>
        <p className="text-5xl font-semibold">{balanceRow?.balance ?? 0}</p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-600">1 point = $0.01 cashback</p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Recent receipts
        </h2>
        {receipts && receipts.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="block">{r.merchant_name ?? "Processing..."}</span>
                  {r.status_reason && (
                    <span className="mt-0.5 block text-xs text-red-600">{r.status_reason}</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {r.receipt_total != null && <span>${Number(r.receipt_total).toFixed(2)}</span>}
                  <span className="capitalize text-zinc-500">
                    {r.status === "flagged_for_review" ? "In review" : r.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No receipts yet - scan one from the ReceiptCash mobile app.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Recent redemptions
        </h2>
        {orders && orders.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Order {o.id.slice(0, 8)}</span>
                <span className="flex items-center gap-3">
                  <span>{o.total_points_cost} pts</span>
                  <span className="capitalize text-zinc-500">{o.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No redemptions yet.</p>
        )}
      </section>

      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
        &larr; Back to home
      </Link>
    </div>
  );
}
