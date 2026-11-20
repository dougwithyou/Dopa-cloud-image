// "Descargar todo" en el navegador: empaqueta los archivos en un ZIP sin
// pasar por el servidor (los bytes vienen directo de R2 con URLs firmadas).
//  - Chrome/Edge: se escribe directo a disco (showSaveFilePicker), sin límite de tamaño.
//  - Resto: se arma en memoria. Si el total es muy grande, se descargan uno a uno.

import { downloadZip } from "client-zip";

export interface ZipEntry {
  /** Ruta dentro del ZIP, p. ej. "03-publicacion/01-foto.jpg". */
  name: string;
  url?: string;
  text?: string;
  size?: number;
  /** Para la descarga individual de respaldo. */
  downloadHref?: string;
}

const IN_MEMORY_LIMIT = 1.5 * 1024 ** 3; // 1,5 GB

type SavePicker = (opts: { suggestedName: string; types?: unknown[] }) => Promise<{
  createWritable: () => Promise<WritableStream<Uint8Array>>;
}>;

export function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "contenido"
  );
}

async function downloadOneByOne(entries: ZipEntry[], onProgress: (f: number) => void) {
  const files = entries.filter((e) => e.downloadHref);
  for (let i = 0; i < files.length; i++) {
    const a = document.createElement("a");
    a.href = files[i].downloadHref!;
    a.download = files[i].name.split("/").pop() ?? "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    onProgress((i + 1) / files.length);
    await new Promise((r) => setTimeout(r, 700));
  }
}

/**
 * Descarga todas las entradas como un ZIP. Devuelve "zip", "individual" o
 * "canceled" (el usuario cerró el diálogo de guardado).
 */
export async function downloadAll(
  entries: ZipEntry[],
  zipName: string,
  onProgress: (fraction: number) => void,
): Promise<"zip" | "individual" | "canceled"> {
  const totalBytes = entries.reduce((n, e) => n + (e.size ?? 0), 0) || 1;
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;

  // El diálogo de guardado debe abrirse en respuesta directa al clic.
  let writable: WritableStream<Uint8Array> | null = null;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: zipName,
        types: [{ description: "Archivo ZIP", accept: { "application/zip": [".zip"] } }],
      });
      writable = await handle.createWritable();
    } catch (err) {
      if ((err as Error).name === "AbortError") return "canceled";
      writable = null;
    }
  }

  if (!writable && totalBytes > IN_MEMORY_LIMIT) {
    await downloadOneByOne(entries, onProgress);
    return "individual";
  }

  let loaded = 0;
  async function* files() {
    for (const entry of entries) {
      if (entry.text !== undefined) {
        yield { name: entry.name, input: entry.text };
        continue;
      }
      const res = await fetch(entry.url!);
      if (!res.ok || !res.body) throw new Error(`No se pudo descargar ${entry.name}`);
      const counted = res.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            loaded += chunk.byteLength;
            onProgress(Math.min(0.99, loaded / totalBytes));
            controller.enqueue(chunk);
          },
        }),
      );
      yield { name: entry.name, input: counted, size: entry.size };
    }
  }

  const zip = downloadZip(files());
  if (writable) {
    await zip.body!.pipeTo(writable);
  } else {
    const blob = await zip.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  onProgress(1);
  return "zip";
}
