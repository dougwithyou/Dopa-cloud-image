"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { startTrial } from "./actions";

export function OnboardingForm({ businessName, plans }: { businessName?: string; plans: React.ReactNode }) {
  const [state, action] = useActionState(startTrial, null);
  return (
    <form action={action} className="space-y-6">
      <div>
        <label className="label" htmlFor="businessName">Nombre de tu negocio</label>
        <input
          className="input"
          id="businessName"
          name="businessName"
          defaultValue={businessName}
          placeholder="Estudio Luz"
          maxLength={120}
          required
        />
        <p className="mt-1 text-xs text-neutral-500">Tus clientes lo verán en su portal.</p>
      </div>
      {plans}
      <FormMessage state={state} />
      <SubmitButton className="btn-brand w-full py-3" pendingLabel="Abriendo pago seguro…">
        Comenzar prueba gratis de 30 días
      </SubmitButton>
      <p className="text-center text-xs text-neutral-500">
        Pedimos tu tarjeta en Stripe, pero no se cobra nada hasta que termine la prueba. Te avisaremos 3 días antes.
      </p>
    </form>
  );
}
