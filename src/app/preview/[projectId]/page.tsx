import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { loadProjectContent } from "@/lib/project-content";
import { PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/format";
import { ProjectView } from "@/components/templates/project-view";

export const metadata = { title: "Vista previa" };

/**
 * Vista previa para el creador: la misma plantilla que verá el cliente,
 * incluso si el proyecto sigue en borrador o no tiene cliente.
 */
export default async function PreviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, status, created_at, clients(name)")
    .eq("id", projectId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!project) notFound();

  const posts = await loadProjectContent(supabase, project.id);

  return (
    <div className="min-h-dvh bg-white">
      <div className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:text-sm">
          <span>
            <strong>Vista previa</strong> · así lo verá {project.clients?.name ?? "tu cliente"} ·{" "}
            {PROJECT_TYPE_LABEL[project.type]} · {PROJECT_STATUS_LABEL[project.status]}
          </span>
          <Link href={`/dashboard/projects/${project.id}`} className="rounded-full bg-white px-3 py-1 font-semibold text-neutral-900">
            ← Volver al proyecto
          </Link>
        </div>
      </div>
      <ProjectView project={project} authorName={creator.business_name} posts={posts} />
    </div>
  );
}
