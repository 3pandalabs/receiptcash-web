import { useCallback, useEffect, useState } from "react";
import { getReceipts, type ApiReceipt } from "../lib/api";
import { useAuth } from "./useAuth";

export type Receipt = ApiReceipt;

// No realtime push channel in the self-hosted backend (see api/ROUTES.md) -
// poll instead while this screen is mounted.
const POLL_INTERVAL_MS = 8000;

export function useReceipts() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const data = await getReceipts();
    setReceipts(data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  return { receipts, isLoading, refresh };
}
