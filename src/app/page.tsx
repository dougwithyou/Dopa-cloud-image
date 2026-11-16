import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { APP_NAME } from "@/lib/env";
import { PLANS, PLAN_IDS, TRIAL_DAYS, formatPrice } from "@/lib/plans";

export default async function Home() {
  const { supabase, user } = await getSession();
  if (user) redirect(await homePathFor(supabase, user));

  return (
    <main className="mx-auto max-w-5xl px-4">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-bold">{APP_NAME}</span>
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost">Entrar</Link>
          <Link href="/signup" className="btn-primary">Probar gratis</Link>
        </nav>
      </header>

      <section className="py-16 text-center sm:py-24">
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Entrega el contenido de tus clientes como un feed de Instagram
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">
          Fotos, videos y textos listos para publicar en un portal privado. Tus clientes descargan y copian en un clic.
        </p>
        <Link href="/signup" className="btn-brand mt-8 px-6 py-3 text-base">
          Empieza tu prueba de {TRIAL_DAYS} días
        </Link>
      </section>

      <section className="grid gap-4 pb-24 sm:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          return (
            <div key={id} className="card p-6">
              <h2 className="font-semibold">{plan.name}</h2>
              <p className="mt-2 text-3xl font-bold">
                {formatPrice(plan)}
                <span className="text-sm font-normal text-neutral-500">/mes</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-600">
                {plan.highlights.map((h) => (
                  <li key={h}>✓ {h}</li>
                ))}
                <li>✓ {TRIAL_DAYS} días de prueba</li>
              </ul>
            </div>
          );
        })}
      </section>
    </main>
  );
}
