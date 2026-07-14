import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type Gift = {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
};

export function useGifts() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("gifts")
      .select("id, name, description, points_cost")
      .order("points_cost", { ascending: true });
    setGifts(data ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gifts, isLoading, refresh };
}
