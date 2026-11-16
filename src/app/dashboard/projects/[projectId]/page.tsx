import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth";
import { canUpload } from "@/lib/subscription";
import { signDownloadUrl } from "@/lib/r2";
import { ACCEPT_ATTRIBUTE } from "@/lib/upload-rules";
import { formatBytes, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/format";
import { Uploader } from "@/components/uploader";
import { SubmitButton } from "@/components/submit-button";
import { AddCopyForm } from "../../forms";
import { deleteAsset, deleteProject, moveAsset, updateCaption, updateProjectStatus } from "../../actions";

export const metadata = { title: "Proyecto" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, creator } = await requireCreator();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, type, status, client_id, clients(name, user_id)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, kind, r2_key, file_name, mime_type, size_bytes, copy_text, upload_status, position, created_at")
    .eq("project_id", project.id)
    .order("position")
    .order("created_at");

  const withUrls = await Promise.all(
    (assets ?? []).map(async (a) => ({
      ...a,
      url: a.r2_key && a.upload_status === "complete" ? await signDownloadUrl(a.r2_key, { disposition: "inline" }) : null,
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
              {project.clients?.name} · {PROJECT_TYPE_LABEL[project.type]} · {PROJECT_STATUS_LABEL[project.status]}
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
                    {status === "published" ? "Publicar para el cliente" : status === "draft" ? "Pasar a borrador" : "Archivar"}
                  </SubmitButton>
                </form>
              ))}
          </div>
        </div>
        {project.status === "published" ? (
          <p className="mt-3 text-sm text-green-700">
            Visible en el portal de {project.clients?.name}
            {project.clients?.user_id ? "." : " (cuando acepte la invitación)."}
          </p>
        ) : project.status === "draft" ? (
          <p className="mt-3 text-sm text-neutral-500">Borrador: tu cliente aún no lo ve.</p>
        ) : null}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold">Subir fotos y videos</h2>
          <Uploader projectId={project.id} accept={ACCEPT_ATTRIBUTE} disabledReason={uploadBlocked} />
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Añadir texto</h2>
          {uploadBlocked ? <p className="text-sm text-neutral-500">Bloqueado mientras la suscripción no esté activa.</p> : <AddCopyForm projectId={project.id} />}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Contenido ({withUrls.length})</h2>
        {withUrls.length === 0 ? (
          <div className="card p-8 text-center text-sm text-neutral-500">Sube el primer archivo.</div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withUrls.map((asset, i) => (
              <li key={asset.id} className="card overflow-hidden">
                <div className="aspect-square bg-neutral-100">
                  {asset.kind === "photo" && asset.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={asset.file_name ?? ""} loading="lazy" className="h-full w-full object-cover" />
                  ) : asset.kind === "video" && asset.url ? (
                    <video src={asset.url} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
                  ) : asset.kind === "copy" ? (
                    <div className="flex h-full items-center justify-center p-6">
                      <p className="line-clamp-[8] whitespace-pre-wrap text-center text-sm">{asset.copy_text}</p>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-amber-700">Subida incompleta</div>
                  )}
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                    <span className="truncate">
                      {asset.kind === "copy" ? "Texto" : `${asset.file_name} · ${formatBytes(asset.size_bytes)}`}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <form action={moveAsset}>
                        <input type="hidden" name="assetId" value={asset.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button className="btn-ghost px-2 py-1" disabled={i === 0} aria-label="Mover antes">↑</button>
                      </form>
                      <form action={moveAsset}>
                        <input type="hidden" name="assetId" value={asset.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button className="btn-ghost px-2 py-1" disabled={i === withUrls.length - 1} aria-label="Mover después">↓</button>
                      </form>
                    </span>
                  </div>
                  {asset.upload_status === "complete" ? (
                    <form action={updateCaption} className="space-y-2">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <textarea
                        name="text"
                        className="input min-h-20 text-xs"
                        defaultValue={asset.copy_text ?? ""}
                        placeholder={asset.kind === "copy" ? "Texto" : "Caption / texto para esta publicación (opcional)"}
                        maxLength={10000}
                      />
                      <SubmitButton className="btn-secondary w-full px-3 py-1.5 text-xs" pendingLabel="Guardando…">
                        Guardar texto
                      </SubmitButton>
                    </form>
                  ) : null}
                  <form action={deleteAsset}>
                    <input type="hidden" name="assetId" value={asset.id} />
                    <SubmitButton className="btn-danger w-full px-3 py-1.5 text-xs" pendingLabel="Eliminando…" confirm="¿Eliminar este elemento? No se puede deshacer.">
                      Eliminar
                    </SubmitButton>
                  </form>
                </div>
              </li>
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
