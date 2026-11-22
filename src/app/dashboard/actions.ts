"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCreatorContext } from "@/lib/auth";
import { checkClientLimit, limitErrorFromDb } from "@/lib/limits";
import { sendClientAccess } from "@/lib/invitations";
import { abortMultipartUpload, deleteObject, deletePrefix, projectPrefix } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectStatus } from "@/types/database";
import { validateDesign } from "@/lib/gallery-design";

export type ActionState = { error?: string; message?: string } | null;

async function ctxOrThrow() {
  const ctx = await getCreatorContext();
  if (!ctx) redirect("/login");
  return ctx;
}

const Id = z.uuid();

/** Aborta en R2 las subidas a medias de un conjunto de proyectos. */
async function abortPendingUploads(projectIds: string[]) {
  if (projectIds.length === 0) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("assets")
    .select("r2_key, r2_upload_id")
    .in("project_id", projectIds)
    .eq("upload_status", "pending");
  await Promise.all(
    (data ?? []).map((a) =>
      a.r2_key && a.r2_upload_id ? abortMultipartUpload(a.r2_key, a.r2_upload_id).catch(() => undefined) : null,
    ),
  );
}

// ---------------------------------------------------------------------------
// Negocio
// ---------------------------------------------------------------------------

export async function updateBusinessName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const name = z.string().trim().min(1).max(120).safeParse(formData.get("businessName"));
  if (!name.success) return { error: "Nombre inválido" };
  const { error } = await supabase.from("creators").update({ business_name: name.data }).eq("id", creator.id);
  if (error) return { error: "No se pudo guardar" };
  revalidatePath("/dashboard", "layout");
  return { message: "Guardado" };
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

type ClientForAccess = { id: string; name: string; email: string; user_id: string | null };

/**
 * Envía al cliente su enlace de acceso al portal. Devuelve false si el correo
 * falló (el cliente queda agregado igualmente y se puede reenviar después).
 */
async function sendAccess(
  client: ClientForAccess,
  creator: { business_name: string },
  replyTo: string | undefined,
): Promise<boolean> {
  if (client.user_id) return true; // ya tiene cuenta: entra con su contraseña
  try {
    await sendClientAccess(client, creator, replyTo);
    return true;
  } catch (err) {
    console.error("[clients] correo de acceso", err);
    return false;
  }
}

/**
 * Registra un cliente (nombre + correo) sin asignarlo aún a un proyecto. Su
 * acceso se envía cuando se le agrega a un proyecto publicado o con
 * "Enviar acceso".
 */
export async function createClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Escribe el nombre del cliente").max(120),
      email: z.email("Correo inválido").transform((v) => v.trim().toLowerCase()),
    })
    .safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const limit = await checkClientLimit(creator);
  if (!limit.ok) return { error: limit.message };

  const { error } = await supabase
    .from("clients")
    .insert({ creator_id: creator.id, name: parsed.data.name, email: parsed.data.email });
  if (error) {
    if (error.code === "23505") return { error: "Ya tienes un cliente con ese correo" };
    return { error: limitErrorFromDb(error.message)?.message ?? "No se pudo agregar el cliente" };
  }
  revalidatePath("/dashboard", "layout");
  return { message: `${parsed.data.name} quedó agregado. Ahora puedes asignarlo a un proyecto.` };
}

/** Reenvía el enlace de acceso a un cliente que todavía no ha entrado. */
export async function resendAccess(formData: FormData): Promise<void> {
  const { supabase, creator, user } = await ctxOrThrow();
  const id = Id.parse(formData.get("clientId"));
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, user_id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!client || client.user_id) return;
  await sendClientAccess(client, creator, user.email);
  revalidatePath("/dashboard/clients");
}

