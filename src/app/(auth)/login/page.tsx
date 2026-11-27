import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { LoginForm } from "../forms";
import { safeNextPath } from "@/lib/env";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.login.meta };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const a = (await getI18n()).t.auth.login;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{a.title}</h1>
      <p className="mb-6 text-sm text-neutral-500">{a.lead}</p>
      {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{a.badLink}</p> : null}
      <LoginForm next={next ? safeNextPath(next) : undefined} />
      <p className="mt-6 text-center text-sm text-neutral-500">
        {a.noAccount}{" "}
        <Link href="/signup" className="font-semibold text-neutral-900">
          {a.signUp}
        </Link>
      </p>
    </>
  );
}
