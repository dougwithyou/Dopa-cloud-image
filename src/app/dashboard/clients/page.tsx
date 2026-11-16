import { requireCreator } from "@/lib/auth";
import { canUpload } from "@/lib/subscription";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { InviteClientForm } from "../forms";
import { deleteClient, resendInvite } from "../actions";

export const metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const { supabase, creator } = await requireCreator();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, user_id, invited_at, accepted_at, created_at, projects(count)")
    .order("created_at", { ascending: false });

  const count = clients?.length ?? 0;
  const atLimit = creator.client_limit !== null && count >= creator.client_limit;
  const disabledReason = !canUpload(creator)
    ? "Tu suscripción no está activa: no puedes invitar clientes nuevos."
    : atLimit
      ? `Tu plan permite ${creator.client_limit} clientes. Cambia de plan para invitar más.`
      : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <p className="text-neutral-500">
          {count} {creator.client_limit === null ? "clientes (ilimitados)" : `de ${creator.client_limit} clientes`}
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Invitar cliente</h2>
        <InviteClientForm disabledReason={disabledReason} />
      </section>

      <section>
        {clients && clients.length > 0 ? (
          <ul className="card divide-y divide-neutral-100">
            {clients.map((client) => {
              const projectCount = (client.projects as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <li key={client.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{client.name}</p>
                    <p className="truncate text-sm text-neutral-500">{client.email}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {client.user_id ? (
                        <span className="badge bg-green-50 text-green-700">Activo desde {formatDate(client.accepted_at)}</span>
                      ) : (
                        <span className="badge bg-amber-50 text-amber-700">
                          Invitación pendiente{client.invited_at ? ` · enviada ${formatDate(client.invited_at)}` : ""}
                        </span>
                      )}
                      <span className="ml-2">{projectCount} proyectos</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!client.user_id ? (
                      <form action={resendInvite}>
                        <input type="hidden" name="clientId" value={client.id} />
                        <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingLabel="Enviando…">
                          Reenviar invitación
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={deleteClient}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <SubmitButton className="btn-danger px-3 py-1.5 text-xs" pendingLabel="Eliminando…" confirm={`¿Eliminar a ${client.name} con todos sus proyectos y archivos? No se puede deshacer.`}>
                        Eliminar
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card p-8 text-center text-sm text-neutral-500">Todavía no has invitado a ningún cliente.</div>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Eliminar un cliente borra también sus proyectos y archivos de forma permanente.
        </p>
      </section>
    </div>
  );
}
