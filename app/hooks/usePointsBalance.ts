import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export function usePointsBalance() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Multiple screens (Home, Redeem) can have this hook mounted simultaneously
  // in a tab navigator - each instance needs its own channel name, otherwise
  // two subscriptions with the same name collide in the realtime client.
  const instanceId = useId();

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("points_balances")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    setBalance(data?.balance ?? 0);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();

    // Live updates: points_balances changes the moment a receipt is credited
    // or a redemption is processed, via the trigger in 0001_init_schema.sql.
    const channel = supabase
      .channel(`points_balances:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "points_balances", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, instanceId]);

  return { balance, isLoading, refresh };
}
