import { useCallback, useEffect, useState } from "react";
import { getGifts, type ApiGift } from "../lib/api";

export type Gift = ApiGift;

export function useGifts() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await getGifts();
    setGifts([...data].sort((a, b) => a.pointsCost - b.pointsCost));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gifts, isLoading, refresh };
}
