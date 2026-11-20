import Link from "next/link";
import { APP_NAME } from "@/lib/env";

export const metadata = { title: "Enlace caducado" };

export default function LinkExpiredPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <p className="mb-8 text-2xl font-bold tracking-tight">{APP_NAME}</p>
      <div className="card w-full max-w-sm p-6 text-center sm:p-8">
        <h1 className="mb-2 text-xl font-semibold">El enlace caducó</h1>
        <p className="text-sm text-neutral-600">
          Los enlaces de acceso son de un solo uso y caducan. Pide a tu creador que te reenvíe el acceso.
        </p>
        <p className="mt-4 text-sm text-neutral-600">
          ¿Ya creaste tu contraseña?{" "}
          <Link href="/login" className="font-semibold text-neutral-900">Inicia sesión</Link>
        </p>
      </div>
    </main>
  );
}
