import { requireCreator } from "@/lib/auth";
import { PLANS, formatPrice } from "@/lib/plans";
import { STATUS_LABEL, trialDaysLeft } from "@/lib/subscription";
import { formatDate } from "@/lib/format";
import { PlanPicker } from "@/components/plan-picker";
import { SubmitButton } from "@/components/submit-button";
import { BusinessNameForm } from "../forms";

export const metadata = { title: "Suscripción" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { creator } = await requireCreator();
  const { notice } = await searchParams;
  const plan = PLANS[creator.plan];
  const days = trialDaysLeft(creator);
  const canceled = creator.subscription_status === "canceled";

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Suscripción</h1>

      {notice === "use-portal" ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ya tienes una suscripción. Cambia de plan desde “Gestionar suscripción”.
        </p>
      ) : null}

      <section className="card space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Plan actual</p>
            <p className="text-xl font-semibold">
              {plan.name} · {formatPrice(plan)}/mes
            </p>
          </div>
          <span className="badge bg-neutral-100 text-neutral-700">{STATUS_LABEL[creator.subscription_status]}</span>
        </div>

        {days !== null ? (
          <div className="rounded-xl bg-neutral-50 p-4">
            <p className="text-3xl font-bold">{days}</p>
            <p className="text-sm text-neutral-600">
              {days === 1 ? "día restante" : "días restantes"} de prueba. El primer cobro será el{" "}
              {formatDate(creator.trial_ends_at)}.
            </p>
          </div>
        ) : null}

        {creator.subscription_status === "past_due" ? (
          <p className="text-sm text-red-700">
            El último cobro falló. Actualiza tu tarjeta para reactivar las subidas.
            {creator.portal_access_until ? ` Tus clientes conservan acceso hasta el ${formatDate(creator.portal_access_until)}.` : ""}
          </p>
        ) : null}

        <ul className="text-sm text-neutral-600">
          {plan.highlights.map((h) => (
            <li key={h}>✓ {h}</li>
          ))}
        </ul>

        {creator.stripe_customer_id ? (
          <form action="/api/stripe/portal" method="post">
            <SubmitButton className="btn-primary" pendingLabel="Abriendo…">
              Gestionar suscripción (cambiar plan, tarjeta o cancelar)
            </SubmitButton>
          </form>
        ) : null}
      </section>

      {canceled ? (
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Reactivar suscripción</h2>
          <p className="text-sm text-neutral-600">
            Elige un plan para volver a subir archivos.
            {creator.portal_access_until ? ` Tus clientes ven sus portales hasta el ${formatDate(creator.portal_access_until)}.` : ""}
          </p>
          <form action="/api/stripe/checkout" method="post" className="space-y-4">
            <PlanPicker defaultPlan={creator.plan} />
            <SubmitButton className="btn-brand" pendingLabel="Abriendo pago…">
              Suscribirme
            </SubmitButton>
          </form>
        </section>
      ) : null}

      <section className="card p-6">
        <h2 className="mb-4 font-semibold">Tu negocio</h2>
        <BusinessNameForm value={creator.business_name} />
      </section>
    </div>
  );
}
