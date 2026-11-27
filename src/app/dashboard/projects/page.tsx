import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { loadProjectCovers } from "@/lib/project-covers";
import { ProjectFolder } from "@/components/dashboard/folder";
import { FolderPlusIcon } from "@/components/icons";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dash.projectsPage.meta };
}

const FILTERS = ["todos", "draft", "published", "archived"] as const;
type FilterKey = (typeof FILTERS)[number];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { supabase } = await requireCreator();
  const { estado } = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f === estado) ? (estado as FilterKey) : "todos";
  const pp = (await getI18n()).t.dash.projectsPage;

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
          {pp.title}<sup>({all?.length ?? 0})</sup>
        </h1>
        <Link href="/dashboard/projects/new" className="btn-primary py-3">
          <FolderPlusIcon className="h-4 w-4" /> {pp.newProject}
        </Link>
      </div>

      <nav className="seg" aria-label={pp.filterLabel}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "todos" ? "/dashboard/projects" : `/dashboard/projects?estado=${f}`}
            aria-current={filter === f ? "page" : undefined}
            scroll={false}
          >
            {pp.filters[f]} <span className="opacity-60">{countFor(f)}</span>
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
              {pp.none}{" "}
              <Link href="/dashboard/projects/new" className="font-semibold text-neutral-900">
                {pp.createFirst}
              </Link>
              .
            </>
          ) : (
            pp.noneWithStatus
          )}
        </div>
      )}
    </div>
  );
}
