import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export type Receipt = {
  id: string;
  merchant_name: string | null;
  receipt_total: number | null;
  status: "pending" | "processed" | "rejected" | "duplicate" | "flagged_for_review";
  status_reason: string | null;
  created_at: string;
};

export function useReceipts() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // See usePointsBalance for why this needs a per-instance-unique channel name.
  const instanceId = useId();

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("receipts")
      .select("id, merchant_name, receipt_total, status, status_reason, created_at")
      .order("created_at", { ascending: false });
    setReceipts(data ?? []);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();

    const channel = supabase
      .channel(`receipts:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "receipts", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, instanceId]);

  return { receipts, isLoading, refresh };
}
