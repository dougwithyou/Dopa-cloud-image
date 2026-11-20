"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { claimAccess } from "./actions";

export function AccessForm({ clientId, isNewUser }: { clientId: string; isNewUser: boolean }) {
  const [state, action] = useActionState(claimAccess, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      {isNewUser ? (
        <>
          <input type="hidden" name="requirePassword" value="1" />
          <div>
            <label className="label" htmlFor="password">Crea tu contraseña</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <p className="mt-1 text-xs text-neutral-500">Mínimo 8 caracteres. La usarás para volver a entrar.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">Repite la contraseña</label>
            <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
        </>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Entrando…">{isNewUser ? "Crear contraseña y entrar" : "Entrar a mi portal"}</SubmitButton>
    </form>
  );
}
