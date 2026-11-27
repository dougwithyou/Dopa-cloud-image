"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { useI18n } from "@/i18n/client";
import { TRIAL_DAYS } from "@/lib/plans";
import { startTrial } from "./actions";

export function OnboardingForm({ businessName, plans }: { businessName?: string; plans: React.ReactNode }) {
  const [state, action] = useActionState(startTrial, null);
  const o = useI18n().t.auth.onboarding;
  return (
    <form action={action} className="space-y-6">
      <div>
        <label className="label" htmlFor="businessName">{o.businessName}</label>
        <input
          className="input"
          id="businessName"
          name="businessName"
          defaultValue={businessName}
          placeholder={o.businessPlaceholder}
          maxLength={120}
          required
        />
        <p className="mt-1 text-xs text-neutral-500">{o.businessHelp}</p>
      </div>
      {plans}
      <FormMessage state={state} />
      <SubmitButton className="btn-brand w-full py-3" pendingLabel={o.opening}>
        {o.start(TRIAL_DAYS)}
      </SubmitButton>
      <p className="text-center text-xs text-neutral-500">
        {o.cardNote}
      </p>
    </form>
  );
}
