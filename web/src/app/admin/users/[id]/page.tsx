import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type OrderItem = {
  quantity: number;
  points_cost_each: number;
  gifts: { name: string } | { name: string }[] | null;
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: userRows }, { data: receipts }, { data: orders }, { data: ledger }] =
    await Promise.all([
      supabase.rpc("admin_get_user", { p_user_id: id }),
      supabase
        .from("receipts")
        .select("id, merchant_name, receipt_total, status, status_reason, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("redemption_orders")
        .select(
          "id, total_points_cost, status, tracking_number, created_at, redemption_order_items(quantity, points_cost_each, gifts(name))"
        )
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("points_ledger")
        .select("id, entry_type, points, source_type, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const user = userRows?.[0];
  if (!user) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/wallets" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
          &larr; Back to wallets
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {user.display_name ?? user.email}
            </h1>
            <p className="text-sm text-zinc-500">{user.email}</p>
            <p className="text-xs text-zinc-400">
              Joined {new Date(user.created_at).toLocaleDateString()}
              {user.is_admin && " · Admin"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Balance</p>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {user.balance} pts
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Receipts</h2>
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
          <p className="text-sm text-zinc-500">No receipts.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Redemption orders
        </h2>
        {orders && orders.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-500">{o.id.slice(0, 8)}</span>
                  <span className="flex items-center gap-3">
                    <span>{o.total_points_cost} pts</span>
                    <span className="capitalize text-zinc-500">{o.status}</span>
                  </span>
                </div>
                <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
                  {(o.redemption_order_items as OrderItem[]).map((item, i) => {
                    const gift = Array.isArray(item.gifts) ? item.gifts[0] : item.gifts;
                    return (
                      <li key={i}>
                        {item.quantity}x {gift?.name ?? "Unknown gift"} ({item.points_cost_each} pts
                        each)
                      </li>
                    );
                  })}
                </ul>
                {o.tracking_number && (
                  <p className="mt-2 text-xs text-blue-600">Tracking: {o.tracking_number}</p>
                )}
                <p className="mt-1 text-xs text-zinc-400">
                  {new Date(o.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No redemption orders.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Points ledger
        </h2>
        {ledger && ledger.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="capitalize text-zinc-500">{entry.source_type}</span>
                <span className={entry.entry_type === "credit" ? "text-green-600" : "text-red-600"}>
                  {entry.entry_type === "credit" ? "+" : "-"}
                  {entry.points} pts
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No ledger entries.</p>
        )}
      </section>
    </div>
  );
}