/** Elimina la ficha del cliente. Sus proyectos y archivos se conservan sin cliente. */
export async function deleteClient(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("clientId"));
  await supabase.from("clients").delete().eq("id", id).eq("creator_id", creator.id);
  revalidatePath("/dashboard", "layout");
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const parsed = z
    .object({
      title: z.string().trim().min(1, "Ingresa un título").max(160),
      type: z.enum(["photo_session", "monthly_content"]),
      clientId: z.union([Id, z.literal("")]).optional(),
    })
    .safeParse({
      title: formData.get("title"),
      type: formData.get("type"),
      clientId: formData.get("clientId") ?? undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  // El cliente es opcional (también se puede agregar después). La FK compuesta
  // (creator_id, client_id) impide usar un cliente de otro creador.
  const { data, error } = await supabase
    .from("projects")
    .insert({
      creator_id: creator.id,
      title: parsed.data.title,
      type: parsed.data.type,
      client_id: parsed.data.clientId || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear el proyecto" };
  redirect(`/dashboard/projects/${data.id}`);
}

/**
 * Agrega un cliente al proyecto: uno existente (clientId) o uno nuevo
 * (clientId = "new" + nombre y correo). Si el proyecto ya está publicado,
 * el cliente recibe su acceso por correo en ese momento; si no, lo recibe al
 * publicar.
 */
export async function addClientToProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, creator, user } = await ctxOrThrow();
  const projectId = Id.safeParse(formData.get("projectId"));
  if (!projectId.success) return { error: "Proyecto inválido" };

  const { data: project } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId.data)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!project) return { error: "Proyecto no encontrado" };

  let client: ClientForAccess | null = null;
  const choice = formData.get("clientId");

  if (choice === "new") {
    const parsed = z
      .object({
        name: z.string().trim().min(1, "Escribe el nombre del cliente").max(120),
        email: z.email("Correo inválido").transform((v) => v.trim().toLowerCase()),
      })
      .safeParse({ name: formData.get("name"), email: formData.get("email") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };

    // Si ya existe un cliente con ese correo, se reutiliza.
    const { data: existing } = await supabase
      .from("clients")
      .select("id, name, email, user_id")
      .eq("creator_id", creator.id)
      .eq("email", parsed.data.email)
      .maybeSingle();

    if (existing) {
      client = existing;
    } else {
      const limit = await checkClientLimit(creator);
      if (!limit.ok) return { error: limit.message };
      // RLS (creator_id propio) + trigger enforce_client_limit en la base.
      const { data: created, error } = await supabase
        .from("clients")
        .insert({ creator_id: creator.id, name: parsed.data.name, email: parsed.data.email })
        .select("id, name, email, user_id")
        .single();
      if (error || !created) {
        const mapped = limitErrorFromDb(error?.message);
        return { error: mapped?.message ?? "No se pudo crear el cliente" };
      }
      client = created;
    }
  } else {
    const clientId = Id.safeParse(choice);
    if (!clientId.success) return { error: "Elige un cliente" };
    const { data: found } = await supabase
      .from("clients")
      .select("id, name, email, user_id")
      .eq("id", clientId.data)
      .eq("creator_id", creator.id)
      .maybeSingle();
    if (!found) return { error: "Cliente no encontrado" };
    client = found;
  }

  // La FK compuesta (creator_id, client_id) impide usar un cliente ajeno.
  const { error: updateError } = await supabase
    .from("projects")
    .update({ client_id: client.id })
    .eq("id", project.id)
    .eq("creator_id", creator.id);
  if (updateError) return { error: "No se pudo agregar el cliente al proyecto" };

  revalidatePath(`/dashboard/projects/${project.id}`);
  revalidatePath("/dashboard", "layout");

  if (project.status !== "published") {
    return {
      message: `${client.name} quedó agregado. Recibirá su acceso por correo cuando publiques el proyecto.`,
    };
  }
  if (client.user_id) return { message: `${client.name} quedó agregado y ya puede ver el proyecto en su portal.` };
  const sent = await sendAccess(client, creator, user.email);
  return sent
    ? { message: `${client.name} quedó agregado. Le enviamos su acceso a ${client.email}.` }
    : { error: `${client.name} quedó agregado, pero no se pudo enviar el correo. Usa “Reenviar acceso” en Clientes.` };
}

