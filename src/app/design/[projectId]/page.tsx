import { notFound, redirect } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { loadProjectContent } from "@/lib/project-content";
import { formatDate } from "@/lib/format";
import { parseDesign } from "@/lib/gallery-design";
import { sceneTitle } from "@/components/templates/project-view";
import { GalleryEditor } from "./editor";

export const metadata = { title: "Diseño de la galería" };

/** Editor de diseño de la plantilla Galería de fotos, con vista previa en vivo. */
export default async function DesignPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, design, created_at")
    .eq("id", projectId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!project) notFound();
  if (project.type !== "photo_session") redirect(`/dashboard/projects/${project.id}`);

  const content = await loadProjectContent(supabase, project.id);

  return (
    <GalleryEditor
      projectId={project.id}
      title={project.title}
      authorName={creator.business_name}
      date={formatDate(project.created_at)}
      items={content.library}
      scenes={content.posts.map((p, i) => ({ id: p.id, title: sceneTitle(p.caption, i), media: p.media }))}
      initialDesign={parseDesign(project.design)}
    />
  );
}
