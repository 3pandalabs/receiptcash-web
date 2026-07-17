"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Wallet = {
  user_id: string;
  balance: number;
  updated_at: string;
};

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("points_balances")
        .select("user_id, balance, updated_at")
        .order("balance", { ascending: false });
      setWallets(data ?? []);
      setIsLoading(false);
    }
    load();
  }, []);

  function exportCsv() {
    const header = "User ID,Balance,Last Updated\n";
    const rows = wallets
      .map((w) => `${w.user_id},${w.balance},${w.updated_at}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallets.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{wallets.length} wallets</p>
        <button
          onClick={exportCsv}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="p-3">User</th>
              <th className="p-3">Balance</th>
              <th className="p-3">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((w) => (
              <tr key={w.user_id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="p-3 font-mono text-xs">{w.user_id}</td>
                <td className="p-3 font-semibold">{w.balance}</td>
                <td className="p-3 text-zinc-500">{new Date(w.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
