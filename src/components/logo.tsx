import { APP_NAME } from "@/lib/env";

/** Marca: cuatro círculos (uno amarillo) y el nombre. */
export function LogoMark({ className = "h-9 w-9 bg-white" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 grid-cols-2 gap-[3px] rounded-full p-[9px] ${className}`} aria-hidden>
      <span className="rounded-full border-[1.5px] border-current" />
      <span className="rounded-full border-[1.5px] border-current" />
      <span className="rounded-full border-[1.5px] border-current" />
      <span className="rounded-full bg-dash-yellow" />
    </span>
  );
}

export function Logo({ markClassName }: { markClassName?: string }) {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <LogoMark className={markClassName} />
      {APP_NAME}
    </span>
  );
}
