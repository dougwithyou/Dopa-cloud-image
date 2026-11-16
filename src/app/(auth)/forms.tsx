"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { forgotPassword, login, resetPassword, signup } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Contraseña</label>
          <Link href="/forgot-password" className="mb-1 text-xs text-neutral-500 hover:text-neutral-900">
            ¿La olvidaste?
          </Link>
        </div>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signup, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="mt-1 text-xs text-neutral-500">Mínimo 8 caracteres.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Enviando…">Enviar enlace</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Nueva contraseña</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Repite la contraseña</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
