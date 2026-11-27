import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { canUpload } from "@/lib/subscription";
import { CreateClientForm } from "../forms";
import { deleteClient, resendAccess } from "../actions";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.account.clients.meta };
}

export default async function ClientsPage() {
  const { supabase, creator } = await requireCreator();
  const { t, locale } = await getI18n();
  const c = t.account.clients;
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, user_id, invited_at, accepted_at, created_at, projects(count)")
    .order("created_at", { ascending: false });

  const count = clients?.length ?? 0;
  const atLimit = creator.client_limit !== null && count >= creator.client_limit;
  const disabledReason = !canUpload(creator)
    ? c.inactive
    : atLimit
      ? c.atLimit(creator.client_limit ?? 0)
      : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="dash-title">
          {c.title}<sup>({count})</sup>
        </h1>
        <p className="mt-2 text-neutral-500">
          {c.count(count, creator.client_limit)}
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">{c.add}</h2>
        <p className="mb-4 text-sm text-neutral-500">
          {c.assignA}
          <Link href="/dashboard/projects" className="font-semibold text-neutral-900">
            {c.assignLink}
          </Link>
          {c.assignB}
        </p>
        <CreateClientForm disabledReason={disabledReason} />
      </section>

      <section>
        {clients && clients.length > 0 ? (
          <ul className="space-y-3">
            {clients.map((client, i) => {
              const projectCount = (client.projects as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <li
                  key={client.id}
                  className={`flex flex-col gap-3 rounded-[22px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                    i % 2 === 0 ? "bg-dash-yellow-soft" : "bg-dash-blue-soft"
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white font-semibold">
                      {client.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{client.name}</p>
                      <p className="truncate text-sm text-neutral-500">{client.email}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {client.user_id ? (
                          <span className="badge bg-green-50 text-green-700">
                            {c.hasAccess(formatDate(client.accepted_at, locale))}
                          </span>
                        ) : client.invited_at ? (
                          <span className="badge bg-amber-50 text-amber-700">
                            {c.invited(formatDate(client.invited_at, locale))}
                          </span>
                        ) : (
                          <span className="badge bg-white text-neutral-700">{c.noAccess}</span>
                        )}
                        <span className="ml-2">
                          {c.projects(projectCount)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!client.user_id ? (
                      <form action={resendAccess}>
                        <input type="hidden" name="clientId" value={client.id} />
                        <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingLabel={c.sending}>
                          {client.invited_at ? c.resend : c.send}
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={deleteClient}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <SubmitButton
                        className="btn-danger px-3 py-1.5 text-xs"
                        pendingLabel={c.deleting}
                        confirm={c.confirmDelete(client.name)}
                      >
                        {c.delete}
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card p-8 text-center text-sm text-neutral-500">{c.empty}</div>
        )}
      </section>
    </div>
  );
}
