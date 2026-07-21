import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ApiError,
  apiAdminGetUser,
  apiAdminGetUserLedger,
  apiAdminGetUserOrders,
  apiAdminGetUserReceipts,
} from "@/lib/api/client";

// apiAdminGetUserReceipts/Orders/Ledger call GET /admin/users/:id/{receipts,
// redemption-orders,ledger}, which do not exist in api/ yet - see the NOTEs
// above those functions in lib/api/client.ts.
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user;
  try {
    user = await apiAdminGetUser(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [receipts, orders, ledger] = await Promise.all([
    apiAdminGetUserReceipts(id),
    apiAdminGetUserOrders(id),
    apiAdminGetUserLedger(id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/wallets" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
          &larr; Back to wallets
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {user.displayName ?? user.email}
            </h1>
            <p className="text-sm text-zinc-500">{user.email}</p>
            <p className="text-xs text-zinc-400">
              Joined {new Date(user.createdAt).toLocaleDateString()}
              {user.isAdmin && " · Admin"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Balance</p>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{user.balance} pts</p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Receipts</h2>
        {receipts.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="block">{r.merchantName ?? "Processing..."}</span>
                  {r.statusReason && (
                    <span className="mt-0.5 block text-xs text-red-600">{r.statusReason}</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {r.receiptTotal != null && <span>${Number(r.receiptTotal).toFixed(2)}</span>}
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
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Redemption orders</h2>
        {orders.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-500">{o.id.slice(0, 8)}</span>
                  <span className="flex items-center gap-3">
                    <span>{o.totalPointsCost} pts</span>
                    <span className="capitalize text-zinc-500">{o.status}</span>
                  </span>
                </div>
                <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
                  {o.items.map((item, i) => (
                    <li key={i}>
                      {item.quantity}x {item.gift?.name ?? "Unknown gift"} ({item.pointsCostEach} pts each)
                    </li>
                  ))}
                </ul>
                {o.trackingNumber && (
                  <p className="mt-2 text-xs text-blue-600">Tracking: {o.trackingNumber}</p>
                )}
                <p className="mt-1 text-xs text-zinc-400">{new Date(o.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No redemption orders.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Points ledger</h2>
        {ledger.length > 0 ? (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="capitalize text-zinc-500">{entry.sourceType}</span>
                <span className={entry.entryType === "credit" ? "text-green-600" : "text-red-600"}>
                  {entry.entryType === "credit" ? "+" : "-"}
                  {entry.points} pts
                </span>
                <span className="text-xs text-zinc-400">{new Date(entry.createdAt).toLocaleString()}</span>
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
