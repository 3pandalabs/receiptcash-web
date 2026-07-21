import Link from "next/link";
import { redirect } from "next/navigation";
import { apiGetCurrentUser } from "@/lib/api/client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await apiGetCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.isAdmin) {
    redirect("/account");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Admin</h1>
        <Link href="/account" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
          &larr; Back to account
        </Link>
      </div>

      <nav className="flex gap-4 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <Link href="/admin/catalog" className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50">
          Catalog
        </Link>
        <Link href="/admin/orders" className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50">
          Orders
        </Link>
        <Link href="/admin/wallets" className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50">
          Wallets
        </Link>
      </nav>

      {children}
    </div>
  );
}
