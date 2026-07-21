"use client";

import { useRouter } from "next/navigation";
import type { RedemptionOrder } from "@/lib/api/client";
import { updateOrder } from "./actions";

export default function OrdersClient({ initialOrders }: { initialOrders: RedemptionOrder[] }) {
  const router = useRouter();

  async function handleUpdate(id: string, fields: { status?: RedemptionOrder["status"]; trackingNumber?: string }) {
    await updateOrder(id, fields);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {initialOrders.length === 0 && <p className="text-sm text-zinc-500">No orders yet.</p>}
      {initialOrders.map((order) => (
        <div key={order.id} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-mono text-xs text-zinc-500">{order.userId.slice(0, 8)}</span>
              <span className="ml-3 text-zinc-500">{new Date(order.createdAt).toLocaleString()}</span>
            </div>
            <span className="font-semibold">{order.totalPointsCost} pts</span>
          </div>

          <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
            {order.items.map((item, i) => (
              <li key={i}>
                {item.quantity}x {item.gift?.name ?? "Unknown gift"} ({item.pointsCostEach} pts each)
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              defaultValue={order.status}
              onChange={(e) => handleUpdate(order.id, { status: e.target.value as RedemptionOrder["status"] })}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="pending">Pending</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              placeholder="Tracking number"
              defaultValue={order.trackingNumber ?? ""}
              onBlur={(e) => handleUpdate(order.id, { trackingNumber: e.target.value })}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
