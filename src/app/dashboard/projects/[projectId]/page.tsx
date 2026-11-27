import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { canUpload } from "@/lib/subscription";
import { signDownloadUrl } from "@/lib/r2";
import { ACCEPT_ATTRIBUTE } from "@/lib/upload-rules";
import { getI18n } from "@/i18n/server";
import { Uploader } from "@/components/uploader";
import { SubmitButton } from "@/components/submit-button";
import { AddClientToProjectForm, ProjectTitleEditor } from "../../forms";
import {
  deleteProject,
  disableShareLink,
  enableShareLink,
  regenerateShareLink,
  removeClientFromProject,
  updateProjectStatus,
  updateProjectType,
} from "../../actions";
import { CopyButton } from "@/components/copy-button";
import { shareUrl } from "@/lib/share";
import { PostCard, type EditorAsset, type EditorPost } from "./post-card";
import { BagIcon, EyeIcon, ImageIcon, LinkIcon } from "@/components/icons";
import { setProjectStore } from "../../store/actions";
import { MediaLibrary, type LibraryItem } from "./media-library";
import { FeedGridEditor } from "./feed-grid-editor";
import { BackLink } from "@/components/back-home";
import { Folder, folderColor, StatusTab } from "@/components/dashboard/folder";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.project.meta };
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();
  const { t } = await getI18n();
  const P = t.project;

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, status, client_id, share_enabled, share_token, store_enabled, clients(name, email, user_id, invited_at)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: clients }, { count: leadCountRaw }] = await Promise.all([
    supabase.from("clients").select("id, name, email").order("name"),
    supabase.from("gallery_leads").select("id", { count: "exact", head: true }).eq("project_id", project.id),
  ]);
  const leadCount = leadCountRaw ?? 0;
  const client = project.clients;
  const atClientLimit = creator.client_limit !== null && (clients?.length ?? 0) >= creator.client_limit;
  const newClientBlocked = !canUpload(creator)
    ? P.inactiveClients
    : atClientLimit
      ? P.clientLimit(creator.client_limit ?? 0)
      : undefined;

  const [{ data: postRows }, { data: assetRows }] = await Promise.all([
    supabase
      .from("posts")
      .select("id, caption, position, created_at")
      .eq("project_id", project.id)
      .order("position")
      .order("created_at"),
    supabase
      .from("assets")
      .select("id, post_id, kind, r2_key, file_name, size_bytes, upload_status, position, created_at")
      .eq("project_id", project.id)
      .order("created_at"),
  ]);

  // URLs firmadas una sola vez por archivo.
  const files = await Promise.all(
    (assetRows ?? []).map(async (a) => ({
      ...a,
      url: a.upload_status === "complete" ? await signDownloadUrl(a.r2_key, { disposition: "inline" }) : null,
    })),
  );
  const postNumber = new Map((postRows ?? []).map((p, i) => [p.id, i + 1]));

  const posts: EditorPost[] = (postRows ?? []).map((p) => ({
    id: p.id,
    caption: p.caption,
    assets: files
      .filter((f) => f.post_id === p.id)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map(
        (f): EditorAsset => ({
          id: f.id,
          kind: f.kind,
          file_name: f.file_name,
          size_bytes: f.size_bytes,
          upload_status: f.upload_status,
          url: f.url,
        }),
      ),
  }));

  const library: LibraryItem[] = files.map((f) => ({
    id: f.id,
    kind: f.kind,
    file_name: f.file_name,
    size_bytes: f.size_bytes,
    upload_status: f.upload_status,
    url: f.url,
    postNumber: f.post_id ? (postNumber.get(f.post_id) ?? null) : null,
  }));
  const isFeed = project.type === "monthly_content";

  const uploadBlocked = canUpload(creator)
    ? undefined
    : P.uploadBlocked;

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard/projects">{P.projects}</BackLink>
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Folder color={folderColor(project.type, project.status)} tab={<StatusTab status={project.status} />}>
            <div className="flex h-full flex-col px-5 pt-3 pb-5 sm:px-6">
              <ProjectTitleEditor projectId={project.id} title={project.title} />
              <p className="mt-1 text-sm text-black/60">{t.labels.projectType[project.type]}</p>
              <div className="mt-auto pt-5">
                <div className="folder-dots" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {project.type === "photo_session" ? (
                  <Link href={`/design/${project.id}`} className="btn-secondary">
                    <ImageIcon className="h-4 w-4" /> {P.designGallery}
                  </Link>
                ) : null}
                <Link href={`/preview/${project.id}`} target="_blank" className="btn-secondary">
                  <EyeIcon className="h-4 w-4" /> {P.preview}
                </Link>
              </div>
            </div>
          </Folder>

          <div className="relative overflow-hidden rounded-[26px] bg-neutral-950 p-5 text-white sm:p-6">
            <svg viewBox="0 0 200 200" className="pointer-events-none absolute -right-16 -bottom-20 h-56 w-56 text-white/10" aria-hidden>
              <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="22" />
            </svg>
            <p className="relative text-lg">{P.details}</p>
            <dl className="relative mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-white/50">{P.status}</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      project.status === "published" ? "bg-green-400" : project.status === "draft" ? "bg-dash-yellow" : "bg-white/40"
                    }`}
                  />
                  {t.labels.projectStatus[project.status]}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-white/50">{P.client}</dt>
                <dd className="mt-1 truncate text-sm">{client?.name ?? P.noClient}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">{isFeed ? P.postsLabel : P.photosLabel}</dt>
                <dd className="mt-1 text-sm">
                  {isFeed ? posts.length : files.filter((f) => f.kind === "photo" && f.upload_status === "complete").length}
                </dd>
              </div>
            </dl>
            <p className="relative mt-4 text-sm text-white/60">
              {project.status === "published"
                ? client
                  ? client.user_id
                    ? P.visibleIn(client.name)
                    : P.willSee(client.name)
                  : P.publishedNoClient
                : project.status === "draft"
                  ? P.draftOnly(client ? client.name : null)
                  : P.archivedNote}
            </p>
            <div className="relative mt-5 flex flex-wrap gap-2">
              {(["published", "draft", "archived"] as const)
                .filter((s) => s !== project.status)
                .map((status) => (
                  <form key={status} action={updateProjectStatus}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="status" value={status} />
                    <SubmitButton
                      className={status === "published" ? "btn-brand" : "btn rounded-full bg-white/10 px-5 text-white hover:bg-white/20"}
                      pendingLabel="…"
                    >
                      {P.statusAction[status]}
                    </SubmitButton>
                  </form>
                ))}
            </div>
          </div>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">{P.template}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["monthly_content", "photo_session"] as const).map((type) => {
            const active = project.type === type;
            return (
              <form key={type} action={updateProjectType}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="type" value={type} />
                <button
                  type="submit"
                  disabled={active}
                  className={`w-full rounded-[20px] border p-4 text-left transition ${
                    active
                      ? `border-transparent ${type === "photo_session" ? "bg-dash-yellow-soft" : "bg-dash-blue-soft"}`
                      : "border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <span className="flex items-center justify-between text-sm font-semibold">
                    {t.labels.projectType[type]}
                    {active ? <span className="badge bg-neutral-900 text-white">{P.inUse}</span> : null}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">{t.labels.projectTypeHelp[type]}</span>
                </button>
              </form>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          {P.useA}
          <Link href={`/preview/${project.id}`} target="_blank" className="font-semibold text-neutral-900 underline">
            {P.preview}
          </Link>
          {P.useB}
        </p>
      </section>

      {project.type === "photo_session" ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <LinkIcon className="h-4 w-4" /> {P.share.title}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-500">
                {P.share.textA}
                <Link href="/dashboard/contacts" className="font-semibold text-neutral-900 underline">
                  {P.share.contacts}
                </Link>
                {leadCount > 0 ? P.share.people(leadCount) : ""}.
              </p>
            </div>
            {project.share_enabled ? (
              <form action={disableShareLink}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingLabel="…">
                  {P.share.disable}
                </SubmitButton>
              </form>
            ) : (
              <form action={enableShareLink}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton className="btn-primary" pendingLabel={P.share.enabling}>
                  <LinkIcon className="h-4 w-4" /> {P.share.enable}
                </SubmitButton>
              </form>
            )}
          </div>
          {project.share_enabled && project.share_token ? (
            <div className="mt-4 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={shareUrl(project.share_token)} className="input flex-1 font-mono text-xs" aria-label={P.share.linkLabel} />
                <CopyButton text={shareUrl(project.share_token)} className="btn-primary" label={P.share.copy} />
              </div>
              <form action={regenerateShareLink}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton
                  className="btn-ghost px-0 text-xs text-neutral-500"
                  pendingLabel="…"
                  confirm={P.share.confirmNew}
                >
                  {P.share.regenerate}
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      {project.type === "photo_session" ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <BagIcon className="h-4 w-4" /> {P.store.title}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-500">
                {project.store_enabled
                  ? P.store.on
                  : P.store.off}{" "}
                <Link href="/dashboard/store" className="font-semibold text-neutral-900 underline">
                  {P.store.prices}
                </Link>
              </p>
              {project.store_enabled && !creator.connect_payouts_enabled ? (
                <p className="mt-2 text-sm text-amber-700">
                  {P.store.needsPayouts}
                </p>
              ) : null}
            </div>
            <form action={setProjectStore}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="enabled" value={project.store_enabled ? "false" : "true"} />
              <SubmitButton className={project.store_enabled ? "btn-secondary" : "btn-primary"} pendingLabel="…">
                {project.store_enabled ? P.store.disable : P.store.enable}
              </SubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">{P.clientSection.title}</h2>
        {client ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-neutral-500">{client.email}</p>
                <p className="mt-1 text-xs">
                  {client.user_id ? (
                    <span className="badge bg-green-50 text-green-700">{P.clientSection.hasAccess}</span>
                  ) : client.invited_at ? (
                    <span className="badge bg-amber-50 text-amber-700">{P.clientSection.invited}</span>
                  ) : (
                    <span className="badge bg-neutral-100 text-neutral-700">{P.clientSection.onPublish}</span>
                  )}
                </p>
              </div>
              <form action={removeClientFromProject}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton
                  className="btn-secondary px-3 py-1.5 text-xs"
                  pendingLabel={P.clientSection.removing}
                  confirm={P.clientSection.confirmRemove(client.name)}
                >
                  {P.clientSection.remove}
                </SubmitButton>
              </form>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-900">{P.clientSection.change}</summary>
              <div className="mt-3">
                <AddClientToProjectForm
                  projectId={project.id}
                  clients={clients ?? []}
                  currentClientId={project.client_id}
                  disabledReason={newClientBlocked}
                  submitLabel={P.clientSection.changeSubmit}
                />
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              {P.clientSection.none}
            </p>
            <AddClientToProjectForm projectId={project.id} clients={clients ?? []} disabledReason={newClientBlocked} />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl tracking-tight">
            <StepNumber n={1} /> {P.media.title}
          </h2>
          <p className="text-sm text-neutral-500">
            {isFeed
              ? P.media.feedHelp
              : P.media.galleryHelp}
          </p>
        </div>
        <Uploader projectId={project.id} accept={ACCEPT_ATTRIBUTE} disabledReason={uploadBlocked} />
        <MediaLibrary
          projectId={project.id}
          template={isFeed ? "feed" : "gallery"}
          items={library}
          posts={posts.map((p, i) =>
            isFeed
              ? { id: p.id, label: P.media.postLabel(i + 1, p.assets.length) }
              : { id: p.id, label: P.media.sceneLabel(i + 1, p.caption ? p.caption.split("\n")[0] : null) },
          )}
        />
      </section>

      {isFeed ? (
        <section>
          <h2 className="flex items-center gap-2.5 text-xl tracking-tight">
            <StepNumber n={2} /> {P.postsSection.title} <span className="text-neutral-400">({posts.length})</span>
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            {P.postsSection.help}
          </p>
          {posts.length === 0 ? (
            <div className="card p-8 text-center text-sm text-neutral-500">
              {P.postsSection.empty}
            </div>
          ) : (
            <FeedGridEditor projectId={project.id} posts={posts} />
          )}
        </section>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2.5 text-xl tracking-tight">
                <StepNumber n={2} /> {P.scenesSection.title} <span className="text-neutral-400">({posts.length})</span>
              </h2>
              <p className="text-sm text-neutral-500">
                {P.scenesSection.help}
              </p>
            </div>
            <Link href={`/design/${project.id}`} className="btn-primary">
              <ImageIcon className="h-4 w-4" /> {P.designGallery}
            </Link>
          </div>
          {posts.length === 0 ? (
            <div className="card p-6 text-center text-sm text-neutral-500">
              {P.scenesSection.empty}
            </div>
          ) : (
            <ul className="space-y-4">
              {posts.map((post, i) => (
                <PostCard key={post.id} post={post} index={i} total={posts.length} variant="scene" />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="border-t border-neutral-200 pt-6">
        <form action={deleteProject}>
          <input type="hidden" name="projectId" value={project.id} />
          <SubmitButton className="btn-danger" pendingLabel={P.deleting} confirm={P.confirmDelete}>
            {P.delete}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-sm font-medium text-white">{n}</span>
  );
}
