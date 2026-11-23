import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseDesign } from "@/lib/gallery-design";
import { signDownloadUrl } from "@/lib/r2";

export interface ProjectCover {
  kind: "photo" | "video";
  url: string;
}

type ProjectRef = { id: string; type: "photo_session" | "monthly_content"; design: unknown };

const byOrder = (a: { position: number; created_at: string }, b: { position: number; created_at: string }) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

/**
 * Portada de cada proyecto para las tarjetas del panel:
 * - Galería: la foto elegida en el diseño o, si no hay, la primera foto subida.
 * - Feed: el primer archivo de la primera publicación (lo que el cliente ve
 *   arriba a la izquierda) o, sin publicaciones, el primer archivo subido.
 * Devuelve URLs firmadas de R2; la consulta pasa por RLS.
 */
export async function loadProjectCovers(
  supabase: SupabaseClient<Database>,
  projects: ProjectRef[],
): Promise<Map<string, ProjectCover>> {
  const covers = new Map<string, ProjectCover>();
  if (projects.length === 0) return covers;
  const ids = projects.map((p) => p.id);
  const feedIds = projects.filter((p) => p.type === "monthly_content").map((p) => p.id);

  const [{ data: assetRows }, { data: postRows }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, project_id, post_id, kind, r2_key, position, created_at")
      .in("project_id", ids)
      .eq("upload_status", "complete")
      .order("created_at"),
    feedIds.length > 0
      ? supabase.from("posts").select("id, project_id, position, created_at").in("project_id", feedIds)
      : Promise.resolve({ data: [] as { id: string; project_id: string; position: number; created_at: string }[] }),
  ]);

  const assets = assetRows ?? [];
  const posts = postRows ?? [];

  const picks = projects.map((project) => {
    const own = assets.filter((a) => a.project_id === project.id);
    if (own.length === 0) return null;

    if (project.type === "photo_session") {
      const chosen = parseDesign(project.design).coverAssetId;
      return (
        (chosen ? own.find((a) => a.id === chosen && a.kind === "photo") : undefined) ??
        own.find((a) => a.kind === "photo") ??
        own[0]
      );
    }

    const firstWithMedia = posts
      .filter((p) => p.project_id === project.id)
      .sort(byOrder)
      .map((p) => own.filter((a) => a.post_id === p.id).sort(byOrder)[0])
      .find(Boolean);
    return firstWithMedia ?? own[0];
  });

  await Promise.all(
    picks.map(async (asset, i) => {
      if (!asset) return;
      covers.set(projects[i].id, {
        kind: asset.kind,
        url: await signDownloadUrl(asset.r2_key, { disposition: "inline" }),
      });
    }),
  );
  return covers;
}
