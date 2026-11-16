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

export const PROJECT_TYPE_LABEL = {
  photo_session: "Sesión de fotos",
  monthly_content: "Contenido mensual",
} as const;

export const PROJECT_STATUS_LABEL = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
} as const;
