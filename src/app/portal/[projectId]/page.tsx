import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadProjectContent } from "@/lib/project-content";
import { ProjectView } from "@/components/templates/project-view";
import { loadStoreConfig } from "@/lib/store";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.portal.yourContent };
}

export default async function PortalProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser(`/portal/${projectId}`);

  // Se filtra explícitamente por el cliente autenticado: si el usuario también
  // es creador, RLS le dejaría ver sus propios proyectos, y el portal solo debe
  // mostrar lo compartido con él como cliente.
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, design, creator_id, created_at, clients!inner(user_id)")
    .eq("id", projectId)
    .eq("status", "published")
    .eq("clients.user_id", user.id)
    .maybeSingle();
  if (!project) notFound();

  const [content, { data: creators }, store] = await Promise.all([
    loadProjectContent(supabase, project.id),
    supabase.rpc("my_creators"),
    project.type === "photo_session" ? loadStoreConfig(project.id) : null,
  ]);
  const authorName = (creators ?? []).find((c) => c.id === project.creator_id)?.business_name ?? (await getI18n()).t.portal.yourCreator;

  return <ProjectView project={project} authorName={authorName} posts={content.posts} library={content.library} store={store} />;
}
