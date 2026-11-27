import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { loadProjectContent } from "@/lib/project-content";
import { ProjectView } from "@/components/templates/project-view";
import { loadStoreConfig } from "@/lib/store";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.portal.preview.meta };
}

/**
 * Vista previa para el creador: la misma plantilla que verá el cliente,
 * incluso si el proyecto sigue en borrador o no tiene cliente.
 */
export default async function PreviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();
  const { t } = await getI18n();
  const pv = t.portal.preview;

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, status, design, created_at, clients(name)")
    .eq("id", projectId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!project) notFound();

  const [content, store] = await Promise.all([
    loadProjectContent(supabase, project.id),
    project.type === "photo_session" ? loadStoreConfig(project.id) : null,
  ]);

  return (
    <div className="min-h-dvh bg-white">
      <div className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:text-sm">
          <span>
            <strong>{pv.label}</strong> · {pv.seenBy(project.clients?.name ?? null)} · {t.labels.projectType[project.type]} ·{" "}
            {t.labels.projectStatus[project.status]}
          </span>
          <Link href={`/dashboard/projects/${project.id}`} className="rounded-full bg-white px-3 py-1 font-semibold text-neutral-900">
            {pv.back}
          </Link>
        </div>
      </div>
      <ProjectView project={project} authorName={creator.business_name} posts={content.posts} library={content.library} store={store} />
    </div>
  );
}
