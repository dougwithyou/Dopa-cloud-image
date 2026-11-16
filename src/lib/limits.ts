import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CreatorRow } from "@/types/database";
import { canUpload } from "@/lib/subscription";

export interface Usage {
  storageUsedBytes: number;
  clientCount: number;
}

/** Uso actual (incluye subidas 'pending', que reservan espacio). */
export async function getUsage(creatorId: string): Promise<Usage> {
  const admin = createAdminClient();
  const [assets, clients] = await Promise.all([
    admin.from("assets").select("size_bytes").eq("creator_id", creatorId).in("kind", ["photo", "video"]),
    admin.from("clients").select("id", { count: "exact", head: true }).eq("creator_id", creatorId),
  ]);
  if (assets.error) throw assets.error;
  if (clients.error) throw clients.error;
  const storageUsedBytes = (assets.data ?? []).reduce((sum, a) => sum + Number(a.size_bytes), 0);
  return { storageUsedBytes, clientCount: clients.count ?? 0 };
}

export type LimitCheck = { ok: true } | { ok: false; code: LimitErrorCode; message: string };

export type LimitErrorCode =
  | "subscription_inactive"
  | "storage_limit_exceeded"
  | "client_limit_exceeded"
  | "project_not_found"
  | "creator_not_found"
  | "invalid_kind"
  | "invalid_size";

export const LIMIT_MESSAGES: Record<LimitErrorCode, string> = {
  subscription_inactive:
    "Tu suscripción no está activa. Actualiza tu método de pago para volver a subir archivos.",
  storage_limit_exceeded: "Superas el almacenamiento de tu plan. Libera espacio o cambia de plan.",
  client_limit_exceeded: "Superas el número de clientes de tu plan. Cambia de plan para continuar.",
  project_not_found: "Proyecto no encontrado.",
  creator_not_found: "Cuenta de creador no encontrada.",
  invalid_kind: "Tipo de archivo no permitido.",
  invalid_size: "Tamaño de archivo inválido.",
};

/**
 * Verificación previa (mensajes claros en la UI). La verificación definitiva y
 * atómica la hace reserve_asset_upload() en Postgres.
 */
export async function checkUploadLimits(
  creator: Pick<CreatorRow, "id" | "subscription_status" | "storage_limit_bytes" | "client_limit">,
  incomingBytes: number,
): Promise<LimitCheck> {
  if (!canUpload(creator)) {
    return { ok: false, code: "subscription_inactive", message: LIMIT_MESSAGES.subscription_inactive };
  }
  const usage = await getUsage(creator.id);
  if (creator.client_limit !== null && usage.clientCount > creator.client_limit) {
    return { ok: false, code: "client_limit_exceeded", message: LIMIT_MESSAGES.client_limit_exceeded };
  }
  if (usage.storageUsedBytes + incomingBytes > creator.storage_limit_bytes) {
    return { ok: false, code: "storage_limit_exceeded", message: LIMIT_MESSAGES.storage_limit_exceeded };
  }
  return { ok: true };
}

export async function checkClientLimit(
  creator: Pick<CreatorRow, "id" | "subscription_status" | "client_limit">,
): Promise<LimitCheck> {
  if (!canUpload(creator)) {
    return { ok: false, code: "subscription_inactive", message: LIMIT_MESSAGES.subscription_inactive };
  }
  if (creator.client_limit === null) return { ok: true };
  const { clientCount } = await getUsage(creator.id);
  if (clientCount >= creator.client_limit) {
    return { ok: false, code: "client_limit_exceeded", message: LIMIT_MESSAGES.client_limit_exceeded };
  }
  return { ok: true };
}

/** Traduce los errores lanzados por las funciones SQL (raise exception '<code>'). */
export function limitErrorFromDb(message: string | undefined): { code: LimitErrorCode; message: string } | null {
  if (!message) return null;
  const code = (Object.keys(LIMIT_MESSAGES) as LimitErrorCode[]).find((c) => message.includes(c));
  return code ? { code, message: LIMIT_MESSAGES[code] } : null;
}
