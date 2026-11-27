import Link from "next/link";
import { ImageIcon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { signDownloadUrl } from "@/lib/r2";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.portal.myProjects };
}

export default async function PortalPage() {
  const { supabase, user } = await requireUser("/portal");
  const { t, locale } = await getI18n();

  // RLS limita los resultados a proyectos publicados del cliente autenticado
  // cuyo creador tiene la suscripción al día o está en periodo de gracia.
  const [{ data: projects }, { data: creators }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, type, creator_id, created_at, clients!inner(user_id)")
      .eq("clients.user_id", user.id)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase.rpc("my_creators"),
  ]);

  const creatorName = new Map((creators ?? []).map((c) => [c.id, c.business_name]));

  // Portada: primera foto completada de cada proyecto.
  const ids = (projects ?? []).map((p) => p.id);
  const { data: covers } = ids.length
    ? await supabase
        .from("assets")
        .select("project_id, r2_key, position")
        .in("project_id", ids)
        .eq("kind", "photo")
        .order("position")
    : { data: [] };
  const coverByProject = new Map<string, string>();
  for (const c of covers ?? []) {
    if (c.r2_key && !coverByProject.has(c.project_id)) coverByProject.set(c.project_id, c.r2_key);
  }
  const coverUrls = new Map(
    await Promise.all(
      [...coverByProject].map(async ([pid, key]) => [pid, await signDownloadUrl(key, { disposition: "inline" })] as const),
    ),
  );

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">{t.portal.yourProjects}</h1>
      {projects && projects.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/portal/${p.id}`} className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="aspect-square bg-neutral-100">
                  {coverUrls.get(p.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrls.get(p.id)} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-neutral-400">
                      <ImageIcon className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold">{p.title}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {creatorName.get(p.creator_id) ?? ""} · {t.labels.projectType[p.type]}
                  </p>
                  <p className="text-xs text-neutral-400">{formatDate(p.created_at, locale)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          {t.portal.empty}
        </div>
      )}
    </div>
  );
}
