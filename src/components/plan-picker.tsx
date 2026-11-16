import { PLANS, PLAN_IDS, formatPrice, type PlanId } from "@/lib/plans";

/** Tarjetas de selección de plan (radio inputs nativos, sin JS). */
export function PlanPicker({ defaultPlan = "medium" }: { defaultPlan?: PlanId }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-3">
      <legend className="label mb-2">Elige tu plan</legend>
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
              <span className="text-sm font-normal text-neutral-500">/mes</span>
            </span>
            <ul className="space-y-1 text-xs text-neutral-600">
              {plan.highlights.map((h) => (
                <li key={h}>✓ {h}</li>
              ))}
            </ul>
          </label>
        );
      })}
    </fieldset>
  );
}
