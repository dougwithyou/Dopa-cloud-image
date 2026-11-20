import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadProjectContent } from "@/lib/project-content";
import { ProjectView } from "@/components/templates/project-view";

export const metadata = { title: "Tu contenido" };

export default async function PortalProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser(`/portal/${projectId}`);

  // Se filtra explícitamente por el cliente autenticado: si el usuario también
  // es creador, RLS le dejaría ver sus propios proyectos, y el portal solo debe
  // mostrar lo compartido con él como cliente.
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, creator_id, created_at, clients!inner(user_id)")
    .eq("id", projectId)
    .eq("status", "published")
    .eq("clients.user_id", user.id)
    .maybeSingle();
  if (!project) notFound();

  const [content, { data: creators }] = await Promise.all([
    loadProjectContent(supabase, project.id),
    supabase.rpc("my_creators"),
  ]);
  const authorName = (creators ?? []).find((c) => c.id === project.creator_id)?.business_name ?? "Tu creador";

  return <ProjectView project={project} authorName={authorName} posts={content.posts} library={content.library} />;
}