/** Guarda el diseño de la galería (editor de diseño). */
export async function saveGalleryDesign(input: { projectId: string; design: unknown }): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const projectId = Id.safeParse(input.projectId);
  const design = validateDesign(input.design);
  if (!projectId.success || !design) return { error: "Diseño inválido" };
  const { data, error } = await supabase
    .from("projects")
    .update({ design: design as unknown as Record<string, unknown> })
    .eq("id", projectId.data)
    .eq("creator_id", creator.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo guardar el diseño" };
  revalidatePath(`/design/${projectId.data}`);
  revalidatePath(`/preview/${projectId.data}`);
  return { message: "Diseño guardado" };
}

/** Cambia la plantilla (tipo) del proyecto: galería de fotos o feed de Instagram. */
export async function updateProjectType(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("projectId"));
  const type = z.enum(["photo_session", "monthly_content"]).parse(formData.get("type"));
  await supabase.from("projects").update({ type }).eq("id", id).eq("creator_id", creator.id);
  revalidatePath(`/dashboard/projects/${id}`);
  revalidatePath("/dashboard", "layout");
}

export async function removeClientFromProject(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("projectId"));
  await supabase.from("projects").update({ client_id: null }).eq("id", id).eq("creator_id", creator.id);
  revalidatePath(`/dashboard/projects/${id}`);
  revalidatePath("/dashboard", "layout");
}

export async function updateProjectStatus(formData: FormData): Promise<void> {
  const { supabase, creator, user } = await ctxOrThrow();
  const id = Id.parse(formData.get("projectId"));
  const status = z.enum(["draft", "published", "archived"]).parse(formData.get("status")) as ProjectStatus;
  const { data: project } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", id)
    .eq("creator_id", creator.id)
    .select("id, client_id")
    .maybeSingle();

  // Al publicar, el cliente que aún no tiene acceso recibe su enlace.
  if (project && status === "published" && project.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, email, user_id, invited_at")
      .eq("id", project.client_id)
      .maybeSingle();
    if (client && !client.user_id && !client.invited_at) await sendAccess(client, creator, user.email);
  }

  revalidatePath(`/dashboard/projects/${id}`);
  revalidatePath("/dashboard", "layout");
}

export async function deleteProject(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("projectId"));
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!project) return;
  await abortPendingUploads([project.id]);
  await deletePrefix(projectPrefix({ creatorId: creator.id, projectId: project.id }));
  await supabase.from("projects").delete().eq("id", project.id);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/projects");
}

// ---------------------------------------------------------------------------
// Publicaciones (copy + 1 archivo o carrusel)
// ---------------------------------------------------------------------------

/** Borra en R2 los archivos de una lista (y aborta los que seguían subiéndose). */
async function removeFilesFromR2(files: { r2_key: string; r2_upload_id: string | null; upload_status: string }[]) {
  await Promise.all(
    files.map(async (f) => {
      if (f.upload_status === "pending" && f.r2_upload_id) {
        await abortMultipartUpload(f.r2_key, f.r2_upload_id).catch(() => undefined);
      }
      await deleteObject(f.r2_key).catch(() => undefined);
    }),
  );
}

/** Guarda el copy de una publicación (el texto que el cliente copia en un clic). */
export async function updatePostCaption(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("postId"));
  const text = z.string().max(10_000).parse(formData.get("caption") ?? "").trim();
  const { data: post } = await supabase
    .from("posts")
    .update({ caption: text || null })
    .eq("id", id)
    .eq("creator_id", creator.id)
    .select("project_id")
    .maybeSingle();
  if (post) revalidatePath(`/dashboard/projects/${post.project_id}`);
}

/** Cambia el orden de una publicación dentro del proyecto. */
export async function movePost(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("postId"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));

  const { data: post } = await supabase
    .from("posts")
    .select("id, project_id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!post) return;

  const { data: all } = await supabase
    .from("posts")
    .select("id, position")
    .eq("project_id", post.project_id)
    .order("position")
    .order("created_at");
  if (!all) return;
  await swapAndRenumber(all, id, direction === "up" ? -1 : 1, (rowId, position) =>
    supabase.from("posts").update({ position }).eq("id", rowId).eq("creator_id", creator.id),
  );
  revalidatePath(`/dashboard/projects/${post.project_id}`);
}

