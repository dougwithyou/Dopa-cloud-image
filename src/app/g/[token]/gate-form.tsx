"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { registerVisitor } from "./actions";

export function GateForm({ token, businessName }: { token: string; businessName: string }) {
  const [state, action] = useActionState(registerVisitor, null);
  return (
    <form action={action} className="space-y-4 text-left">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">Nombre</label>
          <input className="input" id="firstName" name="firstName" autoComplete="given-name" required maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="lastName">Apellido</label>
          <input className="input" id="lastName" name="lastName" autoComplete="family-name" required maxLength={80} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Correo electrónico</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <label className="flex items-start gap-2 text-sm text-neutral-600">
        <input type="checkbox" name="consent" className="mt-1" />
        <span>Quiero recibir novedades y promociones de {businessName} por correo. (Opcional)</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingLabel="Entrando…">
        Ver la galería
      </SubmitButton>
      <p className="text-center text-xs text-neutral-400">
        Al entrar, compartes tu nombre y tu correo con {businessName}.
      </p>
    </form>
  );
}
