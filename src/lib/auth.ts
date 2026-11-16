import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import type { CreatorRow } from "@/types/database";
import { hasSubscription } from "@/lib/subscription";

export interface SessionContext {
  supabase: ServerSupabase;
  user: User | null;
}

export async function getSession(): Promise<SessionContext> {
  const supabase = await createClient();
  // getUser() valida el JWT contra Supabase Auth (no confía solo en la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getCreator(supabase: ServerSupabase, userId: string): Promise<CreatorRow | null> {
  const { data, error } = await supabase.from("creators").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function isClientUser(supabase: ServerSupabase, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Dónde debe aterrizar un usuario recién autenticado. */
export async function homePathFor(supabase: ServerSupabase, user: User): Promise<string> {
  const creator = await getCreator(supabase, user.id);
  if (creator) return hasSubscription(creator) ? "/dashboard" : "/onboarding";
  if (await isClientUser(supabase, user.id)) return "/portal";
  return "/onboarding";
}

/** Para páginas: exige sesión o redirige a /login. */
export async function requireUser(next?: string): Promise<SessionContext & { user: User }> {
  const ctx = await getSession();
  if (!ctx.user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return ctx as SessionContext & { user: User };
}

/** Para páginas del panel: exige creador con checkout completado. */
export async function requireCreator(): Promise<SessionContext & { user: User; creator: CreatorRow }> {
  const ctx = await requireUser("/dashboard");
  const creator = await getCreator(ctx.supabase, ctx.user.id);
  if (!creator || !hasSubscription(creator)) redirect("/onboarding");
  return { ...ctx, creator };
}

/** Para Route Handlers / Server Actions: no redirige, devuelve null. */
export async function getCreatorContext(): Promise<(SessionContext & { user: User; creator: CreatorRow }) | null> {
  const ctx = await getSession();
  if (!ctx.user) return null;
  const creator = await getCreator(ctx.supabase, ctx.user.id);
  if (!creator) return null;
  return { ...ctx, user: ctx.user, creator };
}
