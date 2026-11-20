import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { getUsage } from "@/lib/limits";
import { PLANS, formatPrice } from "@/lib/plans";
import { STATUS_LABEL, trialDaysLeft } from "@/lib/subscription";
import { formatBytes, formatDate, PROJECT_STATUS_LABEL } from "@/lib/format";
import { UsageMeter } from "@/components/usage-meter";

export const metadata = { title: "Resumen" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { supabase, creator } = await requireCreator();
  const { checkout } = await searchParams;
  const [usage, projects] = await Promise.all([
    getUsage(creator.id),
    supabase
      .from("projects")
      .select("id, title, status, created_at, clients(name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const plan = PLANS[creator.plan];
  const days = trialDaysLeft(creator);

  return (
    <div className="space-y-8">
      {checkout === "success" ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          ¡Listo! Tu prueba de 30 días comenzó. Empieza creando tu primer proyecto.
        </p>
      ) : null}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {creator.business_name}</h1>
        <p className="text-neutral-500">Esto es lo que pasa en tu estudio.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-neutral-500">Plan</p>
          <p className="mt-1 text-xl font-semibold">
            {plan.name} · {formatPrice(plan)}/mes
          </p>
          <p className="mt-2 text-sm">
            <span className="badge bg-neutral-100 text-neutral-700">{STATUS_LABEL[creator.subscription_status]}</span>
            {days !== null ? (
              <span className="ml-2 text-neutral-600">
                {days} {days === 1 ? "día" : "días"} de prueba · cobro el {formatDate(creator.trial_ends_at)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="card p-5 md:col-span-2 space-y-4">
          <UsageMeter label="Almacenamiento" used={usage.storageUsedBytes} limit={creator.storage_limit_bytes} format={formatBytes} />
          <UsageMeter label="Clientes" used={usage.clientCount} limit={creator.client_limit} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Proyectos recientes</h2>
          <Link href="/dashboard/projects" className="text-sm text-neutral-500 hover:text-neutral-900">
            Ver todos
          </Link>
        </div>
        {projects.data && projects.data.length > 0 ? (
          <ul className="card divide-y divide-neutral-100">
            {projects.data.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/projects/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-neutral-50">
                  <span>
                    <span className="font-medium">{p.title}</span>
                    <span className="ml-2 text-sm text-neutral-500">{p.clients?.name ?? "Sin cliente"}</span>
                  </span>
                  <span className="text-xs text-neutral-500">{PROJECT_STATUS_LABEL[p.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card p-8 text-center text-sm text-neutral-500">
            Aún no tienes proyectos.{" "}
            <Link href="/dashboard/projects" className="font-semibold text-neutral-900">Crea el primero</Link> y agrégale un cliente.
          </div>
        )}
      </section>
    </div>
  );
}
