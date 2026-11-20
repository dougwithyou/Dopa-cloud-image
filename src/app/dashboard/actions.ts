"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCreatorContext } from "@/lib/auth";
import { checkClientLimit, limitErrorFromDb } from "@/lib/limits";
import { canUpload } from "@/lib/subscription";
import { sendClientAccess } from "@/lib/invitations";
import { abortMultipartUpload, deleteObject, deletePrefix, projectPrefix } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectStatus } from "@/types/database";

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
    })
    .safeParse({ title: formData.get("title"), type: formData.get("type") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  // El cliente se agrega después, desde la página del proyecto.
  const { data, error } = await supabase
    .from("projects")
    .insert({ creator_id: creator.id, title: parsed.data.title, type: parsed.data.type })
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
// Assets
// ---------------------------------------------------------------------------

export async function addCopy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, creator } = await ctxOrThrow();
  if (!canUpload(creator)) return { error: "Tu suscripción no está activa." };
  const parsed = z
    .object({ projectId: Id, text: z.string().trim().min(1, "Escribe el texto").max(10_000) })
    .safeParse({ projectId: formData.get("projectId"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { data: last } = await supabase
    .from("assets")
    .select("position")
    .eq("project_id", parsed.data.projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("assets").insert({
    project_id: parsed.data.projectId,
    creator_id: creator.id,
    kind: "copy",
    copy_text: parsed.data.text,
    upload_status: "complete",
    position: (last?.position ?? -1) + 1,
  });
  if (error) return { error: "No se pudo guardar el texto" };
  revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  return { message: "Texto añadido" };
}

export async function updateCaption(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("assetId"));
  const text = z.string().max(10_000).parse(formData.get("text") ?? "").trim();
  const { data: asset } = await supabase
    .from("assets")
    .select("id, kind, project_id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!asset) return;
  // Un texto suelto ('copy') no puede quedar vacío; el pie de una foto/video sí.
  if (asset.kind === "copy" && !text) return;
  await supabase
    .from("assets")
    .update({ copy_text: text || null })
    .eq("id", asset.id)
    .eq("creator_id", creator.id);
  revalidatePath(`/dashboard/projects/${asset.project_id}`);
}

export async function moveAsset(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("assetId"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));

  const { data: asset } = await supabase
    .from("assets")
    .select("id, project_id, position")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!asset) return;

  const { data: all } = await supabase
    .from("assets")
    .select("id, position")
    .eq("project_id", asset.project_id)
    .order("position")
    .order("created_at");
  if (!all) return;

  const index = all.findIndex((a) => a.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= all.length) return;

  // Re-numera para resolver posiciones duplicadas y luego intercambia.
  const ordered = all.map((a) => a.id);
  [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
  await Promise.all(
    ordered.map((assetId, position) =>
      all.find((a) => a.id === assetId)?.position === position
        ? null
        : supabase.from("assets").update({ position }).eq("id", assetId).eq("creator_id", creator.id),
    ),
  );
  revalidatePath(`/dashboard/projects/${asset.project_id}`);
}

export async function deleteAsset(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const id = Id.parse(formData.get("assetId"));
  const { data: asset } = await supabase
    .from("assets")
    .select("id, project_id, r2_key, r2_upload_id, upload_status")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!asset) return;

  if (asset.r2_key) {
    if (asset.upload_status === "pending" && asset.r2_upload_id) {
      await abortMultipartUpload(asset.r2_key, asset.r2_upload_id);
    }
    await deleteObject(asset.r2_key);
  }
  await supabase.from("assets").delete().eq("id", asset.id);
  revalidatePath(`/dashboard/projects/${asset.project_id}`);
}
