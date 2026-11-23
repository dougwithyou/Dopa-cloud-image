import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { loadProjectCovers } from "@/lib/project-covers";
import { ProjectFolder } from "@/components/dashboard/folder";
import { FolderPlusIcon } from "@/components/icons";

export const metadata = { title: "Proyectos anteriores" };

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "draft", label: "Borradores" },
  { key: "published", label: "Publicados" },
  { key: "archived", label: "Archivados" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { supabase } = await requireCreator();
  const { estado } = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === estado) ? (estado as FilterKey) : "todos";

  const { data: all } = await supabase
    .from("projects")
    .select("id, title, type, status, design, created_at, clients(name), posts(count)")
    .order("created_at", { ascending: false });
  const projects = (all ?? []).filter((p) => filter === "todos" || p.status === filter);
  const summaries = await loadProjectCovers(supabase, projects);
  const countFor = (key: FilterKey) => (all ?? []).filter((p) => key === "todos" || p.status === key).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="dash-title">
          Proyectos<sup>({all?.length ?? 0})</sup>
        </h1>
        <Link href="/dashboard/projects/new" className="btn-primary py-3">
          <FolderPlusIcon className="h-4 w-4" /> Nuevo proyecto
        </Link>
      </div>

      <nav className="seg" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "todos" ? "/dashboard/projects" : `/dashboard/projects?estado=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            scroll={false}
          >
            {f.label} <span className="opacity-60">{countFor(f.key)}</span>
          </Link>
        ))}
      </nav>

      {projects.length > 0 ? (
        <ul className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectFolder
                className="h-full"
                summary={summaries.get(p.id)}
                project={{
                  id: p.id,
                  title: p.title,
                  type: p.type,
                  status: p.status,
                  clientName: p.clients?.name ?? null,
                  postCount: (p.posts as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="card p-8 text-center text-sm text-neutral-500">
          {filter === "todos" ? (
            <>
              Aún no hay proyectos.{" "}
              <Link href="/dashboard/projects/new" className="font-semibold text-neutral-900">
                Crea el primero
              </Link>
              .
            </>
          ) : (
            "No hay proyectos con este estado."
          )}
        </div>
      )}
    </div>
  );
}
