import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCreatorContext } from "@/lib/auth";
import { canUpload } from "@/lib/subscription";
import { LIMIT_MESSAGES } from "@/lib/limits";

export const dynamic = "force-dynamic";

const Body = z.object({ projectId: z.uuid() });

/**
 * Crea una publicación vacía al final del proyecto. El navegador la crea antes
 * de subir: una por archivo (publicaciones separadas) o una para todos los
 * archivos (carrusel).
 */
export async function POST(req: NextRequest) {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { supabase, creator } = ctx;
  if (!canUpload(creator)) {
    return NextResponse.json({ error: LIMIT_MESSAGES.subscription_inactive }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const { data: last } = await supabase
    .from("posts")
    .select("position")
    .eq("project_id", parsed.data.projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  // RLS + FK compuesta: solo en proyectos del creador autenticado.
  const { data: post, error } = await supabase
    .from("posts")
    .insert({ creator_id: creator.id, project_id: parsed.data.projectId, position: (last?.position ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !post) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  return NextResponse.json({ postId: post.id });
}
