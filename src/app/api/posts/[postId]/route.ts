import { NextResponse } from "next/server";
import { getCreatorContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Elimina una publicación SOLO si quedó sin archivos (p. ej. todas sus subidas
 * fallaron o se cancelaron). Para borrar una publicación con contenido se usa
 * la acción del panel, que también borra los archivos en R2.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { count } = await ctx.supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  if ((count ?? 0) > 0) return NextResponse.json({ deleted: false });

  await ctx.supabase.from("posts").delete().eq("id", postId).eq("creator_id", ctx.creator.id);
  return NextResponse.json({ deleted: true });
}
