import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { canUpload } from "@/lib/subscription";
import { signDownloadUrl } from "@/lib/r2";
import { ACCEPT_ATTRIBUTE } from "@/lib/upload-rules";
import { PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/format";
import { Uploader } from "@/components/uploader";
import { SubmitButton } from "@/components/submit-button";
import { AddClientToProjectForm } from "../../forms";
import { deleteProject, removeClientFromProject, updateProjectStatus } from "../../actions";
import { PostCard, type EditorPost } from "./post-card";

export const metadata = { title: "Proyecto" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, status, client_id, clients(name, email, user_id, invited_at)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const { data: clients } = await supabase.from("clients").select("id, name, email").order("name");
  const client = project.clients;
  const atClientLimit = creator.client_limit !== null && (clients?.length ?? 0) >= creator.client_limit;
  const newClientBlocked = !canUpload(creator)
    ? "Tu suscripción no está activa: no puedes agregar clientes nuevos."
    : atClientLimit
      ? `Tu plan permite ${creator.client_limit} clientes. Elige uno existente o cambia de plan.`
      : undefined;

  const { data: postRows } = await supabase
    .from("posts")
    .select("id, caption, position, created_at, assets(id, kind, r2_key, file_name, size_bytes, upload_status, position, created_at)")
    .eq("project_id", project.id)
    .order("position")
    .order("created_at");

  const posts: EditorPost[] = await Promise.all(
    (postRows ?? []).map(async (p) => ({
      id: p.id,
      caption: p.caption,
      assets: await Promise.all(
        [...(p.assets ?? [])]
          .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
          .map(async (a) => ({
            id: a.id,
            kind: a.kind,
            file_name: a.file_name,
            size_bytes: a.size_bytes,
            upload_status: a.upload_status,
            url: a.upload_status === "complete" ? await signDownloadUrl(a.r2_key, { disposition: "inline" }) : null,
          })),
      ),
    })),
  );

  const uploadBlocked = canUpload(creator)
    ? undefined
    : "Tu suscripción no está activa: las subidas nuevas están bloqueadas. Ve a Suscripción para resolverlo.";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/projects" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Proyectos
        </Link>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            <p className="text-neutral-500">
              {client?.name ?? "Sin cliente"} · {PROJECT_TYPE_LABEL[project.type]} · {PROJECT_STATUS_LABEL[project.status]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["draft", "published", "archived"] as const)
              .filter((s) => s !== project.status)
              .map((status) => (
                <form key={status} action={updateProjectStatus}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="status" value={status} />
                  <SubmitButton className={status === "published" ? "btn-brand" : "btn-secondary"} pendingLabel="…">
                    {status === "published" ? "Publicar" : status === "draft" ? "Pasar a borrador" : "Archivar"}
                  </SubmitButton>
                </form>
              ))}
          </div>
        </div>
        {project.status === "published" ? (
          <p className="mt-3 text-sm text-green-700">
            {client
              ? client.user_id
                ? `Publicado: visible en el portal de ${client.name}.`
                : `Publicado. ${client.name} lo verá cuando entre con el enlace que le enviamos por correo.`
              : "Publicado, pero sin cliente: agrega uno para que alguien lo vea."}
          </p>
        ) : project.status === "draft" ? (
          <p className="mt-3 text-sm text-neutral-500">
            Borrador: solo tú lo ves. Cuando lo publiques, {client ? client.name : "el cliente"} recibirá su acceso.
          </p>
        ) : null}
      </div>

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

      <section>
        <h2 className="mb-1 font-semibold">Subir contenido</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Elige si los archivos van como publicaciones separadas o juntos en un carrusel. Después escribe el copy de
          cada publicación.
        </p>
        <Uploader projectId={project.id} accept={ACCEPT_ATTRIBUTE} disabledReason={uploadBlocked} />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Publicaciones ({posts.length})</h2>
        {posts.length === 0 ? (
          <div className="card p-8 text-center text-sm text-neutral-500">
            Aún no hay publicaciones. Sube fotos o videos para crear la primera.
          </div>
        ) : (
          <ul className="space-y-4">
            {posts.map((post, i) => (
              <PostCard
                key={post.id}
                post={post}
                index={i}
                total={posts.length}
                projectId={project.id}
                uploadBlocked={uploadBlocked}
              />
            ))}
          </ul>
        )}
      </section>

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
