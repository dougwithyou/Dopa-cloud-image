import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { signDownloadUrl } from "@/lib/r2";
import { PROJECT_TYPE_LABEL } from "@/lib/format";
import { FeedItem, type FeedAsset } from "@/components/feed-item";

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

  const [{ data: assets }, { data: creators }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, kind, r2_key, file_name, mime_type, copy_text")
      .eq("project_id", project.id)
      .eq("upload_status", "complete")
      .order("position")
      .order("created_at"),
    supabase.rpc("my_creators"),
  ]);

  const authorName = (creators ?? []).find((c) => c.id === project.creator_id)?.business_name ?? "Tu creador";

  const feed: FeedAsset[] = await Promise.all(
    (assets ?? []).map(async (a) => ({
      id: a.id,
      kind: a.kind,
      file_name: a.file_name,
      mime_type: a.mime_type,
      copy_text: a.copy_text,
      mediaUrl: a.r2_key ? await signDownloadUrl(a.r2_key, { disposition: "inline" }) : null,
    })),
  );

  const photos = feed.filter((a) => a.kind === "photo").length;
  const videos = feed.filter((a) => a.kind === "video").length;
  const texts = feed.filter((a) => a.copy_text).length;

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
          <span><strong>{photos}</strong> fotos</span>
          <span><strong>{videos}</strong> videos</span>
          <span><strong>{texts}</strong> textos</span>
        </div>
      </div>

      {feed.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-neutral-500">Este proyecto aún no tiene contenido.</p>
      ) : (
        <div className="space-y-2 sm:space-y-6">
          {feed.map((asset, i) => (
            <FeedItem key={asset.id} asset={asset} authorName={authorName} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
