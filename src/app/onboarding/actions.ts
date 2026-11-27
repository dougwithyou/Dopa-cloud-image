"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, getCreator } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutSession } from "@/lib/billing";
import { PLAN_IDS } from "@/lib/plans";
import { hasSubscription } from "@/lib/subscription";
import { getI18n } from "@/i18n/server";

export type OnboardingState = { error?: string } | null;


/** Guarda el nombre del negocio y envía al creador a Stripe Checkout. */
export async function startTrial(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const { supabase, user } = await requireUser("/onboarding");
  const { t, locale } = await getI18n();
  const o = t.auth.onboarding;
  const Schema = z.object({
    businessName: z.string().trim().min(1, o.errBusiness).max(120),
    plan: z.enum(PLAN_IDS, { error: o.errPlan }),
  });
  const parsed = Schema.safeParse({ businessName: formData.get("businessName"), plan: formData.get("plan") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  let creator = await getCreator(supabase, user.id);
  if (creator && hasSubscription(creator)) redirect("/dashboard");

  // Los campos de plan/límites/estado no son escribibles por el usuario (ver
  // privilegios por columna en el esquema), así que se usa la service role.
  const admin = createAdminClient();
  if (!creator) {
    const { data, error } = await admin
      .from("creators")
      .insert({ user_id: user.id, business_name: parsed.data.businessName, plan: parsed.data.plan, locale })
      .select("*")
      .single();
    if (error) return { error: o.errCreate };
    creator = data;
  } else {
    const { data, error } = await admin
      .from("creators")
      .update({ business_name: parsed.data.businessName, plan: parsed.data.plan, locale })
      .eq("id", creator.id)
      .select("*")
      .single();
    if (error) return { error: o.errUpdate };
    creator = data;
  }

  let url: string;
  try {
    url = await createCheckoutSession(creator, parsed.data.plan, user.email);
  } catch (err) {
    console.error("[onboarding] checkout", err);
    return { error: o.errCheckout };
  }
  redirect(url);
}