/** Cambia el orden de un archivo dentro de su carrusel. */
export async function moveAsset(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("assetId"));
  const direction = z.enum(["left", "right"]).parse(formData.get("direction"));

  const { data: asset } = await supabase
    .from("assets")
    .select("id, post_id, project_id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!asset?.post_id) return;

  const { data: all } = await supabase
    .from("assets")
    .select("id, position")
    .eq("post_id", asset.post_id)
    .order("position")
    .order("created_at");
  if (!all) return;
  await swapAndRenumber(all, id, direction === "left" ? -1 : 1, (rowId, position) =>
    supabase.from("assets").update({ position }).eq("id", rowId).eq("creator_id", creator.id),
  );
  revalidatePath(`/dashboard/projects/${asset.project_id}`);
}

/** Intercambia un elemento con su vecino y re-numera posiciones 0..n-1. */
async function swapAndRenumber(
  rows: { id: string; position: number }[],
  id: string,
  delta: -1 | 1,
  save: (id: string, position: number) => PromiseLike<unknown>,
) {
  const index = rows.findIndex((r) => r.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= rows.length) return;
  const ordered = rows.map((r) => r.id);
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  await Promise.all(
    ordered.map((rowId, position) =>
      rows.find((r) => r.id === rowId)?.position === position ? null : save(rowId, position),
    ),
  );
}

// ---------------------------------------------------------------------------
// Biblioteca: armar publicaciones con archivos ya subidos
// ---------------------------------------------------------------------------

const MAX_CAROUSEL = 20;
const AssetIds = z.array(Id).min(1, "Selecciona al menos un archivo").max(200);

/**
 * Crea una publicación con archivos de la biblioteca, en el orden en que se
 * seleccionaron: 1 archivo = foto o video individual, 2-20 = carrusel.
 */
export async function createPostFromAssets(input: {
  projectId: string;
  assetIds: string[];
  caption?: string;
}): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const projectId = Id.safeParse(input.projectId);
  const assetIds = AssetIds.safeParse(input.assetIds);
  if (!projectId.success || !assetIds.success) return { error: "Selecciona al menos un archivo" };
  const caption = z.string().max(10_000).parse(input.caption ?? "").trim();

  const { data: project } = await supabase
    .from("projects")
    .select("type")
    .eq("id", projectId.data)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!project) return { error: "Proyecto no encontrado" };
  // En una galería, las publicaciones son ESCENAS: sin límite de carrusel.
  const isScene = project.type === "photo_session";
  if (!isScene && assetIds.data.length > MAX_CAROUSEL) {
    return { error: `Un carrusel admite como máximo ${MAX_CAROUSEL} archivos.` };
  }
  if (isScene && !caption) return { error: "Escribe el título de la escena" };

  // Solo archivos propios, completos y libres (RLS + filtros).
  const { data: files } = await supabase
    .from("assets")
    .select("id")
    .in("id", assetIds.data)
    .eq("project_id", projectId.data)
    .eq("creator_id", creator.id)
    .eq("upload_status", "complete")
    .is("post_id", null);
  if (!files || files.length !== assetIds.data.length) {
    return { error: "Algunos archivos ya están en otra publicación o no existen. Recarga la página." };
  }

  const { data: last } = await supabase
    .from("posts")
    .select("position")
    .eq("project_id", projectId.data)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      creator_id: creator.id,
      project_id: projectId.data,
      caption: caption || null,
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error || !post) return { error: "No se pudo crear la publicación" };

  const results = await Promise.all(
    assetIds.data.map((id, position) =>
      supabase.from("assets").update({ post_id: post.id, position }).eq("id", id).eq("creator_id", creator.id),
    ),
  );
  if (results.some((r) => r.error)) {
    // Deshacer: los archivos vuelven a la biblioteca.
    await supabase.from("posts").delete().eq("id", post.id);
    return { error: "No se pudo crear la publicación" };
  }

  revalidatePath(`/dashboard/projects/${projectId.data}`);
  const n = assetIds.data.length;
  if (isScene) return { message: `Escena “${caption}” creada con ${n} archivo(s).` };
  return { message: n === 1 ? "Publicación creada." : `Carrusel de ${n} archivos creado.` };
}

