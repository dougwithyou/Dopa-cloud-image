import Link from "next/link";
import { SignupForm } from "../forms";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata = { title: "Crear cuenta" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Crea tu cuenta de creador</h1>
      <p className="mb-6 text-sm text-neutral-500">{TRIAL_DAYS} días de prueba gratis en cualquier plan.</p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-neutral-900">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
