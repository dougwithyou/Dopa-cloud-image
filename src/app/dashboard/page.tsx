import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL } from "@/lib/format";
import { ProjectThumb } from "@/components/project-thumb";
import { loadProjectCovers } from "@/lib/project-covers";
import { ChevronRightIcon, FolderPlusIcon, FoldersIcon, MailIcon, UserPlusIcon } from "@/components/icons";

export const metadata = { title: "Inicio" };

const ACTIONS = [
  {
    href: "/dashboard/clients",
    title: "Agregar cliente",
    description: "Registra a un cliente y gestiona su acceso.",
    Icon: UserPlusIcon,
  },
  {
    href: "/dashboard/projects/new",
    title: "Nuevo proyecto",
    description: "Crea una galería o un feed y sube el material.",
    Icon: FolderPlusIcon,
  },
  {
    href: "/dashboard/projects",
    title: "Proyectos anteriores",
    description: "Revisa, edita y publica tus proyectos.",
    Icon: FoldersIcon,
  },
  {
    href: "/dashboard/contacts",
    title: "Contactos",
    description: "Correos captados en tus galerías compartidas.",
    Icon: MailIcon,
  },
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { supabase, creator } = await requireCreator();
  const { checkout } = await searchParams;
  const { data: recent } = await supabase
    .from("projects")
    .select("id, title, type, status, design, clients(name)")
    .order("updated_at", { ascending: false })
    .limit(4);
  const covers = await loadProjectCovers(supabase, recent ?? []);

  return (
    <div className="space-y-10">
      {checkout === "success" ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          ¡Listo! Tu prueba gratuita comenzó. Empieza creando tu primer proyecto.
        </p>
      ) : null}

      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hola, {creator.business_name}</h1>
        <p className="mt-1 text-neutral-500">¿Qué quieres hacer hoy?</p>
      </div>

      <nav className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Acciones principales">
        {ACTIONS.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-row items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-900 hover:shadow-md sm:flex-col sm:items-start sm:p-6"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition group-hover:bg-brand-500 sm:h-14 sm:w-14">
              <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold sm:text-lg">{title}</span>
              <span className="mt-0.5 block text-sm text-neutral-500">{description}</span>
            </span>
          </Link>
        ))}
      </nav>

      {recent && recent.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Continuar donde lo dejaste</h2>
          <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 sm:px-5">
                  <ProjectThumb cover={covers.get(p.id)} className="h-12 w-12 shrink-0 rounded-lg [&_svg]:h-5 [&_svg]:w-5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {p.clients?.name ?? "Sin cliente"} · {PROJECT_TYPE_LABEL[p.type]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">{PROJECT_STATUS_LABEL[p.status]}</span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
