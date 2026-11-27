import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { ForgotPasswordForm } from "../forms";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.forgotPage.title };
}

export default async function ForgotPasswordPage() {
  const a = (await getI18n()).t.auth.forgotPage;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{a.title}</h1>
      <p className="mb-6 text-sm text-neutral-500">{a.lead}</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-neutral-500 hover:text-neutral-900">
          {a.back}
        </Link>
      </p>
    </>
  );
}
