import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { APP_NAME, portalGracePeriodDays } from "@/lib/env";
import { dashFont } from "@/lib/fonts";
import { PLANS, PLAN_IDS, TRIAL_DAYS, formatPrice, type PlanId } from "@/lib/plans";
import { Folder, type FolderColor } from "@/components/dashboard/folder";
import { Logo } from "@/components/logo";
import { ChipIcon, FloatingChip, PhoneMock, Shot, SquiggleLine } from "@/components/landing/visuals";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  DownloadIcon,
  GridIcon,
  ImageIcon,
  LayersIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  MoveIcon,
  PaletteIcon,
  PhoneIcon,
  TypeIcon,
} from "@/components/icons";

export const metadata = {
  title: { absolute: `${APP_NAME} · Entrega el contenido de tus clientes listo para publicar` },
};

const NAV = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#plantillas", label: "Plantillas" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
];

const STEPS = [
  { title: "Crea un proyecto", text: "Elige la plantilla: galería de fotos o feed de Instagram." },
  { title: "Sube todo el material", text: "Fotos y videos de hasta 5 GB, directo desde el navegador, sin comprimir." },
  { title: "Arma las publicaciones", text: "Selecciona de tu biblioteca, crea carruseles y escribe el copy de cada una." },
  { title: "Publica", text: "Tu cliente recibe su acceso por correo y lo ve todo en su portal privado." },
];

const TEMPLATES = [
  {
    color: "bg-dash-yellow text-neutral-950",
    Icon: ImageIcon,
    title: "Galería de fotos",
    text: "Portada, escenas, colores y tipografías a tu gusto. Una entrega elegante para cada sesión.",
  },
  {
    color: "bg-dash-blue text-white",
    Icon: GridIcon,
    title: "Feed de Instagram",
    text: "Tu cliente ve su perfil tal como quedará: publicaciones, carruseles y copies en orden.",
  },
  {
    color: "bg-neutral-950 text-white",
    Icon: LinkIcon,
    title: "Enlace para compartir",
    text: "Comparte la galería con un enlace. Quien entra deja su nombre y correo, y tú sumas contactos.",
  },
];

const FOR_YOU = [
  { Icon: LayersIcon, text: "Biblioteca para todo el material", tone: "yellow" },
  { Icon: MoveIcon, text: "Ordena el feed arrastrando", tone: "dark" },
  { Icon: PaletteIcon, text: "Diseña cada galería a tu estilo", tone: "outline" },
  { Icon: MailIcon, text: "Contactos para email marketing", tone: "blue" },
] as const;

const FOR_CLIENT = [
  { Icon: LockIcon, text: "Portal privado con su propio acceso", tone: "blue" },
  { Icon: LayersIcon, text: "Carruseles de hasta 20 archivos", tone: "outline" },
  { Icon: PhoneIcon, text: "Guarda directo en Fotos del iPhone", tone: "dark" },
  { Icon: DownloadIcon, text: "Descarga todo en calidad original", tone: "yellow" },
] as const;

const TILE_TONE = {
  yellow: "bg-dash-yellow text-neutral-950",
  blue: "bg-dash-blue text-white",
  dark: "bg-neutral-950 text-white",
  outline: "bg-white text-neutral-950 ring-1 ring-black/10",
} as const;

const AUDIENCES = [
  { shot: 0, tag: "Fotógrafos", title: "Sesiones de fotos", text: "Bodas, quinceañeras, retratos y eventos en una galería con tu marca." },
  { shot: 1, tag: "Creadores", title: "Contenido mensual", text: "El feed del mes de cada cliente, con sus copies listos para publicar." },
  { shot: 3, tag: "Agencias", title: "Varias marcas", text: "Todos tus clientes en un solo lugar, cada uno en su portal privado." },
];

