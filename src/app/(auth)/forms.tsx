"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/submit-button";
import { useI18n } from "@/i18n/client";
import { forgotPassword, login, resetPassword, signup } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const a = useI18n().t.auth;
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">{a.email}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">{a.password}</label>
          <Link href="/forgot-password" className="mb-1 text-xs text-neutral-500 hover:text-neutral-900">
            {a.forgot}
          </Link>
        </div>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={a.signingIn}>{a.signIn}</SubmitButton>
    </form>
  );
}

export function SignupForm() {
  const a = useI18n().t.auth;
  const [state, action] = useActionState(signup, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">{a.email}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">{a.password}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="mt-1 text-xs text-neutral-500">{a.minChars}</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={a.creatingAccount}>{a.createAccount}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const a = useI18n().t.auth;
  const [state, action] = useActionState(forgotPassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">{a.email}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={a.sending}>{a.sendLink}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const a = useI18n().t.auth;
  const [state, action] = useActionState(resetPassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">{a.newPassword}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">{a.repeatPassword}</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={a.processing}>{a.savePassword}</SubmitButton>
    </form>
  );
}
