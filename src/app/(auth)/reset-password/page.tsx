import { getI18n } from "@/i18n/server";
import { ResetPasswordForm } from "../forms";
import { requireUser } from "@/lib/auth";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.resetPage.meta };
}

export default async function ResetPasswordPage() {
  // La sesión la crea /auth/confirm al abrir el enlace del correo.
  await requireUser("/reset-password");
  const a = (await getI18n()).t.auth.resetPage;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{a.title}</h1>
      <p className="mb-6 text-sm text-neutral-500">{a.lead}</p>
      <ResetPasswordForm />
    </>
  );
}
