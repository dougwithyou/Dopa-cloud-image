import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { loadProjectCovers } from "@/lib/project-covers";
import { ProjectFolder } from "@/components/dashboard/folder";
import { ArrowRightIcon, BagIcon, FolderPlusIcon, FoldersIcon, MailIcon, PlusIcon, UserPlusIcon } from "@/components/icons";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dash.homePage.meta };
}

const ACTIONS = [
  { href: "/dashboard/clients", Icon: UserPlusIcon },
  { href: "/dashboard/projects/new", Icon: FolderPlusIcon },
  { href: "/dashboard/projects", Icon: FoldersIcon },
  { href: "/dashboard/contacts", Icon: MailIcon },
  { href: "/dashboard/store", Icon: BagIcon },
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { supabase, creator } = await requireCreator();
  const { checkout } = await searchParams;
  const h = (await getI18n()).t.dash.homePage;
  const { data: recent, count } = await supabase
    .from("projects")
    .select("id, title, type, status, design, clients(name), posts(count)", { count: "exact" })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(6);
  const summaries = await loadProjectCovers(supabase, recent ?? []);

  return (
    <div className="space-y-10">
      {checkout === "success" ? (
        <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
          {h.trialStarted}
        </p>
      ) : null}

      <div>
        <p className="text-neutral-500">{h.hello(creator.business_name)}</p>
        <h1 className="dash-title mt-1">
          {h.titleA}
          <br />
          {h.titleB}
          {count ? <sup>({count})</sup> : null}
        </h1>
      </div>

      <section aria-label={h.recent}>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {(recent ?? []).map((p) => (
            <ProjectFolder
              key={p.id}
              className="w-[min(78vw,290px)] shrink-0 snap-start"
              summary={summaries.get(p.id)}
              project={{
                id: p.id,
                title: p.title,
                type: p.type,
                status: p.status,
                clientName: p.clients?.name ?? null,
                postCount: (p.posts as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
              }}
            />
          ))}
          <Link
            href="/dashboard/projects/new"
            className="flex min-h-[236px] w-[min(60vw,220px)] shrink-0 snap-start flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-dashed border-neutral-300 text-sm font-medium text-neutral-500 transition hover:border-neutral-950 hover:text-neutral-950"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-950 text-white">
              <PlusIcon />
            </span>
            {h.newProject}
          </Link>
        </div>
        {count && count > (recent?.length ?? 0) ? (
          <Link href="/dashboard/projects" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
            {h.viewAll} <ArrowRightIcon className="h-4 w-4" />
          </Link>
        ) : null}
      </section>

      <section className="rounded-[30px] bg-white p-3 sm:p-4">
        <h2 className="px-3 pt-2 pb-3 text-xl tracking-tight sm:text-2xl">{h.today}</h2>
        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label={h.mainActions}>
          {ACTIONS.map(({ href, Icon }, i) => (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-4 rounded-[22px] p-4 transition hover:-translate-y-0.5 sm:flex-col sm:items-start sm:p-5 ${
                i % 2 === 0 ? "bg-dash-yellow-soft" : "bg-dash-blue-soft"
              }`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white transition group-hover:scale-105">
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{h.actions[i].title}</span>
                <span className="mt-0.5 block text-sm text-neutral-600">{h.actions[i].description}</span>
              </span>
              <ArrowRightIcon className="h-5 w-5 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-950 sm:hidden" />
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
