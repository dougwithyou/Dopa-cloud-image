import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { signDownloadUrl } from "@/lib/r2";

export interface ContentMedia {
  id: string;
  kind: "photo" | "video";
  file_name: string;
  size_bytes: number;
  /** URL firmada (inline) para mostrar y para empaquetar en el ZIP. */
  url: string;
}

export interface ContentPost {
  id: string;
  caption: string | null;
  media: ContentMedia[];
}

/**
 * Publicaciones de un proyecto con sus archivos completos, en orden, y URLs
 * firmadas. La consulta usa el cliente con sesión: RLS decide qué puede ver
 * el usuario (cliente: solo proyectos publicados; creador: los suyos).
 */
export async function loadProjectContent(supabase: ServerSupabase, projectId: string): Promise<ContentPost[]> {
  const { data: rows } = await supabase
    .from("posts")
    .select("id, caption, position, created_at, assets(id, kind, r2_key, file_name, size_bytes, upload_status, position, created_at)")
    .eq("project_id", projectId)
    .order("position")
    .order("created_at");

  const posts = await Promise.all(
    (rows ?? []).map(async (p) => ({
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
            size_bytes: Number(a.size_bytes),
            url: await signDownloadUrl(a.r2_key, { disposition: "inline" }),
          })),
      ),
    })),
  );
  return posts.filter((p) => p.media.length > 0 || p.caption);
}
