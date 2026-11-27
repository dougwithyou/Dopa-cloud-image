import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_NAME } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { AccessForm } from "./form";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.auth.access.meta };
}

/** Destino del enlace de acceso que recibe el cliente por correo. */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; new?: string }>;
}) {
  const { client: clientId, new: isNew } = await searchParams;
  const { user } = await requireUser(`/acceso?client=${clientId ?? ""}`);
  const a = (await getI18n()).t.auth.access;

  const admin = createAdminClient();
  const { data: client } = clientId
    ? await admin.from("clients").select("id, name, email, user_id, creator_id").eq("id", clientId).maybeSingle()
    : { data: null };

  const matches = client && user.email && client.email === user.email.toLowerCase();
  if (client && matches && client.user_id === user.id) redirect("/portal");

  const { data: creator } =
    client && matches
      ? await admin.from("creators").select("business_name").eq("id", client.creator_id).single()
      : { data: null };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <p className="mb-8 text-2xl font-bold tracking-tight">{APP_NAME}</p>
      <div className="card w-full max-w-sm p-6 sm:p-8">
        {!client || !matches || (client.user_id && client.user_id !== user.id) ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">{a.invalidTitle}</h1>
            <p className="text-sm text-neutral-600">
              {a.invalidText(user.email ?? "")}
            </p>
            <Link href="/portal" className="btn-secondary mt-6 w-full">{a.goPortal}</Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold">{a.hello(client.name)}</h1>
            <p className="mb-6 text-sm text-neutral-600">
              {a.shared(creator?.business_name ?? null)}
            </p>
            <AccessForm clientId={client.id} isNewUser={isNew === "1"} />
          </>
        )}
      </div>
    </main>
  );
}