/** Añade archivos de la biblioteca al final de una publicación existente. */
export async function addAssetsToPost(input: { postId: string; assetIds: string[] }): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const postId = Id.safeParse(input.postId);
  const assetIds = AssetIds.safeParse(input.assetIds);
  if (!postId.success || !assetIds.success) return { error: "Selecciona al menos un archivo" };

  const { data: post } = await supabase
    .from("posts")
    .select("id, project_id, projects(type)")
    .eq("id", postId.data)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!post) return { error: "Publicación no encontrada" };
  const isScene = post.projects?.type === "photo_session";

  const { data: current } = await supabase.from("assets").select("position").eq("post_id", post.id);
  const count = current?.length ?? 0;
  if (!isScene && count + assetIds.data.length > MAX_CAROUSEL) {
    return { error: `Esa publicación tiene ${count} archivos; un carrusel admite como máximo ${MAX_CAROUSEL}.` };
  }
  const start = (current ?? []).reduce((m, a) => Math.max(m, a.position), -1) + 1;

  const results = await Promise.all(
    assetIds.data.map((id, i) =>
      supabase
        .from("assets")
        .update({ post_id: post.id, position: start + i })
        .eq("id", id)
        .eq("project_id", post.project_id)
        .eq("creator_id", creator.id)
        .is("post_id", null),
    ),
  );
  revalidatePath(`/dashboard/projects/${post.project_id}`);
  const failed = results.filter((r) => r.error).length;
  return failed
    ? { error: limitErrorFromDb(results.find((r) => r.error)?.error?.message)?.message ?? "Algunos archivos no se pudieron añadir." }
    : { message: `Añadidos ${assetIds.data.length} archivo(s) a la ${isScene ? "escena" : "publicación"}.` };
}

/** Quita un archivo de su publicación y lo devuelve a la biblioteca (no lo borra). */
export async function removeAssetFromPost(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("assetId"));
  const { data: asset } = await supabase
    .from("assets")
    .select("id, post_id, project_id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!asset?.post_id) return;

  await supabase.from("assets").update({ post_id: null, position: 0 }).eq("id", asset.id);

  // Si la publicación queda vacía y sin copy, se elimina.
  const { count } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("post_id", asset.post_id);
  if ((count ?? 0) === 0) {
    const { data: post } = await supabase.from("posts").select("caption").eq("id", asset.post_id).maybeSingle();
    if (post && !post.caption) await supabase.from("posts").delete().eq("id", asset.post_id);
  }
  revalidatePath(`/dashboard/projects/${asset.project_id}`);
}

/** Elimina una publicación. Sus archivos vuelven a la biblioteca. */
export async function deletePost(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("postId"));
  const { data: post } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("creator_id", creator.id)
    .select("project_id")
    .maybeSingle();
  if (post) revalidatePath(`/dashboard/projects/${post.project_id}`);
}

/** Elimina archivos definitivamente (base de datos y R2). */
export async function deleteAssets(input: { assetIds: string[] }): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  const assetIds = AssetIds.safeParse(input.assetIds);
  if (!assetIds.success) return { error: "Selecciona al menos un archivo" };

  const { data: files } = await supabase
    .from("assets")
    .select("id, project_id, r2_key, r2_upload_id, upload_status")
    .in("id", assetIds.data)
    .eq("creator_id", creator.id);
  if (!files || files.length === 0) return { error: "Archivos no encontrados" };

  await removeFilesFromR2(files);
  await supabase.from("assets").delete().in("id", files.map((f) => f.id)).eq("creator_id", creator.id);
  revalidatePath(`/dashboard/projects/${files[0].project_id}`);
  return { message: `${files.length} archivo(s) eliminado(s).` };
}
