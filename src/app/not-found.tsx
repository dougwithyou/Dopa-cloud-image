import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">No encontrado</h1>
      <p className="mt-2 text-neutral-500">Esta página no existe o no tienes acceso.</p>
      <Link href="/" className="btn-secondary mt-6">Volver al inicio</Link>
    </main>
  );
}
