import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/env";
import { LanguageSwitch } from "@/components/language-switch";
import { getI18n } from "@/i18n/server";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/portal");
  const { t } = await getI18n();
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/portal" className="text-lg font-bold tracking-tight">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitch className="text-neutral-500" />
            <form action="/auth/signout" method="post">
              <button className="text-sm text-neutral-500 hover:text-neutral-900">{t.portal.signOut}</button>
            </form>
          </div>
        </div>
      </header>
      {/* Cada página define su ancho: la lista es estrecha, las plantillas ocupan más. */}
      <main>{children}</main>
    </div>
  );
}
