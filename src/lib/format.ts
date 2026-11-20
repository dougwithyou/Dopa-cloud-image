export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

/** El tipo de proyecto define la plantilla que ve el cliente. */
export const PROJECT_TYPE_LABEL = {
  photo_session: "Galería de fotos",
  monthly_content: "Feed de Instagram",
} as const;

export const PROJECT_TYPE_HELP = {
  photo_session: "Estilo galería profesional: portada grande, mosaico de fotos y descarga. Ideal para sesiones.",
  monthly_content: "Como un perfil de Instagram: cuadrícula de publicaciones, carruseles y copies. Ideal para contenido de redes.",
} as const;

export const PROJECT_STATUS_LABEL = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
} as const;
