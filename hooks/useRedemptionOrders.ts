import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export type OrderItem = {
  quantity: number;
  points_cost_each: number;
  gift_name: string;
  image_emoji: string | null;
};

export type RedemptionOrder = {
  id: string;
  total_points_cost: number;
  status: "pending" | "fulfilled" | "failed" | "cancelled";
  tracking_number: string | null;
  created_at: string;
  items: OrderItem[];
};

type OrderRow = {
  id: string;
  total_points_cost: number;
  status: RedemptionOrder["status"];
  tracking_number: string | null;
  created_at: string;
  redemption_order_items: {
    quantity: number;
    points_cost_each: number;
    gifts: { name: string; image_emoji: string | null } | null;
  }[];
};

export function useRedemptionOrders() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [orders, setOrders] = useState<RedemptionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const instanceId = useId();

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("redemption_orders")
      .select(
        "id, total_points_cost, status, tracking_number, created_at, redemption_order_items(quantity, points_cost_each, gifts(name, image_emoji))"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as unknown as OrderRow[];
    setOrders(
      rows.map((row) => ({
        id: row.id,
        total_points_cost: row.total_points_cost,
        status: row.status,
        tracking_number: row.tracking_number,
        created_at: row.created_at,
        items: row.redemption_order_items.map((item) => ({
          quantity: item.quantity,
          points_cost_each: item.points_cost_each,
          gift_name: item.gifts?.name ?? "Unknown gift",
          image_emoji: item.gifts?.image_emoji ?? null,
        })),
      }))
    );
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();

    const channel = supabase
      .channel(`redemption_orders:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "redemption_orders", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, instanceId]);

  return { orders, isLoading, refresh };
}
