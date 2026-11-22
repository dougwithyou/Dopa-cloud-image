import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { canUpload } from "@/lib/subscription";
import { CreateClientForm } from "../forms";
import { deleteClient, resendAccess } from "../actions";

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
    ? "Tu suscripción no está activa: no puedes agregar clientes nuevos."
    : atLimit
      ? `Tu plan permite ${creator.client_limit} clientes. Cambia de plan en Configuración para agregar más.`
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
        <h2 className="mb-1 font-semibold">Agregar cliente</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Después asígnalo a un{" "}
          <Link href="/dashboard/projects" className="font-semibold text-neutral-900">proyecto</Link>. Recibirá su
          acceso por correo cuando publiques ese proyecto.
        </p>
        <CreateClientForm disabledReason={disabledReason} />
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
                        <span className="badge bg-green-50 text-green-700">Con acceso desde {formatDate(client.accepted_at)}</span>
                      ) : client.invited_at ? (
                        <span className="badge bg-amber-50 text-amber-700">
                          Acceso enviado el {formatDate(client.invited_at)}, aún no ha entrado
                        </span>
                      ) : (
                        <span className="badge bg-neutral-100 text-neutral-700">Sin acceso todavía</span>
                      )}
                      <span className="ml-2">
                        {projectCount} {projectCount === 1 ? "proyecto" : "proyectos"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!client.user_id ? (
                      <form action={resendAccess}>
                        <input type="hidden" name="clientId" value={client.id} />
                        <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingLabel="Enviando…">
                          {client.invited_at ? "Reenviar acceso" : "Enviar acceso"}
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={deleteClient}>
                      <input type="hidden" name="clientId" value={client.id} />
                      <SubmitButton
                        className="btn-danger px-3 py-1.5 text-xs"
                        pendingLabel="Eliminando…"
                        confirm={`¿Eliminar a ${client.name}? Sus proyectos y archivos se conservan, pero quedarán sin cliente.`}
                      >
                        Eliminar
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card p-8 text-center text-sm text-neutral-500">
            Todavía no tienes clientes.
          </div>
        )}
      </section>
    </div>
  );
}
