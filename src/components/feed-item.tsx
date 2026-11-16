import { CopyButton } from "@/components/copy-button";

export interface FeedAsset {
  id: string;
  kind: "photo" | "video" | "copy";
  file_name: string | null;
  mime_type: string | null;
  copy_text: string | null;
  mediaUrl: string | null; // URL prefirmada inline (null para textos)
}

/** Publicación estilo Instagram: cabecera, media, acciones y texto. */
export function FeedItem({ asset, authorName, index }: { asset: FeedAsset; authorName: string; index: number }) {
  return (
    <article className="overflow-hidden border-neutral-200 bg-white sm:rounded-2xl sm:border">
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-brand-500 to-purple-600 p-[2px]">
          <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-bold">
            {authorName.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <span className="text-sm font-semibold">{authorName}</span>
        <span className="ml-auto text-xs text-neutral-400">#{index + 1}</span>
      </header>

      {asset.kind === "photo" && asset.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URLs prefirmadas de R2, sin optimizador
        <img
          src={asset.mediaUrl}
          alt={asset.file_name ?? "Foto"}
          loading={index < 2 ? "eager" : "lazy"}
          className="block max-h-[80vh] w-full bg-neutral-100 object-contain"
        />
      ) : null}

      {asset.kind === "video" && asset.mediaUrl ? (
        <video
          src={asset.mediaUrl}
          controls
          playsInline
          preload="metadata"
          className="block max-h-[80vh] w-full bg-black"
        />
      ) : null}

      {asset.kind === "copy" ? (
        <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 p-8">
          <p className="line-clamp-[12] whitespace-pre-wrap text-center text-lg font-medium leading-relaxed text-neutral-800">
            {asset.copy_text}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {asset.kind !== "copy" ? (
          <a href={`/api/assets/${asset.id}/download`} className="btn-primary px-3 py-1.5 text-xs" download>
            ↓ Descargar {asset.kind === "video" ? "video" : "foto"}
          </a>
        ) : null}
        {asset.copy_text ? <CopyButton text={asset.copy_text} className="btn-secondary px-3 py-1.5 text-xs" /> : null}
      </div>

      {asset.copy_text && asset.kind !== "copy" ? (
        <p className="whitespace-pre-wrap px-4 pt-3 text-sm">
          <span className="mr-1 font-semibold">{authorName}</span>
          {asset.copy_text}
        </p>
      ) : null}
      {asset.kind === "copy" && asset.copy_text ? (
        <details className="px-4 pt-3 text-sm">
          <summary className="cursor-pointer text-neutral-500">Ver texto completo</summary>
          <p className="mt-2 whitespace-pre-wrap">{asset.copy_text}</p>
        </details>
      ) : null}
      <div className="pb-4" />
    </article>
  );
}
