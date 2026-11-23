import { ImageIcon } from "@/components/icons";
import type { ProjectCover } from "@/lib/project-covers";

/** Miniatura de portada de un proyecto; si aún no hay material, un marcador. */
export function ProjectThumb({ cover, className = "" }: { cover?: ProjectCover; className?: string }) {
  return (
    <span className={`relative block overflow-hidden bg-neutral-100 ${className}`}>
      {cover?.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
        <img src={cover.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : cover?.kind === "video" ? (
        <video
          src={`${cover.url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-neutral-300">
          <ImageIcon className="h-8 w-8" />
        </span>
      )}
    </span>
  );
}
