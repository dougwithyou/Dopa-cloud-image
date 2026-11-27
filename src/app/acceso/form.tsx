"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { useI18n } from "@/i18n/client";
import { claimAccess } from "./actions";

export function AccessForm({ clientId, isNewUser }: { clientId: string; isNewUser: boolean }) {
  const [state, action] = useActionState(claimAccess, null);
  const { t } = useI18n();
  const a = t.auth.access;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      {isNewUser ? (
        <>
          <input type="hidden" name="requirePassword" value="1" />
          <div>
            <label className="label" htmlFor="password">{a.createPassword}</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <p className="mt-1 text-xs text-neutral-500">{a.passwordHelp}</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">{t.auth.repeatPassword}</label>
            <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
        </>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton pendingLabel={t.auth.signingIn}>{isNewUser ? a.createAndEnter : a.enterPortal}</SubmitButton>
    </form>
  );
}
