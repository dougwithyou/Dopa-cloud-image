import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { canUpload } from "@/lib/subscription";
import { signDownloadUrl } from "@/lib/r2";
import { ACCEPT_ATTRIBUTE } from "@/lib/upload-rules";
import { PROJECT_STATUS_LABEL, PROJECT_TYPE_HELP, PROJECT_TYPE_LABEL } from "@/lib/format";
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
import { EyeIcon, ImageIcon, LinkIcon } from "@/components/icons";
import { MediaLibrary, type LibraryItem } from "./media-library";
import { FeedGridEditor } from "./feed-grid-editor";
import { BackLink } from "@/components/back-home";
import { Folder, folderColor, StatusTab } from "@/components/dashboard/folder";

export const metadata = { title: "Proyecto" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, status, client_id, share_enabled, share_token, clients(name, email, user_id, invited_at)")
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
    ? "Tu suscripción no está activa: no puedes agregar clientes nuevos."
    : atClientLimit
      ? `Tu plan permite ${creator.client_limit} clientes. Elige uno existente o cambia de plan.`
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
    : "Tu suscripción no está activa: las subidas nuevas están bloqueadas. Ve a Suscripción para resolverlo.";

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard/projects">Proyectos</BackLink>
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Folder color={folderColor(project.type, project.status)} tab={<StatusTab status={project.status} />}>
            <div className="flex h-full flex-col px-5 pt-3 pb-5 sm:px-6">
              <ProjectTitleEditor projectId={project.id} title={project.title} />
              <p className="mt-1 text-sm text-black/60">{PROJECT_TYPE_LABEL[project.type]}</p>
              <div className="mt-auto pt-5">
                <div className="folder-dots" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {project.type === "photo_session" ? (
                  <Link href={`/design/${project.id}`} className="btn-secondary">
                    <ImageIcon className="h-4 w-4" /> Diseñar galería
                  </Link>
                ) : null}
                <Link href={`/preview/${project.id}`} target="_blank" className="btn-secondary">
                  <EyeIcon className="h-4 w-4" /> Vista previa
                </Link>
              </div>
            </div>
          </Folder>

          <div className="relative overflow-hidden rounded-[26px] bg-neutral-950 p-5 text-white sm:p-6">
            <svg viewBox="0 0 200 200" className="pointer-events-none absolute -right-16 -bottom-20 h-56 w-56 text-white/10" aria-hidden>
              <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="22" />
            </svg>
            <p className="relative text-lg">Detalles del proyecto</p>
            <dl className="relative mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-white/50">Estado</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      project.status === "published" ? "bg-green-400" : project.status === "draft" ? "bg-dash-yellow" : "bg-white/40"
                    }`}
                  />
                  {PROJECT_STATUS_LABEL[project.status]}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-white/50">Cliente</dt>
                <dd className="mt-1 truncate text-sm">{client?.name ?? "Sin cliente"}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">{isFeed ? "Publicaciones" : "Fotos"}</dt>
                <dd className="mt-1 text-sm">
                  {isFeed ? posts.length : files.filter((f) => f.kind === "photo" && f.upload_status === "complete").length}
                </dd>
              </div>
            </dl>
            <p className="relative mt-4 text-sm text-white/60">
              {project.status === "published"
                ? client
                  ? client.user_id
                    ? `Visible en el portal de ${client.name}.`
                    : `${client.name} lo verá cuando entre con el enlace que le enviamos por correo.`
                  : "Publicado, pero sin cliente: agrega uno para que alguien lo vea."
                : project.status === "draft"
                  ? `Solo tú lo ves. Cuando lo publiques, ${client ? client.name : "el cliente"} recibirá su acceso.`
                  : "Archivado: tu cliente ya no lo ve."}
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
                      {status === "published" ? "Publicar" : status === "draft" ? "Pasar a borrador" : "Archivar"}
                    </SubmitButton>
                  </form>
                ))}
            </div>
          </div>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Plantilla para el cliente</h2>
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
                    {PROJECT_TYPE_LABEL[type]}
                    {active ? <span className="badge bg-neutral-900 text-white">En uso</span> : null}
                  </span>
                  <span className="mt-1 block text-xs text-neutral-500">{PROJECT_TYPE_HELP[type]}</span>
                </button>
              </form>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Usa <Link href={`/preview/${project.id}`} target="_blank" className="font-semibold text-neutral-900 underline">Vista previa</Link>{" "}
          para ver exactamente lo que verá tu cliente.
        </p>
      </section>

      {project.type === "photo_session" ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <LinkIcon className="h-4 w-4" /> Compartir por enlace
              </h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-500">
                Cualquiera con el enlace puede ver la galería después de dejar su nombre, apellido y correo. Los datos se
                guardan en{" "}
                <Link href="/dashboard/contacts" className="font-semibold text-neutral-900 underline">
                  Contactos
                </Link>
                {leadCount > 0 ? ` (${leadCount} ${leadCount === 1 ? "persona" : "personas"} desde esta galería)` : ""}.
              </p>
            </div>
            {project.share_enabled ? (
              <form action={disableShareLink}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pendingLabel="…">
                  Desactivar
                </SubmitButton>
              </form>
            ) : (
              <form action={enableShareLink}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton className="btn-primary" pendingLabel="Activando…">
                  <LinkIcon className="h-4 w-4" /> Activar enlace
                </SubmitButton>
              </form>
            )}
          </div>
          {project.share_enabled && project.share_token ? (
            <div className="mt-4 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={shareUrl(project.share_token)} className="input flex-1 font-mono text-xs" aria-label="Enlace de la galería" />
                <CopyButton text={shareUrl(project.share_token)} className="btn-primary" label="Copiar enlace" />
              </div>
              <form action={regenerateShareLink}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton
                  className="btn-ghost px-0 text-xs text-neutral-500"
                  pendingLabel="…"
                  confirm="¿Generar un enlace nuevo? El enlace actual dejará de funcionar."
                >
                  Generar un enlace nuevo
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">Cliente</h2>
        {client ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-neutral-500">{client.email}</p>
                <p className="mt-1 text-xs">
                  {client.user_id ? (
                    <span className="badge bg-green-50 text-green-700">Ya tiene acceso a su portal</span>
                  ) : client.invited_at ? (
                    <span className="badge bg-amber-50 text-amber-700">Acceso enviado, aún no ha entrado</span>
                  ) : (
                    <span className="badge bg-neutral-100 text-neutral-700">Recibirá su acceso al publicar</span>
                  )}
                </p>
              </div>
              <form action={removeClientFromProject}>
                <input type="hidden" name="projectId" value={project.id} />
                <SubmitButton
                  className="btn-secondary px-3 py-1.5 text-xs"
                  pendingLabel="Quitando…"
                  confirm={`¿Quitar a ${client.name} de este proyecto? Dejará de verlo en su portal.`}
                >
                  Quitar del proyecto
                </SubmitButton>
              </form>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-900">Cambiar de cliente</summary>
              <div className="mt-3">
                <AddClientToProjectForm
                  projectId={project.id}
                  clients={clients ?? []}
                  currentClientId={project.client_id}
                  disabledReason={newClientBlocked}
                  submitLabel="Cambiar cliente"
                />
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              Este proyecto aún no tiene cliente. Agrégalo para que pueda verlo en su portal.
            </p>
            <AddClientToProjectForm projectId={project.id} clients={clients ?? []} disabledReason={newClientBlocked} />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl tracking-tight">
            <StepNumber n={1} /> Material del proyecto
          </h2>
          <p className="text-sm text-neutral-500">
            {isFeed
              ? "Sube aquí todo el material. Después selecciona archivos para armar cada publicación o carrusel."
              : "Sube aquí todas las fotos y videos de la sesión. Tu cliente verá la galería completa, en este orden."}
          </p>
        </div>
        <Uploader projectId={project.id} accept={ACCEPT_ATTRIBUTE} disabledReason={uploadBlocked} />
        <MediaLibrary
          projectId={project.id}
          template={isFeed ? "feed" : "gallery"}
          items={library}
          posts={posts.map((p, i) =>
            isFeed
              ? { id: p.id, label: `Publicación ${i + 1}${p.assets.length > 1 ? ` (carrusel · ${p.assets.length})` : ""}` }
              : { id: p.id, label: `Escena ${i + 1}${p.caption ? ` · ${p.caption.split("\n")[0]}` : ""}` },
          )}
        />
      </section>

      {isFeed ? (
        <section>
          <h2 className="flex items-center gap-2.5 text-xl tracking-tight">
            <StepNumber n={2} /> Publicaciones <span className="text-neutral-400">({posts.length})</span>
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            Así verá el feed tu cliente. Arrástralas para cambiar el orden y toca una para editar su copy.
          </p>
          {posts.length === 0 ? (
            <div className="card p-8 text-center text-sm text-neutral-500">
              Aún no hay publicaciones. Selecciona archivos en el material y pulsa “Crear publicación”.
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
                <StepNumber n={2} /> Escenas <span className="text-neutral-400">({posts.length})</span>
              </h2>
              <p className="text-sm text-neutral-500">
                Opcional: secciones con título, como “Ceremonia” o “Recepción”. Las fotos sin escena aparecen al final.
              </p>
            </div>
            <Link href={`/design/${project.id}`} className="btn-primary">
              <ImageIcon className="h-4 w-4" /> Diseñar galería
            </Link>
          </div>
          {posts.length === 0 ? (
            <div className="card p-6 text-center text-sm text-neutral-500">
              Sin escenas: tu cliente ve todas las fotos juntas. Para crear una, selecciona fotos en el material y pulsa “Crear escena”.
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
          <SubmitButton className="btn-danger" pendingLabel="Eliminando…" confirm="¿Eliminar el proyecto y todos sus archivos? No se puede deshacer.">
            Eliminar proyecto y todos sus archivos
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
