import Link from "next/link";
import { apiAdminListWallets } from "@/lib/api/client";
import ExportCsvButton from "./ExportCsvButton";

export default async function WalletsPage() {
  const wallets = await apiAdminListWallets();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{wallets.length} wallets</p>
        <ExportCsvButton wallets={wallets} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Balance</th>
              <th className="p-3">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((w) => (
              <tr key={w.userId} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="p-3">
                  <Link href={`/admin/users/${w.userId}`} className="text-blue-600 hover:underline">
                    {w.displayName ?? "—"}
                  </Link>
                </td>
                <td className="p-3">{w.email}</td>
                <td className="p-3 font-semibold">{w.balance}</td>
                <td className="p-3 text-zinc-500">{new Date(w.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
