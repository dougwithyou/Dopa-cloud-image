import { requireCreator } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { CheckIcon, DownloadIcon } from "@/components/icons";
import { deleteLead } from "../actions";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.account.contacts.meta };
}

/** Contactos captados en las galerías compartidas por enlace. */
export default async function ContactsPage() {
  const { supabase } = await requireCreator();
  const { t, locale } = await getI18n();
  const c = t.account.contacts;
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
            {c.title}<sup>({total})</sup>
          </h1>
          <p className="mt-2 max-w-2xl text-neutral-500">
            {c.lead(total, consenting)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/contacts/export?consent=1" className="btn-primary">
            <DownloadIcon className="h-4 w-4" /> {c.exportMarketing}
          </a>
          <a href="/api/contacts/export" className="btn-secondary">
            <DownloadIcon className="h-4 w-4" /> {c.exportAll}
          </a>
        </div>
      </div>

      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {c.notice}
      </p>

      {total === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          {c.empty}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{c.cols.name}</th>
                <th className="px-4 py-3 font-medium">{c.cols.email}</th>
                <th className="px-4 py-3 font-medium">{c.cols.gallery}</th>
                <th className="px-4 py-3 font-medium">{c.cols.marketing}</th>
                <th className="px-4 py-3 font-medium">{c.cols.visits}</th>
                <th className="px-4 py-3 font-medium">{c.cols.date}</th>
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
                        <CheckIcon className="h-4 w-4" /> {c.yes}
                      </span>
                    ) : (
                      <span className="text-neutral-400">{c.no}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{l.visits}</td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(l.created_at, locale)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteLead}>
                      <input type="hidden" name="leadId" value={l.id} />
                      <SubmitButton
                        className="btn-ghost px-2 py-1 text-xs text-red-600"
                        pendingLabel="…"
                        confirm={c.confirmDelete(`${l.first_name} ${l.last_name}`)}
                      >
                        {c.delete}
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
