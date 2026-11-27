import Link from "next/link";
import type { CreatorRow } from "@/types/database";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/i18n/server";

export async function SubscriptionBanner({ creator }: { creator: CreatorRow }) {
  // Solo se avisa de problemas de pago (bloquean las subidas). La información
  // de la prueba y del plan vive en Configuración.
  const status = creator.subscription_status;

  if (status === "past_due" || status === "canceled" || status === "incomplete") {
    const { t, locale } = await getI18n();
    const b = t.dash.banner;
    const message = b[status];
    return (
      <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
        {message}
        {creator.portal_access_until ? b.portalUntil(formatDate(creator.portal_access_until, locale)) : ""}{" "}
        <Link href="/dashboard/billing" className="font-semibold underline">{b.fix}</Link>
      </div>
    );
  }
  return null;
}
