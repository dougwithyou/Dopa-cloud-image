import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { findSharedGallery, hasVisitorAccess } from "@/lib/share";
import { loadProjectContent } from "@/lib/project-content";
import { signDownloadUrl } from "@/lib/r2";
import { parseDesign } from "@/lib/gallery-design";
import { APP_NAME } from "@/lib/env";
import { ProjectView } from "@/components/templates/project-view";
import { GateForm } from "./gate-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Galería", robots: { index: false, follow: false } };

/**
 * Galería compartida por enlace. Quien entra deja nombre, apellido y correo
 * (se guardan como contacto del creador) y después ve la galería.
 */
export default async function SharedGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gallery = await findSharedGallery(token);

  if (!gallery) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-4 text-center">
        <h1 className="text-2xl font-semibold">Este enlace no está disponible</h1>
        <p className="mt-2 max-w-sm text-sm text-neutral-500">
          La galería ya no se comparte por enlace o la dirección es incorrecta. Pide un enlace nuevo a quien te la envió.
        </p>
        <p className="mt-10 text-xs text-neutral-400">{APP_NAME}</p>
      </main>
    );
  }

  const admin = createAdminClient();

  if (await hasVisitorAccess(gallery.id)) {
    const content = await loadProjectContent(admin, gallery.id);
    return (
      <ProjectView
        project={gallery}
        authorName={gallery.businessName}
        posts={content.posts}
        library={content.library}
        downloadBase={`/api/share/${token}/download/`}
      />
    );
  }

  // Formulario de acceso, con la foto de portada de fondo.
  const design = parseDesign(gallery.design);
  const coverQuery = admin
    .from("assets")
    .select("r2_key")
    .eq("project_id", gallery.id)
    .eq("kind", "photo")
    .eq("upload_status", "complete");
  const { data: coverRow } = design.coverAssetId
    ? await coverQuery.eq("id", design.coverAssetId).maybeSingle()
    : await coverQuery.order("created_at").limit(1).maybeSingle();
  const coverUrl = coverRow ? await signDownloadUrl(coverRow.r2_key, { disposition: "inline" }) : null;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-neutral-900 px-4 py-10">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-md" />
      ) : null}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{gallery.businessName}</p>
        <h1 className="mt-3 font-serif text-3xl uppercase tracking-[0.12em]">{gallery.title}</h1>
        <p className="mb-6 mt-3 text-sm text-neutral-600">Déjanos tus datos para ver la galería.</p>
        <GateForm token={token} businessName={gallery.businessName} />
      </div>
    </main>
  );
}
