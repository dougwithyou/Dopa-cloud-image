import { formatBytes } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { deletePost, moveAsset, movePost, removeAssetFromPost, updatePostCaption } from "../../actions";

export interface EditorAsset {
  id: string;
  kind: "photo" | "video";
  file_name: string;
  size_bytes: number;
  upload_status: "pending" | "complete";
  url: string | null;
}

export interface EditorPost {
  id: string;
  caption: string | null;
  assets: EditorAsset[];
}

function Media({ asset, className }: { asset: EditorAsset; className: string }) {
  if (!asset.url) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 text-xs text-amber-700 ${className}`}>
        Subida incompleta
      </div>
    );
  }
  return asset.kind === "photo" ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
    <img src={asset.url} alt={asset.file_name} loading="lazy" className={`bg-neutral-100 object-cover ${className}`} />
  ) : (
    <video src={asset.url} controls playsInline preload="metadata" className={`bg-black object-contain ${className}`} />
  );
}

/** Tarjeta de una publicación en el panel: archivos, copy y acciones. */
export function PostCard({
  post,
  index,
  total,
  variant = "post",
}: {
  post: EditorPost;
  index: number;
  total: number;
  /** "scene": en una galería, la publicación es una escena con título. */
  variant?: "post" | "scene";
}) {
  const isScene = variant === "scene";
  const count = post.assets.length;
  const isCarousel = count > 1;
  const label = isScene
    ? `${count} ${count === 1 ? "archivo" : "archivos"}`
    : count === 0
      ? "Sin archivos"
      : isCarousel
        ? `Carrusel · ${count} archivos`
        : post.assets[0].kind === "video"
          ? "Video"
          : "Foto";
  const noun = isScene ? "Escena" : "Publicación";

  return (
    <li className="card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2">
        <p className="text-sm">
          <span className="font-semibold">
            {noun} {index + 1}
            {isScene && post.caption ? ` · ${post.caption.split("\n")[0]}` : ""}
          </span>
          <span className="ml-2 text-neutral-500">{label}</span>
        </p>
        <div className="flex items-center gap-1">
          <form action={movePost}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="direction" value="up" />
            <button className="btn-ghost px-2 py-1" disabled={index === 0} aria-label={`Subir ${noun.toLowerCase()}`}>↑</button>
          </form>
          <form action={movePost}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="direction" value="down" />
            <button className="btn-ghost px-2 py-1" disabled={index === total - 1} aria-label={`Bajar ${noun.toLowerCase()}`}>↓</button>
          </form>
          <form action={deletePost}>
            <input type="hidden" name="postId" value={post.id} />
            <SubmitButton
              className="btn-ghost px-2 py-1 text-xs text-red-600"
              pendingLabel="…"
              confirm={`¿Eliminar la ${noun.toLowerCase()} ${index + 1}? ${count > 0 ? "Sus archivos vuelven a la biblioteca" : "No tiene archivos"}${isScene ? "." : "; el copy se pierde."}`}
            >
              Eliminar
            </SubmitButton>
          </form>
        </div>
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Archivos */}
        <div className="min-w-0 space-y-3">
          {count === 1 ? (
            <div className="space-y-2">
              <Media asset={post.assets[0]} className="aspect-square w-full rounded-xl" />
              <p className="truncate text-xs text-neutral-500">
                {post.assets[0].file_name} · {formatBytes(post.assets[0].size_bytes)}
              </p>
            </div>
          ) : count > 1 ? (
            <ol className="flex snap-x gap-2 overflow-x-auto pb-2">
              {post.assets.map((asset, i) => (
                <li key={asset.id} className="w-36 shrink-0 snap-start">
                  <div className="relative">
                    <Media asset={asset} className="aspect-square w-36 rounded-lg" />
                    <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                      {i + 1}/{count}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <form action={moveAsset}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="direction" value="left" />
                      <button className="btn-ghost px-1.5 py-0.5 text-xs" disabled={i === 0} aria-label="Mover a la izquierda">←</button>
                    </form>
                    <form action={removeAssetFromPost}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <SubmitButton className="btn-ghost px-1.5 py-0.5 text-xs" pendingLabel="…">
                        Quitar
                      </SubmitButton>
                    </form>
                    <form action={moveAsset}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="direction" value="right" />
                      <button className="btn-ghost px-1.5 py-0.5 text-xs" disabled={i === count - 1} aria-label="Mover a la derecha">→</button>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">Esta publicación aún no tiene archivos.</p>
          )}

          {count > 1 ? (
            <p className="text-xs text-neutral-500">“Quitar” devuelve el archivo a la biblioteca sin borrarlo.</p>
          ) : null}
        </div>

        {/* Copy (publicación) o título (escena) */}
        <form action={updatePostCaption} className="flex min-w-0 flex-col gap-2">
          <input type="hidden" name="postId" value={post.id} />
          <label className="label" htmlFor={`caption-${post.id}`}>
            {isScene ? "Título de la escena" : "Copy de esta publicación"}
          </label>
          {isScene ? (
            <input
              id={`caption-${post.id}`}
              name="caption"
              className="input text-sm"
              defaultValue={post.caption?.split("\n")[0] ?? ""}
              placeholder="Ceremonia, Recepción, Retratos…"
              maxLength={80}
            />
          ) : (
            <textarea
              id={`caption-${post.id}`}
              name="caption"
              className="input min-h-40 flex-1 text-sm"
              defaultValue={post.caption ?? ""}
              placeholder={
                isCarousel
                  ? "Texto para todo el carrusel: caption, hashtags, menciones…"
                  : "Caption, hashtags, menciones… Tu cliente lo copiará en un clic."
              }
              maxLength={10000}
            />
          )}
          <SubmitButton className="btn-secondary self-start px-3 py-1.5 text-xs" pendingLabel="Guardando…">
            {isScene ? "Guardar título" : "Guardar copy"}
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
