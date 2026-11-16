import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { APP_NAME } from "@/lib/env";
import { DashboardNav } from "@/components/dashboard-nav";
import { SubscriptionBanner } from "@/components/subscription-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { creator } = await requireCreator();
  return (
    <div className="min-h-dvh">
      <SubscriptionBanner creator={creator} />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between py-3">
            <Link href="/dashboard" className="font-bold">
              {APP_NAME}
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-neutral-500 sm:inline">{creator.business_name}</span>
              <form action="/auth/signout" method="post">
                <button className="btn-ghost px-2 py-1 text-xs">Salir</button>
              </form>
            </div>
          </div>
          <DashboardNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
