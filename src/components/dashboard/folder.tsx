import Link from "next/link";
import { ProjectThumb } from "@/components/project-thumb";
import { getI18n } from "@/i18n/server";
import type { ProjectSummary } from "@/lib/project-covers";

type ProjectType = "photo_session" | "monthly_content";
type ProjectStatus = "draft" | "published" | "archived";
export type FolderColor = "yellow" | "blue" | "gray";

/** Galerías en amarillo, feeds en azul; lo archivado en gris. */
export function folderColor(type: ProjectType, status?: ProjectStatus): FolderColor {
  if (status === "archived") return "gray";
  return type === "photo_session" ? "yellow" : "blue";
}

/**
 * Tarjeta con forma de carpeta: una pestaña arriba a la izquierda (con una
 * curva suave hacia el cuerpo) y el cuerpo redondeado. El color sale de la
 * variable --folder (clases folder-yellow / folder-blue / folder-gray).
 */
export function Folder({
  color,
  tab,
  children,
  className = "",
}: {
  color: FolderColor;
  tab: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`folder-${color} flex flex-col text-neutral-950 ${className}`}>
      {/*
        Pestaña: un bloque plano con la esquina izquierda redondeada y, a su
        derecha, la bajada dibujada en SVG a escala fija (sin deformar): un
        hombro redondeado arriba, la pendiente y un pie cóncavo que termina
        tangente al borde del cuerpo. Así no queda ningún pico en la unión.
      */}
      <div className="flex h-10 items-stretch">
        <div className="flex min-w-0 items-center gap-2 rounded-tl-[22px] bg-(--folder) pt-0.5 pl-2.5">{tab}</div>
        <svg viewBox="0 0 56 40" className="-ml-px h-10 w-14 shrink-0" aria-hidden>
          <path d="M0 0H6C15 0 19.5 4 23 11L32 29C35.5 36 40.5 40 56 40H0Z" style={{ fill: "var(--folder)" }} />
        </svg>
      </div>
      <div className="-mt-px flex-1 rounded-[26px] rounded-tl-none bg-(--folder)">{children}</div>
    </div>
  );
}

/** Estado en la pestaña: píldora blanca y un indicador como en la referencia. */
export async function StatusTab({ status }: { status: ProjectStatus }) {
  const { t } = await getI18n();
  return (
    <>
      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium whitespace-nowrap">{t.labels.projectStatus[status]}</span>
      <StatusRing status={status} />
    </>
  );
}

function StatusRing({ status }: { status: ProjectStatus }) {
  if (status === "published") {
    return (
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="#0a0a0a" />
        <path d="m6 10.2 2.6 2.5L14 7.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="rgb(0 0 0 / 0.15)" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={status === "draft" ? "20 100" : "0 100"}
      />
    </svg>
  );
}

type DashText = { posts: (n: number) => string; photos: (n: number) => string; videos: (n: number) => string };

export function contentSummary(d: DashText, type: ProjectType, postCount: number, summary?: ProjectSummary) {
  if (type === "monthly_content") return d.posts(postCount);
  const photos = summary?.photos ?? 0;
  const videos = summary?.videos ?? 0;
  const parts = [d.photos(photos)];
  if (videos > 0) parts.push(d.videos(videos));
  return parts.join(" · ");
}

export interface FolderProject {
  id: string;
  title: string;
  type: ProjectType;
  status: ProjectStatus;
  clientName: string | null;
  postCount: number;
}

/** Proyecto como carpeta: título, plantilla, cliente y la foto de portada. */
export async function ProjectFolder({
  project,
  summary,
  className = "",
}: {
  project: FolderProject;
  summary?: ProjectSummary;
  className?: string;
}) {
  const { t } = await getI18n();
  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className={`group block transition duration-200 hover:-translate-y-1 ${className}`}
    >
      <Folder color={folderColor(project.type, project.status)} tab={<StatusTab status={project.status} />} className="h-full">
        <div className="flex h-full flex-col px-5 pt-3 pb-5">
          <h3 className="line-clamp-2 text-[1.35rem] leading-[1.15] font-semibold tracking-[-0.02em]">{project.title}</h3>
          <p className="mt-1 text-sm text-black/60">
            {t.labels.projectType[project.type]} · {contentSummary(t.dash, project.type, project.postCount, summary)}
          </p>
          <div className="mt-auto pt-4">
            <div className="folder-dots" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold">
                {project.clientName ? project.clientName.slice(0, 1).toUpperCase() : "?"}
              </span>
              <span className={`truncate ${project.clientName ? "" : "text-black/55"}`}>{project.clientName ?? t.dash.noClient}</span>
            </span>
            {summary?.cover ? (
              <ProjectThumb
                cover={summary.cover}
                className="-mt-8 h-[4.5rem] w-[4.5rem] shrink-0 rotate-[4deg] rounded-2xl shadow-md ring-4 ring-white transition group-hover:rotate-0"
              />
            ) : null}
          </div>
        </div>
      </Folder>
    </Link>
  );
}
