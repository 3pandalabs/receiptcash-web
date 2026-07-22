import { useCallback, useEffect, useState } from "react";
import { getRedemptionOrders, type ApiRedemptionOrder } from "../lib/api";
import { useAuth } from "./useAuth";

export type RedemptionOrder = ApiRedemptionOrder;

// No realtime push channel in the self-hosted backend (see api/ROUTES.md) -
// poll instead, so e.g. an admin marking an order fulfilled shows up here
// within one interval rather than instantly.
const POLL_INTERVAL_MS = 8000;

export function useRedemptionOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<RedemptionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const data = await getRedemptionOrders();
    setOrders(data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  return { orders, isLoading, refresh };
}
