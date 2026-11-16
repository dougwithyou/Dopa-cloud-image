import Link from "next/link";
import type { CreatorRow } from "@/types/database";
import { trialDaysLeft } from "@/lib/subscription";
import { formatDate } from "@/lib/format";

export function SubscriptionBanner({ creator }: { creator: CreatorRow }) {
  const days = trialDaysLeft(creator);
  const status = creator.subscription_status;

  if (status === "trialing" && days !== null) {
    return (
      <div className="bg-neutral-900 px-4 py-2 text-center text-sm text-white">
        {days === 0 ? "Tu prueba termina hoy" : `Te quedan ${days} ${days === 1 ? "día" : "días"} de prueba`} ·{" "}
        <Link href="/dashboard/billing" className="underline">Ver suscripción</Link>
      </div>
    );
  }

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
