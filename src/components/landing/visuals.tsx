import { CheckIcon, DownloadIcon } from "@/components/icons";

/*
 * Ilustraciones de la página principal hechas solo con CSS: "fotos" abstractas
 * (degradados con sol, horizonte o colinas) y un teléfono con un feed. Así la
 * página no depende de fotos de stock.
 */

const SHOTS: string[] = [
  // Atardecer
  "radial-gradient(circle at 70% 32%, #fff6d8 0 9%, transparent 10%), linear-gradient(180deg, #f9d77a 0%, #f2a65a 48%, #8a5a78 49%, #4b3556 100%)",
  // Mar
  "radial-gradient(circle at 28% 30%, #ffffff 0 7%, transparent 8%), linear-gradient(180deg, #d7eefe 0%, #8ccaf5 52%, #2f7fbf 53%, #1d4e7a 100%)",
  // Arena y dunas
  "radial-gradient(120% 60% at 20% 100%, #c79a62 0 50%, transparent 51%), radial-gradient(120% 55% at 90% 100%, #ddb57f 0 50%, transparent 51%), linear-gradient(180deg, #f7ecd9, #ecd3ad)",
  // Noche
  "radial-gradient(circle at 75% 25%, #f6c143 0 6%, transparent 7%), radial-gradient(140% 60% at 50% 110%, #2b2b35 0 50%, transparent 51%), linear-gradient(180deg, #3d3d4d, #16161c)",
  // Retrato (silueta)
  "radial-gradient(circle at 50% 38%, #f3d2c4 0 13%, transparent 14%), radial-gradient(60% 45% at 50% 100%, #2a2a30 0 60%, transparent 61%), linear-gradient(160deg, #fcf1d5, #f6c143)",
  // Cielo y colinas
  "radial-gradient(130% 50% at 30% 100%, #6f9a7f 0 50%, transparent 51%), radial-gradient(120% 45% at 85% 100%, #94b89b 0 50%, transparent 51%), linear-gradient(180deg, #ddeffd, #a9d4f5)",
  // Producto (taza)
  "radial-gradient(28% 22% at 50% 60%, #ffffff 0 60%, transparent 62%), radial-gradient(40% 10% at 50% 74%, rgb(0 0 0 / 0.12) 0 60%, transparent 62%), linear-gradient(180deg, #f1e3cf, #e2c9a6)",
  // Neutro gris
  "radial-gradient(circle at 35% 40%, #ffffff 0 16%, transparent 17%), linear-gradient(135deg, #e6e6ea, #b9b9c2)",
];

export function Shot({ n, className = "" }: { n: number; className?: string }) {
  return <span className={`block ${className}`} style={{ backgroundImage: SHOTS[n % SHOTS.length], backgroundSize: "cover" }} aria-hidden />;
}

/** Teléfono con el perfil y la cuadrícula de Instagram de un cliente. */
export function PhoneMock({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[46px] bg-neutral-950 p-2.5 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45)] ${className}`} aria-hidden>
      <div className="overflow-hidden rounded-[38px] bg-white">
        <div className="flex items-center justify-between px-6 pt-3.5 pb-2 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-5 w-20 rounded-full bg-neutral-950" />
          <span className="flex gap-0.5">
            <span className="h-2 w-3 rounded-sm bg-neutral-950" />
            <span className="h-2 w-1 rounded-sm bg-neutral-950" />
          </span>
        </div>
        <div className="flex items-center gap-4 px-4 pt-2 pb-3">
          <span className="rounded-full bg-gradient-to-tr from-dash-yellow to-dash-blue p-[2px]">
            <Shot n={4} className="h-14 w-14 rounded-full border-2 border-white" />
          </span>
          <div className="grid flex-1 grid-cols-2 text-center text-[11px] leading-tight">
            <span>
              <b className="block text-sm">24</b>posts
            </span>
            <span>
              <b className="block text-sm">8.1k</b>seguidores
            </span>
          </div>
        </div>
        <p className="px-4 text-xs font-semibold">Café Lumbre</p>
        <p className="px-4 pb-3 text-[11px] text-neutral-500">Contenido de marzo · listo para publicar</p>
        <div className="grid grid-cols-3 gap-[2px]">
          {[0, 1, 6, 3, 5, 2, 7, 4, 1].map((n, i) => (
            <Shot key={i} n={n} className="aspect-[4/5]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Píldora flotante de confirmación (Guardar en Fotos, descargas…). */
export function FloatingChip({ children, tone = "white", className = "" }: { children: React.ReactNode; tone?: "white" | "dark"; className?: string }) {
  return (
    <span
      className={`flex items-center gap-2 rounded-full py-2 pr-4 pl-2 text-sm font-medium shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] ${
        tone === "dark" ? "bg-neutral-950 text-white" : "bg-white"
      } ${className}`}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function ChipIcon({ kind }: { kind: "check" | "download" }) {
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${kind === "check" ? "bg-dash-yellow text-neutral-950" : "bg-dash-blue text-white"}`}>
      {kind === "check" ? <CheckIcon className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
    </span>
  );
}

/** Línea curva decorativa de fondo (como un trazo continuo). */
export function SquiggleLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 400" fill="none" className={`pointer-events-none ${className}`} aria-hidden>
      <path
        d="M-20 330C80 330 120 250 170 190 230 120 330 70 380 120 430 170 360 250 300 220 230 185 290 60 400 40 500 22 560 90 640 60"
        stroke="currentColor"
        strokeWidth="22"
        strokeLinecap="round"
      />
    </svg>
  );
}
