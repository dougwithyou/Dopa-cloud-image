"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { useI18n } from "@/i18n/client";
import { registerVisitor } from "./actions";

export function GateForm({ token, businessName }: { token: string; businessName: string }) {
  const [state, action] = useActionState(registerVisitor, null);
  const s = useI18n().t.portal.share;
  return (
    <form action={action} className="space-y-4 text-left">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">{s.firstName}</label>
          <input className="input" id="firstName" name="firstName" autoComplete="given-name" required maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="lastName">{s.lastName}</label>
          <input className="input" id="lastName" name="lastName" autoComplete="family-name" required maxLength={80} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">{s.email}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <label className="flex items-start gap-2 text-sm text-neutral-600">
        <input type="checkbox" name="consent" className="mt-1" />
        <span>{s.consent(businessName)}</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingLabel={s.entering}>
        {s.enter}
      </SubmitButton>
      <p className="text-center text-xs text-neutral-400">
        {s.note(businessName)}
      </p>
    </form>
  );
}
