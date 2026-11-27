"use client";

import { useCallback, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { DownloadAllButton } from "@/components/download-all-button";
import { MediaCarousel } from "@/components/media-carousel";
import { SaveToPhotosButton, useSaveToPhotosPlatform } from "@/components/save-to-photos";
import { pad, type ZipEntry } from "@/lib/zip-download";
import { useI18n } from "@/i18n/client";

export interface FeedMedia {
  id: string;
  kind: "photo" | "video";
  file_name: string;
  size_bytes: number;
  url: string;
}

export interface FeedPostData {
  id: string;
  caption: string | null;
  media: FeedMedia[];
}

export function downloadHref(id: string) {
  return `/api/assets/${id}/download`;
}

/** Entradas del ZIP de una publicación: sus archivos y su copy. */
export function postZipEntries(post: FeedPostData, folder = ""): ZipEntry[] {
  const entries: ZipEntry[] = post.media.map((m, i) => ({
    name: `${folder}${pad(i + 1)}-${m.file_name}`,
    url: m.url,
    size: m.size_bytes,
    downloadHref: downloadHref(m.id),
  }));
  if (post.caption) entries.push({ name: `${folder}copy.txt`, text: post.caption });
  return entries;
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const dims = size === "lg" ? "h-20 w-20 text-2xl sm:h-36 sm:w-36 sm:text-5xl p-[3px]" : "h-8 w-8 text-xs p-[2px]";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-brand-500 to-purple-600 ${dims}`}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-white font-bold">
        {name.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}

/** Acciones de una publicación: descargar el archivo visible, todo el carrusel y copiar el copy. */
export function PostActions({ post, current, zipBase }: { post: FeedPostData; current: number; zipBase: string }) {
  const count = post.media.length;
  const active = post.media[current];
  // En el teléfono, lo principal es guardar en Fotos; la descarga va a Archivos.
  const mobile = useSaveToPhotosPlatform() !== null;
  const g = useI18n().t.gallery;
  const pos = count > 1 ? ` ${current + 1}/${count}` : "";
  return (
    <div className="flex flex-wrap gap-2">
      {active ? (
        <SaveToPhotosButton
          media={[active]}
          label={g.saveItem(active.kind === "video", pos)}
          className="btn-primary px-3 py-1.5 text-xs"
        />
      ) : null}
      {count > 1 ? (
        <SaveToPhotosButton
          media={post.media}
          label={g.saveCarousel(count)}
          className="btn-secondary px-3 py-1.5 text-xs"
        />
      ) : null}
      {active ? (
        <a href={downloadHref(active.id)} className={`${mobile ? "btn-secondary" : "btn-primary"} px-3 py-1.5 text-xs`} download>
          ↓ {mobile ? g.files : g.downloadItem(active.kind === "video")}
          {pos}
        </a>
      ) : null}
      {count > 1 && !mobile ? (
        <DownloadAllButton
          entries={postZipEntries(post)}
          zipName={`${zipBase}.zip`}
          label={g.downloadCarousel(count)}
          className="btn-secondary px-3 py-1.5 text-xs"
        />
      ) : null}
      {post.caption ? <CopyButton text={post.caption} className="btn-secondary px-3 py-1.5 text-xs" label={g.copyCaption} /> : null}
    </div>
  );
}

/** Publicación como en el feed de Instagram del teléfono. */
export function FeedPost({
  post,
  authorName,
  index,
  zipPrefix,
}: {
  post: FeedPostData;
  authorName: string;
  index: number;
  zipPrefix: string;
}) {
  const [current, setCurrent] = useState(0);
  const onIndexChange = useCallback((i: number) => setCurrent(i), []);
  const count = post.media.length;
  const g = useI18n().t.gallery;

  return (
    <article id={`post-${post.id}`} className="bg-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar name={authorName} />
        <span className="text-sm font-semibold">{authorName}</span>
        <span className="ml-auto text-xs text-neutral-400">{count > 1 ? g.carouselCount(count) : `#${index + 1}`}</span>
      </header>

      {count > 0 ? <MediaCarousel media={post.media} onIndexChange={onIndexChange} eager={index < 2} /> : null}

      <div className="px-4 pt-3">
        <PostActions post={post} current={current} zipBase={`${zipPrefix}-${g.postSlug}-${pad(index + 1)}`} />
      </div>

      {post.caption ? (
        <p className="whitespace-pre-wrap px-4 pt-3 text-sm">
          <span className="mr-1 font-semibold">{authorName}</span>
          {post.caption}
        </p>
      ) : null}
      <div className="pb-6" />
    </article>
  );
}

