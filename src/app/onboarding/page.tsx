import { redirect } from "next/navigation";
import { requireUser, getCreator } from "@/lib/auth";
import { hasSubscription } from "@/lib/subscription";
import { PlanPicker } from "@/components/plan-picker";
import { OnboardingForm } from "./form";
import { APP_NAME } from "@/lib/env";

export const metadata = { title: "Empezar" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { supabase, user } = await requireUser("/onboarding");
  const creator = await getCreator(supabase, user.id);
  if (creator && hasSubscription(creator)) redirect("/dashboard");
  const { checkout } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <p className="text-sm font-semibold text-brand-500">{APP_NAME}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Configura tu estudio</h1>
      <p className="mt-2 text-neutral-600">
        Dos pasos: el nombre de tu negocio y tu plan. Después crearás tus proyectos y agregarás a tus clientes.
      </p>
      {checkout === "canceled" ? (
        <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No completaste el pago. Puedes intentarlo de nuevo cuando quieras.
        </p>
      ) : null}
      <div className="card mt-8 p-6 sm:p-8">
        <OnboardingForm businessName={creator?.business_name} plans={<PlanPicker defaultPlan={creator?.plan ?? "medium"} />} />
      </div>
      <form action="/auth/signout" method="post" className="mt-6 text-center">
        <button className="text-sm text-neutral-500 hover:text-neutral-900">Cerrar sesión</button>
      </form>
    </main>
  );
}
