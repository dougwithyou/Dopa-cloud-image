import { requireCreator } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { CheckIcon, DownloadIcon } from "@/components/icons";
import { deleteLead } from "../actions";

export const metadata = { title: "Contactos" };

/** Contactos captados en las galerías compartidas por enlace. */
export default async function ContactsPage() {
  const { supabase } = await requireCreator();
  const { data: leads } = await supabase
    .from("gallery_leads")
    .select("id, first_name, last_name, email, marketing_consent, visits, created_at, projects(title)")
    .order("created_at", { ascending: false })
    .limit(1000);

  const total = leads?.length ?? 0;
  const consenting = (leads ?? []).filter((l) => l.marketing_consent).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="dash-title">
            Contactos<sup>({total})</sup>
          </h1>
          <p className="mt-2 max-w-2xl text-neutral-500">
            Personas que entraron a tus galerías compartidas por enlace · {total} en total · {consenting} aceptan recibir
            correos de marketing
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/contacts/export?consent=1" className="btn-primary">
            <DownloadIcon className="h-4 w-4" /> Exportar para email marketing
          </a>
          <a href="/api/contacts/export" className="btn-secondary">
            <DownloadIcon className="h-4 w-4" /> Exportar todos (CSV)
          </a>
        </div>
      </div>

      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Para enviar correos de marketing usa solo los contactos que lo aceptaron: es lo que exigen las leyes (como CAN-SPAM o
        GDPR) y plataformas como Mailchimp o Brevo. El botón “Exportar para email marketing” incluye solo a esas personas.
      </p>

      {total === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          Aún no hay contactos. Activa “Compartir por enlace” en una galería y comparte el link.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Galería</th>
                <th className="px-4 py-3 font-medium">Marketing</th>
                <th className="px-4 py-3 font-medium">Visitas</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(leads ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium">
                    {l.first_name} {l.last_name}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{l.email}</td>
                  <td className="px-4 py-3 text-neutral-600">{l.projects?.title ?? "—"}</td>
                  <td className="px-4 py-3">
                    {l.marketing_consent ? (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <CheckIcon className="h-4 w-4" /> Sí
                      </span>
                    ) : (
                      <span className="text-neutral-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{l.visits}</td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(l.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteLead}>
                      <input type="hidden" name="leadId" value={l.id} />
                      <SubmitButton
                        className="btn-ghost px-2 py-1 text-xs text-red-600"
                        pendingLabel="…"
                        confirm={`¿Eliminar a ${l.first_name} ${l.last_name} de tus contactos?`}
                      >
                        Eliminar
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
