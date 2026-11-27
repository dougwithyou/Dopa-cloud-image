import { requireCreator } from "@/lib/auth";
import { PLANS, formatPrice } from "@/lib/plans";
import { trialDaysLeft } from "@/lib/subscription";
import { formatBytes, formatDate } from "@/lib/format";
import { getUsage } from "@/lib/limits";
import { UsageMeter } from "@/components/usage-meter";
import { PlanPicker } from "@/components/plan-picker";
import { SubmitButton } from "@/components/submit-button";
import { BusinessNameForm } from "../forms";
import { CheckIcon } from "@/components/icons";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.account.billing.meta };
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { creator } = await requireCreator();
  const { notice } = await searchParams;
  const { t, locale } = await getI18n();
  const b = t.account.billing;
  const plan = PLANS[creator.plan];
  const days = trialDaysLeft(creator);
  const canceled = creator.subscription_status === "canceled";
  const usage = await getUsage(creator.id);
  const freeBytes = Math.max(0, creator.storage_limit_bytes - usage.storageUsedBytes);

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="dash-title">{b.title}</h1>

      {notice === "use-portal" ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {b.usePortal}
        </p>
      ) : null}

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">{b.usage}</h2>
        <UsageMeter label={b.storage} used={usage.storageUsedBytes} limit={creator.storage_limit_bytes} format={formatBytes} unlimitedLabel={t.dash.unlimited} />
        <p className="-mt-2 text-xs text-neutral-500">{b.freeLeft(formatBytes(freeBytes))}</p>
        <UsageMeter label={b.clients} used={usage.clientCount} limit={creator.client_limit} unlimitedLabel={t.dash.unlimited} />
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">{b.subscription}</h2>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">{b.currentPlan}</p>
            <p className="text-xl font-semibold">
              {plan.name} · {formatPrice(plan)}
              {b.perMonth}
            </p>
          </div>
          <span className="badge bg-neutral-100 text-neutral-700">{t.labels.subscriptionStatus[creator.subscription_status]}</span>
        </div>

        {days !== null ? (
          <div className="rounded-xl bg-neutral-50 p-4">
            <p className="text-3xl font-bold">{days}</p>
            <p className="text-sm text-neutral-600">
              {b.trialLeft(days, formatDate(creator.trial_ends_at, locale))}
            </p>
          </div>
        ) : null}

        {creator.subscription_status === "past_due" ? (
          <p className="text-sm text-red-700">
            {b.pastDue}
            {creator.portal_access_until ? b.clientsKeepUntil(formatDate(creator.portal_access_until, locale)) : ""}
          </p>
        ) : null}

        <ul className="text-sm text-neutral-600">
          {t.labels.planHighlights[creator.plan].map((h) => (
            <li key={h} className="flex items-start gap-1.5"><CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />{h}</li>
          ))}
        </ul>

        {creator.stripe_customer_id ? (
          <form action="/api/stripe/portal" method="post">
            <SubmitButton className="btn-primary" pendingLabel={b.opening}>
              {b.manage}
            </SubmitButton>
          </form>
        ) : null}
      </section>

      {canceled ? (
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">{b.reactivate}</h2>
          <p className="text-sm text-neutral-600">
            {b.reactivateText}
            {creator.portal_access_until ? b.portalsUntil(formatDate(creator.portal_access_until, locale)) : ""}
          </p>
          <form action="/api/stripe/checkout" method="post" className="space-y-4">
            <PlanPicker defaultPlan={creator.plan} />
            <SubmitButton className="btn-brand" pendingLabel={b.openingCheckout}>
              {b.subscribe}
            </SubmitButton>
          </form>
        </section>
      ) : null}

      <section className="card p-6">
        <h2 className="mb-4 font-semibold">{b.business}</h2>
        <BusinessNameForm value={creator.business_name} />
      </section>
    </div>
  );
}
