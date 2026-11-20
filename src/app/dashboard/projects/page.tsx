import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { formatDate, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/format";
import { CreateProjectForm } from "../forms";

export const metadata = { title: "Proyectos" };

const STATUS_STYLE = {
  draft: "bg-neutral-100 text-neutral-700",
  published: "bg-green-50 text-green-700",
  archived: "bg-neutral-100 text-neutral-400",
} as const;

export default async function ProjectsPage() {
  const { supabase } = await requireCreator();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, type, status, created_at, clients(name), assets(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Nuevo proyecto</h2>
        <CreateProjectForm />
      </section>

      {projects && projects.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const assetCount = (p.assets as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
            return (
              <li key={p.id}>
                <Link href={`/dashboard/projects/${p.id}`} className="card block p-5 transition hover:border-neutral-400">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.title}</p>
                    <span className={`badge ${STATUS_STYLE[p.status]}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {p.clients?.name ?? <span className="text-amber-700">Sin cliente</span>}
                  </p>
                  <p className="mt-3 text-xs text-neutral-500">
                    {PROJECT_TYPE_LABEL[p.type]} · {assetCount} elementos · {formatDate(p.created_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card p-8 text-center text-sm text-neutral-500">Aún no hay proyectos.</div>
      )}
    </div>
  );
}
