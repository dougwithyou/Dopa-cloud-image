// Lectura perezosa de variables de entorno: falla con un mensaje claro en el
// momento de usarse (no durante el build).

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.example.`);
  }
  return value;
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} debe ser un número >= 0`);
  return Math.floor(n);
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Hi Dopa Cloud";

export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Días que los portales de clientes siguen abiertos tras un impago o cancelación. */
export function portalGracePeriodDays(): number {
  return intEnv("PORTAL_GRACE_PERIOD_DAYS", 14);
}

/** Acepta solo rutas internas ("/algo"), nunca "//host" ni URLs absolutas. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
