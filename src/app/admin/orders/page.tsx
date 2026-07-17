"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OrderItem = {
  quantity: number;
  points_cost_each: number;
  gifts: { name: string } | null;
};

type Order = {
  id: string;
  user_id: string;
  total_points_cost: number;
  status: "pending" | "fulfilled" | "failed" | "cancelled";
  tracking_number: string | null;
  created_at: string;
  items: OrderItem[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadOrders() {
    const supabase = createClient();
    const { data: orderRows } = await supabase
      .from("redemption_orders")
      .select("id, user_id, total_points_cost, status, tracking_number, created_at")
      .order("created_at", { ascending: false });

    const { data: itemRows } = await supabase
      .from("redemption_order_items")
      .select("order_id, quantity, points_cost_each, gifts(name)");

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const item of itemRows ?? []) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push({
        quantity: item.quantity,
        points_cost_each: item.points_cost_each,
        gifts: item.gifts as unknown as { name: string } | null,
      });
      itemsByOrder.set(item.order_id, list);
    }

    setOrders(
      (orderRows ?? []).map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      }))
    );
    setIsLoading(false);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: orderRows } = await supabase
        .from("redemption_orders")
        .select("id, user_id, total_points_cost, status, tracking_number, created_at")
        .order("created_at", { ascending: false });

      const { data: itemRows } = await supabase
        .from("redemption_order_items")
        .select("order_id, quantity, points_cost_each, gifts(name)");

      const itemsByOrder = new Map<string, OrderItem[]>();
      for (const item of itemRows ?? []) {
        const list = itemsByOrder.get(item.order_id) ?? [];
        list.push({
          quantity: item.quantity,
          points_cost_each: item.points_cost_each,
          gifts: item.gifts as unknown as { name: string } | null,
        });
        itemsByOrder.set(item.order_id, list);
      }

      setOrders(
        (orderRows ?? []).map((order) => ({
          ...order,
          items: itemsByOrder.get(order.id) ?? [],
        }))
      );
      setIsLoading(false);
    }
    load();
  }, []);

  async function updateOrder(id: string, fields: { status?: Order["status"]; tracking_number?: string }) {
    const supabase = createClient();
    await supabase.from("redemption_orders").update(fields).eq("id", id);
    await loadOrders();
  }

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.length === 0 && <p className="text-sm text-zinc-500">No orders yet.</p>}
      {orders.map((order) => (
        <div
          key={order.id}
          className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-mono text-xs text-zinc-500">{order.user_id.slice(0, 8)}</span>
              <span className="ml-3 text-zinc-500">
                {new Date(order.created_at).toLocaleString()}
              </span>
            </div>
            <span className="font-semibold">{order.total_points_cost} pts</span>
          </div>

          <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
            {order.items.map((item, i) => (
              <li key={i}>
                {item.quantity}x {item.gifts?.name ?? "Unknown gift"} ({item.points_cost_each} pts each)
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              defaultValue={order.status}
              onChange={(e) =>
                updateOrder(order.id, { status: e.target.value as Order["status"] })
              }
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="pending">Pending</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              placeholder="Tracking number"
              defaultValue={order.tracking_number ?? ""}
              onBlur={(e) => updateOrder(order.id, { tracking_number: e.target.value })}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
