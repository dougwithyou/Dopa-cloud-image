import { ResetPasswordForm } from "../forms";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage() {
  // La sesión la crea /auth/confirm al abrir el enlace del correo.
  await requireUser("/reset-password");
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Crea una nueva contraseña</h1>
      <p className="mb-6 text-sm text-neutral-500">Úsala la próxima vez que inicies sesión.</p>
      <ResetPasswordForm />
    </>
  );
}
