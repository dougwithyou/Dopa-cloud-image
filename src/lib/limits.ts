import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CreatorRow } from "@/types/database";
import { canUpload } from "@/lib/subscription";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";

export interface Usage {
  storageUsedBytes: number;
  clientCount: number;
}

/** Uso actual (incluye subidas 'pending', que reservan espacio). */
export async function getUsage(creatorId: string): Promise<Usage> {
  const admin = createAdminClient();
  const [assets, clients] = await Promise.all([
    admin.from("assets").select("size_bytes").eq("creator_id", creatorId),
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
  | "post_not_found"
  | "carousel_limit_exceeded"
  | "creator_not_found"
  | "invalid_kind"
  | "invalid_size";

const LIMIT_CODES: LimitErrorCode[] = [
  "subscription_inactive",
  "storage_limit_exceeded",
  "client_limit_exceeded",
  "project_not_found",
  "post_not_found",
  "carousel_limit_exceeded",
  "creator_not_found",
  "invalid_kind",
  "invalid_size",
];

/** Mensaje del límite en el idioma de la petición. */
export async function limitMessage(code: LimitErrorCode): Promise<string> {
  const locale = await getLocale().catch(() => DEFAULT_LOCALE);
  return getMessages(locale).errors.limits[code];
}

async function fail(code: LimitErrorCode): Promise<LimitCheck> {
  return { ok: false, code, message: await limitMessage(code) };
}

/**
 * Verificación previa (mensajes claros en la UI). La verificación definitiva y
 * atómica la hace reserve_asset_upload() en Postgres.
 */
export async function checkUploadLimits(
  creator: Pick<CreatorRow, "id" | "subscription_status" | "storage_limit_bytes" | "client_limit">,
  incomingBytes: number,
): Promise<LimitCheck> {
  if (!canUpload(creator)) {
    return fail("subscription_inactive");
  }
  const usage = await getUsage(creator.id);
  if (creator.client_limit !== null && usage.clientCount > creator.client_limit) {
    return fail("client_limit_exceeded");
  }
  if (usage.storageUsedBytes + incomingBytes > creator.storage_limit_bytes) {
    return fail("storage_limit_exceeded");
  }
  return { ok: true };
}

export async function checkClientLimit(
  creator: Pick<CreatorRow, "id" | "subscription_status" | "client_limit">,
): Promise<LimitCheck> {
  if (!canUpload(creator)) {
    return fail("subscription_inactive");
  }
  if (creator.client_limit === null) return { ok: true };
  const { clientCount } = await getUsage(creator.id);
  if (clientCount >= creator.client_limit) {
    return fail("client_limit_exceeded");
  }
  return { ok: true };
}

/** Traduce los errores lanzados por las funciones SQL (raise exception '<code>'). */
export async function limitErrorFromDb(message: string | undefined): Promise<{ code: LimitErrorCode; message: string } | null> {
  if (!message) return null;
  const code = LIMIT_CODES.find((c) => message.includes(c));
  return code ? { code, message: await limitMessage(code) } : null;
}
