import Link from "next/link";
import type { CreatorRow } from "@/types/database";
import { formatDate } from "@/lib/format";

export function SubscriptionBanner({ creator }: { creator: CreatorRow }) {
  // Solo se avisa de problemas de pago (bloquean las subidas). La información
  // de la prueba y del plan vive en Configuración.
  const status = creator.subscription_status;

  if (status === "past_due" || status === "canceled" || status === "incomplete") {
    const message =
      status === "past_due"
        ? "No pudimos cobrar tu suscripción. Las subidas están bloqueadas."
        : status === "canceled"
          ? "Tu suscripción está cancelada. Las subidas están bloqueadas."
          : "Tu suscripción está incompleta. Las subidas están bloqueadas.";
    return (
      <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
        {message}
        {creator.portal_access_until ? ` Tus clientes ven su portal hasta el ${formatDate(creator.portal_access_until)}.` : ""}{" "}
        <Link href="/dashboard/billing" className="font-semibold underline">Resolver</Link>
      </div>
    );
  }
  return null;
}
