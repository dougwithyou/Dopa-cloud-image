"use client";

import { useI18n } from "@/i18n/client";
import { LanguageSwitch } from "@/components/language-switch";

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadAllButton } from "@/components/download-all-button";
import { MediaCarousel } from "@/components/media-carousel";
import {
  Avatar,
  FeedPost,
  PostActions,
  postZipEntries,
  type FeedPostData,
} from "@/components/feed-post";
import { pad, slugify, type ZipEntry } from "@/lib/zip-download";

function CarouselIcon() {
  const label = useI18n().t.gallery.carousel;
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 drop-shadow" fill="white" aria-label={label}>
      <path d="M8 3h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1V7a2 2 0 0 0-2-2H6V5a2 2 0 0 1 2-2Z" />
      <rect x="3" y="7" width="13" height="14" rx="2" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 drop-shadow" fill="white" aria-label="Video">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function Tile({ post, onOpen }: { post: FeedPostData; onOpen: () => void }) {
  const g = useI18n().t.gallery;
  const first = post.media[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block aspect-[4/5] w-full overflow-hidden bg-neutral-100"
      aria-label={g.openPost}
    >
      {first ? (
        first.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
          <img src={first.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <video src={`${first.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        )
      ) : (
        <span className="flex h-full items-center justify-center p-3 text-center text-xs text-neutral-600 line-clamp-6">
          {post.caption}
        </span>
      )}
      <span className="absolute right-2 top-2">
        {post.media.length > 1 ? <CarouselIcon /> : first?.kind === "video" ? <VideoIcon /> : null}
      </span>
      <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/25" />
    </button>
  );
}

/** Publicación abierta en computadora: como Instagram web (media a la izquierda, copy a la derecha). */
function DesktopModal({
  posts,
  index,
  authorName,
  zipPrefix,
  onClose,
  onNavigate,
}: {
  posts: FeedPostData[];
  index: number;
  authorName: string;
  zipPrefix: string;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const g = useI18n().t.gallery;
  const post = posts[index];
  const [current, setCurrent] = useState(0);
  const onIndexChange = useCallback((i: number) => setCurrent(i), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < posts.length - 1) onNavigate(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, posts.length, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose} role="dialog" aria-modal>
      <button type="button" onClick={onClose} aria-label={g.close} className="absolute right-4 top-3 text-3xl text-white">
        ×
      </button>
      {index > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          aria-label={g.prevPost}
          className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xl"
        >
          ‹
        </button>
      ) : null}
      {index < posts.length - 1 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          aria-label={g.nextPost}
          className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xl"
        >
          ›
        </button>
      ) : null}

      <div
        className="flex h-[min(90vh,860px)] w-full max-w-6xl overflow-hidden rounded-md bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1 bg-black">
          {post.media.length > 0 ? (
            <MediaCarousel key={post.id} media={post.media} fit="fill" onIndexChange={onIndexChange} eager dark />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-white/80">{post.caption}</div>
          )}
        </div>
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-neutral-200">
          <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
            <Avatar name={authorName} />
            <span className="text-sm font-semibold">{authorName}</span>
            <span className="ml-auto text-xs text-neutral-400">
              {index + 1} de {posts.length}
            </span>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
            {post.caption ? (
              <p className="whitespace-pre-wrap">
                <span className="mr-1 font-semibold">{authorName}</span>
                {post.caption}
              </p>
            ) : (
              <p className="text-neutral-400">{g.noCaption}</p>
            )}
          </div>
          <div className="space-y-2 border-t border-neutral-200 px-4 py-3">
            <PostActions
              key={post.id}
              post={post}
              current={current}
              zipBase={`${zipPrefix}-${g.postSlug}-${pad(index + 1)}`}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Publicación abierta en el teléfono: feed vertical empezando en la publicación elegida. */
function MobileFeed({
  posts,
  index,
  authorName,
  zipPrefix,
  onClose,
}: {
  posts: FeedPostData[];
  index: number;
  authorName: string;
  zipPrefix: string;
  onClose: () => void;
}) {
  const g = useI18n().t.gallery;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current?.querySelector(`#post-${posts[index].id}`);
    el?.scrollIntoView({ block: "start" });
  }, [index, posts]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 px-3">
        <button type="button" onClick={onClose} className="px-2 text-2xl" aria-label={g.back}>
          ‹
        </button>
        <span className="font-semibold">{g.posts}</span>
      </header>
      <div ref={scroller} className="flex-1 overflow-y-auto">
        {posts.map((p, i) => (
          <FeedPost key={p.id} post={p} authorName={authorName} index={i} zipPrefix={zipPrefix} />
        ))}
      </div>
    </div>
  );
}

/** Plantilla "Feed de Instagram": perfil + cuadrícula; al tocar se abre la publicación. */
export function InstagramFeedTemplate({
  title,
  authorName,
  posts,
}: {
  title: string;
  authorName: string;
  posts: FeedPostData[];
}) {
  const g = useI18n().t.gallery;
  const [open, setOpen] = useState<{ index: number; desktop: boolean } | null>(null);
  const zipPrefix = slugify(title);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const carousels = posts.filter((p) => p.media.length > 1).length;
  const files = posts.reduce((n, p) => n + p.media.length, 0);
  const allEntries: ZipEntry[] = posts.flatMap((p, i) => postZipEntries(p, `${pad(i + 1)}-publicacion/`));

  return (
    <div className="mx-auto w-full max-w-[935px] bg-white">
      <section className="flex items-center gap-5 px-4 py-6 sm:gap-16 sm:px-10 sm:py-10">
        <Avatar name={authorName} size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="truncate text-lg font-semibold sm:text-xl">{authorName}</h1>
            <p className="truncate text-sm text-neutral-500">{title}</p>
          </div>
          <div className="flex gap-5 text-sm">
            <span><strong>{posts.length}</strong> {g.postsCount}</span>
            <span><strong>{carousels}</strong> {g.carouselsCount}</span>
            <span className="hidden sm:inline"><strong>{files}</strong> {g.filesCount}</span>
          </div>
          <DownloadAllButton
            entries={allEntries}
            zipName={`${zipPrefix}.zip`}
            label={g.downloadAllCount(files)}
            className="btn-primary px-4 py-1.5 text-sm"
          />
        </div>
      </section>

      <div className="border-t border-neutral-200" />

      {posts.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">{g.noPosts}</p>
      ) : (
        <div className="grid grid-cols-3 gap-[3px] pt-[3px]">
          {posts.map((p, i) => (
            <Tile
              key={p.id}
              post={p}
              onOpen={() => setOpen({ index: i, desktop: window.matchMedia("(min-width: 768px)").matches })}
            />
          ))}
        </div>
      )}
      <div className="flex justify-center py-8 text-neutral-500">
        <LanguageSwitch />
      </div>

      {open?.desktop ? (
        <DesktopModal
          posts={posts}
          index={open.index}
          authorName={authorName}
          zipPrefix={zipPrefix}
          onClose={() => setOpen(null)}
          onNavigate={(i) => setOpen({ index: i, desktop: true })}
        />
      ) : null}
      {open && !open.desktop ? (
        <MobileFeed posts={posts} index={open.index} authorName={authorName} zipPrefix={zipPrefix} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

