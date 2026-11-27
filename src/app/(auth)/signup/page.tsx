import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { SignupForm } from "../forms";
import { TRIAL_DAYS } from "@/lib/plans";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.signup.meta };
}

export default async function SignupPage() {
  const a = (await getI18n()).t.auth.signup;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{a.title}</h1>
      <p className="mb-6 text-sm text-neutral-500">{a.lead(TRIAL_DAYS)}</p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-neutral-500">
        {a.haveAccount}{" "}
        <Link href="/login" className="font-semibold text-neutral-900">
          {a.signIn}
        </Link>
      </p>
    </>
  );
}
