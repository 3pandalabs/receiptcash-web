"use client";

import type { Wallet } from "@/lib/api/client";

export default function ExportCsvButton({ wallets }: { wallets: Wallet[] }) {
  function exportCsv() {
    const header = "Name,Email,User ID,Balance,Last Updated\n";
    const rows = wallets
      .map((w) => `${w.displayName ?? ""},${w.email},${w.userId},${w.balance},${w.updatedAt}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallets.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={exportCsv}
      className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      Export CSV
    </button>
  );
}
