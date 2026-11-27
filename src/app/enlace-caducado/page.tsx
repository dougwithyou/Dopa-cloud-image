import Link from "next/link";
import { APP_NAME } from "@/lib/env";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.expired.meta };
}

export default async function LinkExpiredPage() {
  const e = (await getI18n()).t.auth.expired;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <p className="mb-8 text-2xl font-bold tracking-tight">{APP_NAME}</p>
      <div className="card w-full max-w-sm p-6 text-center sm:p-8">
        <h1 className="mb-2 text-xl font-semibold">{e.title}</h1>
        <p className="text-sm text-neutral-600">{e.text}</p>
        <p className="mt-4 text-sm text-neutral-600">
          {e.havePassword}{" "}
          <Link href="/login" className="font-semibold text-neutral-900">{e.signIn}</Link>
        </p>
      </div>
    </main>
  );
}
