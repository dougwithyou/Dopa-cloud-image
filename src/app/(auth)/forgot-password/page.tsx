import Link from "next/link";
import { ForgotPasswordForm } from "../forms";

export const metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Recuperar contraseña</h1>
      <p className="mb-6 text-sm text-neutral-500">Te enviaremos un enlace para crear una nueva.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-neutral-500 hover:text-neutral-900">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  );
}
