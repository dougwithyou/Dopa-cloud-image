import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { signDownloadUrl } from "@/lib/r2";
import { PROJECT_TYPE_LABEL } from "@/lib/format";
import { FeedPost, type FeedPostData } from "@/components/feed-post";

export const metadata = { title: "Proyecto" };

export default async function PortalProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser(`/portal/${projectId}`);

  // Se filtra explícitamente por el cliente autenticado: si el usuario también
  // es creador, RLS le dejaría ver sus propios proyectos, y el portal solo debe
  // mostrar lo compartido con él como cliente.
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, creator_id, clients!inner(user_id)")
    .eq("id", projectId)
    .eq("status", "published")
    .eq("clients.user_id", user.id)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: postRows }, { data: creators }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, caption, position, created_at, assets(id, kind, r2_key, file_name, upload_status, position, created_at)")
      .eq("project_id", project.id)
      .order("position")
      .order("created_at"),
    supabase.rpc("my_creators"),
  ]);

  const authorName = (creators ?? []).find((c) => c.id === project.creator_id)?.business_name ?? "Tu creador";

  const feed: FeedPostData[] = (
    await Promise.all(
      (postRows ?? []).map(async (p) => ({
        id: p.id,
        caption: p.caption,
        media: await Promise.all(
          [...(p.assets ?? [])]
            .filter((a) => a.upload_status === "complete")
            .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
            .map(async (a) => ({
              id: a.id,
              kind: a.kind,
              file_name: a.file_name,
              url: await signDownloadUrl(a.r2_key, { disposition: "inline" }),
            })),
        ),
      })),
    )
  ).filter((p) => p.media.length > 0 || p.caption);

  const carousels = feed.filter((p) => p.media.length > 1).length;
  const files = feed.reduce((n, p) => n + p.media.length, 0);

  return (
    <div>
      <div className="px-4 py-4 sm:px-0">
        <Link href="/portal" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Proyectos
        </Link>
        <h1 className="mt-2 text-xl font-bold">{project.title}</h1>
        <p className="text-sm text-neutral-500">
          {authorName} · {PROJECT_TYPE_LABEL[project.type]}
        </p>
        <div className="mt-3 flex gap-6 text-sm">
          <span><strong>{feed.length}</strong> publicaciones</span>
          <span><strong>{carousels}</strong> carruseles</span>
          <span><strong>{files}</strong> archivos</span>
        </div>
      </div>

      {feed.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-neutral-500">Este proyecto aún no tiene contenido.</p>
      ) : (
        <div className="space-y-2 sm:space-y-6">
          {feed.map((post, i) => (
            <FeedPost key={post.id} post={post} authorName={authorName} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
