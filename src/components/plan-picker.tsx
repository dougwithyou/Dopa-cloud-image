import { PLANS, PLAN_IDS, formatPrice, type PlanId } from "@/lib/plans";
import { CheckIcon } from "@/components/icons";
import { getI18n } from "@/i18n/server";

/** Tarjetas de selección de plan (radio inputs nativos, sin JS). */
export async function PlanPicker({ defaultPlan = "medium" }: { defaultPlan?: PlanId }) {
  const { t } = await getI18n();
  return (
    <fieldset className="grid gap-3 sm:grid-cols-3">
      <legend className="label mb-2">{t.auth.onboarding.choosePlan}</legend>
      {PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        return (
          <label
            key={id}
            className="card relative flex cursor-pointer flex-col gap-2 p-4 transition has-[:checked]:border-neutral-900 has-[:checked]:ring-2 has-[:checked]:ring-neutral-900/10"
          >
            <input type="radio" name="plan" value={id} defaultChecked={id === defaultPlan} className="sr-only" />
            <span className="text-sm font-semibold">{plan.name}</span>
            <span className="text-2xl font-bold">
              {formatPrice(plan)}
              <span className="text-sm font-normal text-neutral-500">{t.auth.onboarding.perMonth}</span>
            </span>
            <ul className="space-y-1 text-xs text-neutral-600">
              {t.labels.planHighlights[id].map((h) => (
                <li key={h} className="flex items-start gap-1.5"><CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />{h}</li>
              ))}
            </ul>
          </label>
        );
      })}
    </fieldset>
  );
}
