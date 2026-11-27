import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const n = (await getI18n()).t.auth.notFound;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">{n.title}</h1>
      <p className="mt-2 text-neutral-500">{n.text}</p>
      <Link href="/" className="btn-secondary mt-6">{n.back}</Link>
    </main>
  );
}
