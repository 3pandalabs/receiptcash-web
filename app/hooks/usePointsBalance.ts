import { useCallback, useEffect, useState } from "react";
import { getBalance } from "../lib/api";
import { useAuth } from "./useAuth";

// No realtime push channel in the self-hosted backend (see api/ROUTES.md) -
// poll instead. 8s strikes a balance between feeling live and not hammering
// the API; multiple screens (Home, Redeem) can each mount this hook
// independently, each running its own interval.
const POLL_INTERVAL_MS = 8000;

export function usePointsBalance() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const data = await getBalance();
    setBalance(data.balance);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  return { balance, isLoading, refresh };
}
