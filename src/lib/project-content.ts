import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
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

export interface ProjectContent {
  /** Publicaciones (plantilla Feed de Instagram), en orden, con sus archivos. */
  posts: ContentPost[];
  /** Todo el material del proyecto en orden de subida (plantilla Galería). */
  library: ContentMedia[];
}

/**
 * Contenido de un proyecto con URLs firmadas. La consulta usa el cliente con
 * sesión: RLS decide qué puede ver el usuario (cliente: solo proyectos
 * publicados y, en un feed, solo archivos que están en publicaciones;
 * creador: todo lo suyo).
 */
export async function loadProjectContent(supabase: SupabaseClient<Database>, projectId: string): Promise<ProjectContent> {
  const [{ data: postRows }, { data: assetRows }] = await Promise.all([
    supabase.from("posts").select("id, caption, position, created_at").eq("project_id", projectId).order("position").order("created_at"),
    supabase
      .from("assets")
      .select("id, post_id, kind, r2_key, file_name, size_bytes, position, created_at")
      .eq("project_id", projectId)
      .eq("upload_status", "complete")
      .order("created_at"),
  ]);

  const files = await Promise.all(
    (assetRows ?? []).map(async (a) => ({
      post_id: a.post_id,
      position: a.position,
      created_at: a.created_at,
      media: {
        id: a.id,
        kind: a.kind,
        file_name: a.file_name,
        size_bytes: Number(a.size_bytes),
        url: await signDownloadUrl(a.r2_key, { disposition: "inline" }),
      } satisfies ContentMedia,
    })),
  );

  const posts = (postRows ?? [])
    .map((p) => ({
      id: p.id,
      caption: p.caption,
      media: files
        .filter((f) => f.post_id === p.id)
        .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
        .map((f) => f.media),
    }))
    .filter((p) => p.media.length > 0 || p.caption);

  return { posts, library: files.map((f) => f.media) };
}
