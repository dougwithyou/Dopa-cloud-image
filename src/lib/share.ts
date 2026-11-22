import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { appUrl, requireEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Días que un visitante registrado puede volver sin rellenar el formulario. */
const VISITOR_DAYS = 30;

export function newShareToken(): string {
  return randomBytes(16).toString("base64url"); // 22 caracteres, imposible de adivinar
}

export function shareUrl(token: string): string {
  return appUrl(`/g/${token}`);
}

function cookieName(projectId: string) {
  return `hdc_g_${projectId.replace(/-/g, "")}`;
}

function sign(payload: string): string {
  return createHmac("sha256", requireEnv("SHARE_SECRET")).update(payload).digest("base64url");
}

/** Marca este navegador como visitante registrado de la galería (cookie firmada, httpOnly). */
export async function setVisitorCookie(projectId: string, leadId: string) {
  const expires = Date.now() + VISITOR_DAYS * 86_400_000;
  const payload = `${projectId}.${leadId}.${expires}`;
  const jar = await cookies();
  jar.set(cookieName(projectId), `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
}

/** ¿Este navegador ya se registró para esta galería? */
export async function hasVisitorAccess(projectId: string): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(cookieName(projectId))?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 4) return false;
  const [pid, leadId, exp, signature] = parts;
  if (pid !== projectId || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(`${pid}.${leadId}.${exp}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface SharedGallery {
  id: string;
  title: string;
  type: "photo_session";
  design: Record<string, unknown>;
  created_at: string;
  businessName: string;
}

/**
 * Galería accesible por enlace: el enlace debe estar activo, ser una galería
 * de fotos y el creador debe tener la suscripción al día (o en periodo de gracia).
 */
export async function findSharedGallery(token: string): Promise<SharedGallery | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, type, design, created_at, creator_id, share_enabled")
    .eq("share_token", token)
    .maybeSingle();
  if (!project || !project.share_enabled || project.type !== "photo_session") return null;

  const [{ data: open }, { data: creator }] = await Promise.all([
    admin.rpc("creator_portal_open", { p_creator_id: project.creator_id }),
    admin.from("creators").select("business_name").eq("id", project.creator_id).single(),
  ]);
  if (!open || !creator) return null;

  return {
    id: project.id,
    title: project.title,
    type: "photo_session",
    design: project.design,
    created_at: project.created_at,
    businessName: creator.business_name,
  };
}
