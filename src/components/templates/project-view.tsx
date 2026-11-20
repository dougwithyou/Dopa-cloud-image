import type { ProjectType } from "@/types/database";
import type { FeedPostData } from "@/components/feed-post";
import { formatDate } from "@/lib/format";
import { InstagramFeedTemplate } from "./instagram-feed";
import { PhotoGalleryTemplate } from "./photo-gallery";

/** Elige la plantilla según el tipo de proyecto. Lo usan el portal y la vista previa. */
export function ProjectView({
  project,
  authorName,
  posts,
}: {
  project: { title: string; type: ProjectType; created_at: string };
  authorName: string;
  posts: FeedPostData[];
}) {
  if (project.type === "photo_session") {
    return (
      <PhotoGalleryTemplate title={project.title} authorName={authorName} date={formatDate(project.created_at)} posts={posts} />
    );
  }
  return <InstagramFeedTemplate title={project.title} authorName={authorName} posts={posts} />;
}