const PLAN_FOLDER: Record<PlanId, { color: FolderColor; tab: string }> = {
  entry: { color: "gray", tab: "Para empezar" },
  medium: { color: "yellow", tab: "Recomendado" },
  high: { color: "blue", tab: "Para agencias" },
};

/** Pequeño cuadrado de color en una esquina, como acento. */
function Accent({ className }: { className: string }) {
  return <span className={`absolute h-3.5 w-3.5 rounded-[4px] ${className}`} aria-hidden />;
}

export default async function Home() {
  const { supabase, user } = await getSession();
  if (user) redirect(await homePathFor(supabase, user));
  const graceDays = portalGracePeriodDays();

  const faqs = [
    {
      q: "¿Necesito tarjeta para la prueba?",
      a: `Sí. Son ${TRIAL_DAYS} días gratis y no se cobra nada hasta que terminan. Puedes cancelar antes desde Configuración.`,
    },
    {
      q: "¿Mis clientes tienen que crear una cuenta?",
      a: "No necesitan contraseña: reciben un enlace de acceso por correo y entran directo a su portal.",
    },
    {
      q: "¿Qué archivos puedo subir?",
      a: "Fotos JPG, PNG, HEIC, WebP o AVIF de hasta 50 MB y videos MP4, MOV o WebM de hasta 5 GB.",
    },
    {
      q: "¿Un cliente puede ver el trabajo de otro?",
      a: "No. Cada cliente solo ve sus proyectos publicados. Tus borradores los ves solo tú.",
    },
    {
      q: "¿Qué pasa si cancelo?",
      a: `Tus clientes conservan el acceso a su portal durante ${graceDays} días para descargar su material.`,
    },
    { q: "¿Puedo cambiar de plan?", a: "Sí, cuando quieras, desde Configuración. El cambio se aplica al momento." },
  ];

  return (
    <div className={`dash ${dashFont.variable} min-h-dvh overflow-x-clip`}>
      {/* Navegación */}
      <header className="sticky top-0 z-30 bg-dash-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <Link href="/" aria-label={APP_NAME}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 rounded-full bg-white p-1 md:flex" aria-label="Secciones">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-4 py-1.5 text-sm text-neutral-600 transition hover:bg-dash-bg hover:text-neutral-950">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost px-4">
              Entrar
            </Link>
            <Link href="/signup" className="btn-primary px-4 sm:px-5">
              Probar gratis
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 pb-10 sm:space-y-6">
        {/* Portada */}
        <section className="relative overflow-hidden rounded-[36px] bg-white px-5 pt-10 pb-0 sm:px-10 sm:pt-14 lg:pb-14">
          <SquiggleLine className="absolute -top-10 right-[-140px] w-[620px] text-dash-bg sm:right-[-60px] lg:right-[34%] lg:w-[520px]" />
          <Accent className="top-6 right-6 bg-dash-yellow" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
                <span className="rounded-full bg-dash-yellow px-3 py-1">Fotógrafos</span>
                <span className="rounded-full bg-dash-blue px-3 py-1 text-white">Videógrafos</span>
                <span className="rounded-full bg-neutral-950 px-3 py-1 text-white">Agencias</span>
              </div>
              <h1 className="mt-6 text-[2.75rem] leading-[1] font-normal tracking-[-0.035em] sm:text-7xl">
                Entrega el contenido de tus clientes <span className="font-semibold">listo para publicar.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-neutral-600">
                Sube fotos, videos y copies una sola vez. Tu cliente los ve en una galería elegante o en su feed de Instagram, y descarga
                todo en un clic.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn-primary py-3.5 text-base">
                  Empieza tus {TRIAL_DAYS} días gratis <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <a href="#como-funciona" className="btn-secondary py-3.5 text-base">
                  Ver cómo funciona
                </a>
              </div>
              <p className="mt-4 text-sm text-neutral-500">Sin cobros durante la prueba · Cancela cuando quieras</p>
            </div>

            <div className="relative mx-auto h-[460px] w-full max-w-[420px] sm:h-[540px]">
              <Folder color="yellow" tab={<span className="rounded-full bg-white px-3 py-1 text-xs font-medium">Publicado</span>} className="absolute top-14 left-1 w-[58%] -rotate-6 sm:top-14 sm:w-[62%]">
                <div className="px-5 pt-2 pb-6">
                  <p className="text-lg leading-tight font-semibold">Boda Ana</p>
                  <p className="text-xs text-black/60">Galería de fotos · 86 fotos</p>
                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    {[0, 4, 2].map((n) => (
                      <Shot key={n} n={n} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                </div>
              </Folder>
              <PhoneMock className="absolute top-0 right-0 w-[60%] min-w-[220px] rotate-3" />
              <FloatingChip className="absolute bottom-24 left-2 sm:bottom-28">
                <ChipIcon kind="check" /> Guardado en Fotos
              </FloatingChip>
              <FloatingChip tone="dark" className="absolute right-4 bottom-10 sm:bottom-12">
                <ChipIcon kind="download" /> Descargar todo
              </FloatingChip>
            </div>
          </div>
        </section>

        {/* Cómo funciona (índice) */}
        <section id="como-funciona" className="relative scroll-mt-24 overflow-hidden rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <SquiggleLine className="absolute -right-24 -bottom-24 w-[420px] text-dash-bg" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">Cómo funciona.</h2>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
                <span className="rounded-full bg-dash-yellow-soft px-3 py-1">Subir</span>
                <span className="rounded-full bg-dash-blue-soft px-3 py-1">Organizar</span>
                <span className="rounded-full bg-dash-bg px-3 py-1">Entregar</span>
              </div>
              <p className="mt-5 max-w-sm text-neutral-600">De la sesión al portal de tu cliente en cuatro pasos, desde el computador o el teléfono.</p>
            </div>
            <ol className="divide-y divide-black/10 border-y border-black/10">
              {STEPS.map((step, i) => (
                <li key={step.title} className="grid gap-1 py-5 sm:grid-cols-[2.5rem_1fr_1.2fr] sm:items-center sm:gap-4">
                  <span className="text-sm font-semibold text-neutral-400">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex items-center gap-2 text-lg font-medium">
                    {step.title}
                    <ArrowUpRightIcon className="h-4 w-4 text-neutral-400" />
                  </span>
                  <span className="text-sm text-neutral-500">{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Plantillas (tarjetas con flecha en el recorte) */}
        <section id="plantillas" className="relative scroll-mt-24 rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <Accent className="top-6 left-6 bg-dash-blue" />
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl tracking-[-0.03em] sm:text-5xl">Dos plantillas, un solo lugar</h2>
            <p className="mt-3 text-neutral-500">Elige cómo verá tu cliente cada entrega. Puedes cambiarla cuando quieras.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {TEMPLATES.map(({ color, Icon, title, text }) => (
              <div key={title} className={`relative min-h-[260px] rounded-[30px] p-6 pb-20 ${color}`}>
                <Icon className="h-7 w-7" />
                <h3 className="mt-8 text-2xl leading-tight tracking-tight">{title}</h3>
                <p className="mt-2 text-sm opacity-75">{text}</p>
                <span className="absolute -right-2.5 -bottom-2.5 flex h-[84px] w-[84px] items-center justify-center rounded-full bg-white" aria-hidden>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-neutral-950 bg-white text-neutral-950">
                    <ArrowUpRightIcon className="h-6 w-6" />
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Beneficios para el cliente */}
        <section className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="relative flex min-h-[340px] flex-col justify-between overflow-hidden rounded-[36px] bg-neutral-950 p-7 text-white sm:p-10">
            <SquiggleLine className="absolute -right-28 -bottom-24 w-[520px] text-white/[0.07]" />
            <Accent className="top-6 right-6 bg-dash-yellow" />
            <div className="relative">
              <h2 className="text-5xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">
                Descargas
                <br />
                sin fricción
              </h2>
              <p className="mt-4 max-w-sm text-white/70">Lo que tu cliente necesita para publicar, a un toque desde su teléfono o computador.</p>
            </div>
            <Link href="/signup" className="relative mt-8 inline-flex w-fit items-center gap-3 rounded-full bg-white py-2 pr-2 pl-5 text-sm font-semibold text-neutral-950">
              Empezar gratis
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950 text-white">
                <ArrowRightIcon className="h-4 w-4" />
              </span>
            </Link>
          </div>
          <div className="grid gap-4">
            {[
              { tone: "bg-dash-yellow text-neutral-950", Icon: DownloadIcon, big: "1 clic", small: "Descarga todo el proyecto en un ZIP" },
              { tone: "bg-dash-blue text-white", Icon: PhoneIcon, big: "En Fotos", small: "En iPhone, se guarda directo en su galería" },
              { tone: "bg-white text-neutral-950", Icon: TypeIcon, big: "Copy listo", small: "El texto de cada publicación, a un toque de copiar" },
            ].map(({ tone, Icon, big, small }) => (
              <div key={big} className={`relative flex items-center gap-5 rounded-[28px] p-6 ${tone}`}>
                <Icon className="h-10 w-10 shrink-0 opacity-90" />
                <div>
                  <p className="text-3xl tracking-tight">{big}</p>
                  <p className="text-sm opacity-75">{small}</p>
                </div>
                <ArrowUpRightIcon className="absolute top-5 right-5 h-6 w-6 opacity-80" />
              </div>
            ))}
          </div>
        </section>

        {/* Funciones */}
        <section className="rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          {[
            { label: "Para ti", sub: "Organiza y entrega", items: FOR_YOU, pill: "bg-dash-yellow-soft" },
            { label: "Para tu cliente", sub: "Ve, descarga y publica", items: FOR_CLIENT, pill: "bg-dash-blue-soft" },
          ].map((row, r) => (
            <div key={row.label} className={`grid gap-5 lg:grid-cols-[220px_1fr] lg:items-center ${r > 0 ? "mt-10 lg:mt-6" : ""}`}>
              <div>
                <h2 className="text-3xl leading-tight tracking-tight sm:text-4xl">{row.label}</h2>
                <span className={`mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase ${row.pill}`}>{row.sub}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {row.items.map(({ Icon, text, tone }) => (
                  <div key={text} className={`flex aspect-square flex-col justify-between rounded-[24px] p-4 sm:p-5 ${TILE_TONE[tone]}`}>
                    <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
                    <p className="text-sm leading-snug font-medium sm:text-[15px]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Para quién */}
        <section className="relative rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <Accent className="bottom-6 left-6 bg-dash-yellow" />
          <div className="grid gap-8 lg:grid-cols-[1fr_2.2fr] lg:items-center">
            <div>
              <Logo markClassName="h-9 w-9 bg-dash-bg" />
              <h2 className="mt-8 text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">Hecho para como trabajas</h2>
              <p className="mt-4 text-neutral-500">Una sola herramienta, sea una sesión al mes o el contenido de diez marcas.</p>
            </div>
            <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
              {AUDIENCES.map((a) => (
                <div key={a.title} className="relative flex aspect-[3/4.4] w-[70vw] max-w-[280px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[26px] p-5 text-white sm:w-auto sm:max-w-none">
                  <Shot n={a.shot} className="absolute inset-0" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="relative">
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase backdrop-blur">{a.tag}</span>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight">{a.title}</h3>
                    <p className="mt-1 text-sm text-white/80">{a.text}</p>
                    <Link href="/signup" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white py-1.5 pr-1.5 pl-4 text-xs font-semibold tracking-[0.1em] text-neutral-950 uppercase">
                      Probar
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-950">
                        <ArrowRightIcon className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Precios */}
        <section id="precios" className="scroll-mt-24 rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="dash-title">
              Planes<sup>({PLAN_IDS.length})</sup>
            </h2>
            <p className="max-w-sm text-neutral-500">
              Todos incluyen {TRIAL_DAYS} días de prueba, las dos plantillas, enlace para compartir y descargas ilimitadas.
            </p>
          </div>
          <div className="mt-10 grid gap-x-5 gap-y-8 md:grid-cols-3">
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              const folder = PLAN_FOLDER[id];
              return (
                <Folder
                  key={id}
                  color={folder.color}
                  tab={<span className="rounded-full bg-white px-3 py-1 text-xs font-medium">{folder.tab}</span>}
                >
                  <div className="flex h-full flex-col px-6 pt-3 pb-6">
                    <p className="text-lg font-semibold">{plan.name}</p>
                    <p className="mt-2 text-5xl tracking-[-0.04em]">
                      {formatPrice(plan)}
                      <span className="text-base tracking-normal text-black/55"> /mes</span>
                    </p>
                    <div className="folder-dots mt-5" />
                    <ul className="mt-5 space-y-2.5 text-sm">
                      {[...plan.highlights, `${TRIAL_DAYS} días de prueba`].map((h) => (
                        <li key={h} className="flex items-start gap-2.5">
                          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white">
                            <CheckIcon className="h-3 w-3" />
                          </span>
                          {h}
                        </li>
                      ))}
                    </ul>
                    <Link href="/signup" className="btn-primary mt-8 py-3">
                      Empezar prueba gratis
                    </Link>
                  </div>
                </Folder>
              );
            })}
          </div>
        </section>

        {/* Preguntas frecuentes (cuadrícula numerada) */}
        <section id="preguntas" className="relative scroll-mt-24 overflow-hidden rounded-[36px] bg-white pt-10 sm:pt-14">
          <Accent className="top-6 right-6 bg-dash-blue" />
          <SquiggleLine className="absolute -right-32 bottom-[-120px] w-[520px] text-dash-bg" />
          <div className="relative px-5 text-center sm:px-10">
            <h2 className="text-4xl tracking-[-0.03em] sm:text-5xl">Preguntas frecuentes</h2>
            <p className="mt-3 text-neutral-500">Lo que más nos preguntan antes de empezar.</p>
          </div>
          <dl className="relative mt-10 grid gap-px border-t border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="bg-white px-5 py-7 sm:px-8">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    ["bg-dash-yellow", "bg-dash-blue text-white", "bg-neutral-950 text-white"][i % 3]
                  }`}
                >
                  {i + 1}
                </span>
                <dt className="mt-4 text-lg leading-snug font-medium">{f.q}</dt>
                <dd className="mt-2 text-sm text-neutral-500">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Llamado final */}
        <section className="relative overflow-hidden rounded-[36px] bg-neutral-950 px-6 py-14 text-center text-white sm:py-20">
          <SquiggleLine className="absolute -top-16 -left-24 w-[560px] text-white/[0.06]" />
          <Accent className="right-6 bottom-6 bg-dash-yellow" />
          <h2 className="relative mx-auto max-w-2xl text-5xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">Tu próxima entrega, en una carpeta.</h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/65">
            Crea tu cuenta y prueba {APP_NAME} gratis durante {TRIAL_DAYS} días con todas las funciones.
          </p>
          <Link href="/signup" className="btn-brand relative mt-8 py-3.5 text-base">
            Crear mi cuenta <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 pb-10 text-sm text-neutral-500 sm:flex-row">
        <Logo />
        <div className="flex gap-5">
          <Link href="/login" className="hover:text-neutral-950">
            Entrar
          </Link>
          <Link href="/signup" className="hover:text-neutral-950">
            Crear cuenta
          </Link>
        </div>
        <p>© {new Date().getFullYear()} {APP_NAME}</p>
      </footer>
    </div>
  );
}
