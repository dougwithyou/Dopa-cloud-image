import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { formatDate, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/format";
import { FolderPlusIcon } from "@/components/icons";
import { ProjectThumb } from "@/components/project-thumb";
import { loadProjectCovers } from "@/lib/project-covers";

export const metadata = { title: "Proyectos anteriores" };

const STATUS_STYLE = {
  draft: "bg-neutral-100 text-neutral-700",
  published: "bg-green-50 text-green-700",
  archived: "bg-neutral-100 text-neutral-400",
} as const;

export default async function ProjectsPage() {
  const { supabase } = await requireCreator();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, type, status, design, created_at, clients(name), posts(count)")
    .order("created_at", { ascending: false });
  const covers = await loadProjectCovers(supabase, projects ?? []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Tus proyectos</h1>
        <Link href="/dashboard/projects/new" className="btn-primary">
          <FolderPlusIcon className="h-4 w-4" /> Nuevo proyecto
        </Link>
      </div>

      {projects && projects.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const postCount = (p.posts as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
            return (
              <li key={p.id}>
                <Link href={`/dashboard/projects/${p.id}`} className="card block overflow-hidden transition hover:border-neutral-400">
                  <ProjectThumb cover={covers.get(p.id)} className="aspect-[16/10] w-full" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{p.title}</p>
                      <span className={`badge ${STATUS_STYLE[p.status]}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {p.clients?.name ?? <span className="text-amber-700">Sin cliente</span>}
                    </p>
                    <p className="mt-3 text-xs text-neutral-500">
                      {PROJECT_TYPE_LABEL[p.type]} · {postCount} {postCount === 1 ? "publicación" : "publicaciones"} · {formatDate(p.created_at)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card p-8 text-center text-sm text-neutral-500">
          Aún no hay proyectos.{" "}
          <Link href="/dashboard/projects/new" className="font-semibold text-neutral-900">Crea el primero</Link>.
        </div>
      )}
    </div>
  );
}
