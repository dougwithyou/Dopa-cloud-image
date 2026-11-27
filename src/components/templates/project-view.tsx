import type { ProjectType } from "@/types/database";
import type { FeedMedia, FeedPostData } from "@/components/feed-post";
import { formatDate } from "@/lib/format";
import { parseDesign } from "@/lib/gallery-design";
import { InstagramFeedTemplate } from "./instagram-feed";
import { PhotoGalleryTemplate } from "./photo-gallery";
import type { StoreConfig } from "@/lib/store-types";
import { getI18n } from "@/i18n/server";

/** Título de una escena: la primera línea de su texto. */
export function sceneTitle(caption: string | null, index: number, fallback: (n: number) => string): string {
  const first = caption?.split("\n")[0]?.trim();
  return first ? first.slice(0, 80) : fallback(index + 1);
}

/** Elige la plantilla según el tipo de proyecto. Lo usan el portal y la vista previa. */
export async function ProjectView({
  project,
  authorName,
  posts,
  library,
  downloadBase,
  store,
}: {
  project: { title: string; type: ProjectType; created_at: string; design?: unknown };
  authorName: string;
  posts: FeedPostData[];
  library: FeedMedia[];
  /** Ruta de descarga para visitantes del enlace público. */
  downloadBase?: string;
  /** Tienda de impresiones (solo galerías de fotos). */
  store?: StoreConfig | null;
}) {
  const { t, locale } = await getI18n();
  if (project.type === "photo_session") {
    return (
      <PhotoGalleryTemplate
        title={project.title}
        authorName={authorName}
        date={formatDate(project.created_at, locale)}
        items={library}
        scenes={posts.map((p, i) => ({ id: p.id, title: sceneTitle(p.caption, i, t.gallery.scene), media: p.media }))}
        design={parseDesign(project.design)}
        downloadBase={downloadBase}
        store={store}
      />
    );
  }
  return <InstagramFeedTemplate title={project.title} authorName={authorName} posts={posts} />;
}
