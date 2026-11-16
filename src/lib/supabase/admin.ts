import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireEnv } from "@/lib/env";

/**
 * Cliente con service role: IGNORA RLS. Úsalo solo en el servidor y solo
 * después de verificar identidad y propiedad de los datos.
 */
export function createAdminClient() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
