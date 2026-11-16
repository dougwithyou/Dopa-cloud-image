import Link from "next/link";
import { LoginForm } from "../forms";
import { safeNextPath } from "@/lib/env";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Iniciar sesión</h1>
      <p className="mb-6 text-sm text-neutral-500">Creadores y clientes entran por aquí.</p>
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          El enlace no es válido o caducó. Vuelve a intentarlo.
        </p>
      ) : null}
      <LoginForm next={next ? safeNextPath(next) : undefined} />
      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿Eres creador y no tienes cuenta?{" "}
        <Link href="/signup" className="font-semibold text-neutral-900">
          Regístrate
        </Link>
      </p>
    </>
  );
}
