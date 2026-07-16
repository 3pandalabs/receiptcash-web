import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          ReceiptCash
        </span>
        <Link
          href="/login"
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white dark:border-zinc-700 dark:text-zinc-50"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Scan your receipts. Earn cashback. Redeem for gifts.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Snap a photo of any receipt, earn points on what you spend, and turn those points into
          real gifts - no coupons or offer activation required.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Get started
          </Link>
        </div>
      </main>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 px-6 pb-24 sm:grid-cols-3">
        <Step number="1" title="Scan" description="Take a photo of any receipt in the app." />
        <Step
          number="2"
          title="Earn"
          description="Get cashback points automatically credited to your balance."
        />
        <Step
          number="3"
          title="Redeem"
          description="Trade your points in for gift cards whenever you're ready."
        />
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-center text-sm text-zinc-500">
        &copy; {new Date().getFullYear()} 3PandaLabs
      </footer>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">
        {number}
      </div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </div>
  );
}
