import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { APP_NAME, portalGracePeriodDays } from "@/lib/env";
import { dashFont } from "@/lib/fonts";
import { PLANS, PLAN_IDS, TRIAL_DAYS, formatPrice, type PlanId } from "@/lib/plans";
import { Folder, type FolderColor } from "@/components/dashboard/folder";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { ChipIcon, FloatingChip, PhoneMock, Shot, SquiggleLine } from "@/components/landing/visuals";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BagIcon,
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
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: { absolute: `${APP_NAME} · ${t.landing.title}` } };
}

const NAV = [
  { href: "#como-funciona", key: "how" },
  { href: "#plantillas", key: "templates" },
  { href: "#impresiones", key: "prints" },
  { href: "#precios", key: "pricing" },
  { href: "#preguntas", key: "faq" },
] as const;

const TEMPLATES = [
  { color: "bg-dash-yellow text-neutral-950", Icon: ImageIcon },
  { color: "bg-dash-blue text-white", Icon: GridIcon },
  { color: "bg-neutral-950 text-white", Icon: LinkIcon },
];

const FOR_YOU = [
  { Icon: LayersIcon, tone: "yellow" },
  { Icon: MoveIcon, tone: "dark" },
  { Icon: PaletteIcon, tone: "outline" },
  { Icon: MailIcon, tone: "blue" },
] as const;

const FOR_CLIENT = [
  { Icon: LockIcon, tone: "blue" },
  { Icon: LayersIcon, tone: "outline" },
  { Icon: PhoneIcon, tone: "dark" },
  { Icon: DownloadIcon, tone: "yellow" },
] as const;

const TILE_TONE = {
  yellow: "bg-dash-yellow text-neutral-950",
  blue: "bg-dash-blue text-white",
  dark: "bg-neutral-950 text-white",
  outline: "bg-white text-neutral-950 ring-1 ring-black/10",
} as const;

const AUDIENCE_SHOTS = [0, 1, 3];

const PLAN_COLOR: Record<PlanId, FolderColor> = { entry: "gray", medium: "yellow", high: "blue" };

/** Ilustración de cada producto de la tienda: impresiones, canvas, photobook y tarjeta. */
function PrintVisual({ kind }: { kind: number }) {
  if (kind === 0) {
    return (
      <div className="relative mx-auto h-28 w-full max-w-[170px] sm:h-32" aria-hidden>
        <span className="absolute top-3 left-2 w-[55%] -rotate-6 bg-white p-1.5 pb-4 shadow-md">
          <Shot n={2} className="aspect-[4/5]" />
        </span>
        <span className="absolute top-0 right-2 w-[55%] rotate-[5deg] bg-white p-1.5 pb-4 shadow-lg">
          <Shot n={0} className="aspect-[4/5]" />
        </span>
      </div>
    );
  }
  if (kind === 1) {
    return (
      <div className="flex h-28 items-center justify-center sm:h-32" aria-hidden>
        <span className="block w-[72%] max-w-[150px] shadow-[6px_8px_0_rgb(0_0_0/0.18)]">
          <Shot n={3} className="aspect-[5/4] border-[5px] border-black/10" />
        </span>
      </div>
    );
  }
  if (kind === 2) {
    return (
      <div className="flex h-28 items-center justify-center sm:h-32" aria-hidden>
        <span className="flex w-[86%] max-w-[180px] -rotate-3 gap-px rounded-md bg-white p-1.5 shadow-lg">
          <Shot n={1} className="aspect-square flex-1 rounded-l-sm" />
          <span className="flex flex-1 flex-col gap-1 p-1">
            <Shot n={4} className="aspect-[4/3] w-full rounded-sm" />
            <span className="h-1 w-3/4 rounded-full bg-neutral-200" />
            <span className="h-1 w-1/2 rounded-full bg-neutral-200" />
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="relative flex h-28 items-center justify-center sm:h-32" aria-hidden>
      <span className="absolute h-[70%] w-[46%] max-w-[96px] translate-x-4 rotate-6 rounded-sm bg-white/70 shadow" />
      <span className="relative flex w-[46%] max-w-[96px] -rotate-3 flex-col gap-1 rounded-sm bg-white p-1.5 shadow-lg">
        <Shot n={5} className="aspect-[4/5] w-full" />
        <span className="mx-auto h-1 w-2/3 rounded-full bg-neutral-300" />
        <span className="mx-auto h-1 w-1/3 rounded-full bg-neutral-200" />
      </span>
    </div>
  );
}

/** Pequeño cuadrado de color en una esquina, como acento. */
function Accent({ className }: { className: string }) {
  return <span className={`absolute h-3.5 w-3.5 rounded-[4px] ${className}`} aria-hidden />;
}

export default async function Home() {
  const { supabase, user } = await getSession();
  if (user) redirect(await homePathFor(supabase, user));
  const graceDays = portalGracePeriodDays();
  const { t } = await getI18n();
  const L = t.landing;
  const faqs = L.faqs(TRIAL_DAYS, graceDays);

  return (
    <div className={`dash ${dashFont.variable} min-h-dvh overflow-x-clip`}>
      {/* Navegación */}
      <header className="sticky top-0 z-30 bg-dash-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <Link href="/" aria-label={APP_NAME}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 rounded-full bg-white p-1 md:flex" aria-label={L.navLabel}>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-4 py-1.5 text-sm text-neutral-600 transition hover:bg-dash-bg hover:text-neutral-950">
                {L.nav[n.key]}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="mr-1 hidden text-neutral-600 sm:block">
              <LanguageSwitch />
            </span>
            <Link href="/login" className="btn-ghost px-3 whitespace-nowrap sm:px-4">
              {L.signIn}
            </Link>
            <Link href="/signup" className="btn-primary px-4 whitespace-nowrap sm:px-5">
              {L.tryFree}
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
                <span className="rounded-full bg-dash-yellow px-3 py-1">{L.hero.tags[0]}</span>
                <span className="rounded-full bg-dash-blue px-3 py-1 text-white">{L.hero.tags[1]}</span>
                <span className="rounded-full bg-neutral-950 px-3 py-1 text-white">{L.hero.tags[2]}</span>
              </div>
              <h1 className="mt-6 text-[2.75rem] leading-[1] font-normal tracking-[-0.035em] sm:text-7xl">
                {L.hero.titleA}
                <span className="font-semibold">{L.hero.titleB}</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-neutral-600">
                {L.hero.lead}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn-primary py-3.5 text-base">
                  {L.hero.cta(TRIAL_DAYS)} <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <a href="#como-funciona" className="btn-secondary py-3.5 text-base">
                  {L.hero.how}
                </a>
              </div>
              <p className="mt-4 text-sm text-neutral-500">{L.hero.note}</p>
            </div>

            <div className="relative mx-auto h-[460px] w-full max-w-[420px] sm:h-[540px]">
              <Folder color="yellow" tab={<span className="rounded-full bg-white px-3 py-1 text-xs font-medium">{L.hero.published}</span>} className="absolute top-14 left-1 w-[58%] -rotate-6 sm:top-14 sm:w-[62%]">
                <div className="px-5 pt-2 pb-6">
                  <p className="text-lg leading-tight font-semibold">{L.hero.sampleTitle}</p>
                  <p className="text-xs text-black/60">{L.hero.sampleMeta}</p>
                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    {[0, 4, 2].map((n) => (
                      <Shot key={n} n={n} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                </div>
              </Folder>
              <PhoneMock caption={L.hero.phoneCaption} className="absolute top-0 right-0 w-[60%] min-w-[220px] rotate-3" />
              <FloatingChip className="absolute bottom-24 left-2 sm:bottom-28">
                <ChipIcon kind="check" /> {L.hero.savedToPhotos}
              </FloatingChip>
              <FloatingChip tone="dark" className="absolute right-4 bottom-10 sm:bottom-12">
                <ChipIcon kind="download" /> {L.hero.downloadAll}
              </FloatingChip>
            </div>
          </div>
        </section>

        {/* Cómo funciona (índice) */}
        <section id="como-funciona" className="relative scroll-mt-24 overflow-hidden rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <SquiggleLine className="absolute -right-24 -bottom-24 w-[420px] text-dash-bg" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">{L.how.title}</h2>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
                <span className="rounded-full bg-dash-yellow-soft px-3 py-1">{L.how.tags[0]}</span>
                <span className="rounded-full bg-dash-blue-soft px-3 py-1">{L.how.tags[1]}</span>
                <span className="rounded-full bg-dash-bg px-3 py-1">{L.how.tags[2]}</span>
              </div>
              <p className="mt-5 max-w-sm text-neutral-600">{L.how.lead}</p>
            </div>
            <ol className="divide-y divide-black/10 border-y border-black/10">
              {L.steps.map((step, i) => (
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
            <h2 className="text-4xl tracking-[-0.03em] sm:text-5xl">{L.templatesSection.title}</h2>
            <p className="mt-3 text-neutral-500">{L.templatesSection.lead}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {TEMPLATES.map(({ color, Icon }, i) => (
              <div key={i} className={`relative min-h-[260px] rounded-[30px] p-6 pb-20 ${color}`}>
                <Icon className="h-7 w-7" />
                <h3 className="mt-8 text-2xl leading-tight tracking-tight">{L.templates[i].title}</h3>
                <p className="mt-2 text-sm opacity-75">{L.templates[i].text}</p>
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
                {L.downloads.titleA}
                <br />
                {L.downloads.titleB}
              </h2>
              <p className="mt-4 max-w-sm text-white/70">{L.downloads.lead}</p>
            </div>
            <Link href="/signup" className="relative mt-8 inline-flex w-fit items-center gap-3 rounded-full bg-white py-2 pr-2 pl-5 text-sm font-semibold text-neutral-950">
              {L.downloads.cta}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950 text-white">
                <ArrowRightIcon className="h-4 w-4" />
              </span>
            </Link>
          </div>
          <div className="grid gap-4">
            {[
              { tone: "bg-dash-yellow text-neutral-950", Icon: DownloadIcon, ...L.downloads.tiles[0] },
              { tone: "bg-dash-blue text-white", Icon: PhoneIcon, ...L.downloads.tiles[1] },
              { tone: "bg-white text-neutral-950", Icon: TypeIcon, ...L.downloads.tiles[2] },
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

        {/* Tienda de impresiones (galerías de fotos) */}
        <section id="impresiones" className="relative scroll-mt-24 overflow-hidden rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <SquiggleLine className="absolute -bottom-28 -left-32 w-[520px] text-dash-bg" />
          <Accent className="top-6 right-6 bg-dash-blue" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-dash-yellow px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
                <BagIcon className="h-3.5 w-3.5" /> {L.prints.tag}
              </span>
              <h2 className="mt-5 text-5xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">
                {L.prints.titleA}
                <br />
                <span className="font-semibold">{L.prints.titleB}</span>
              </h2>
              <p className="mt-5 max-w-md text-neutral-600">{L.prints.lead}</p>
              <ol className="mt-6 space-y-3">
                {L.prints.points.map((point, i) => (
                  <li key={point} className="flex items-start gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        ["bg-dash-yellow", "bg-dash-blue text-white", "bg-neutral-950 text-white"][i % 3]
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-neutral-700">{point}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/signup" className="btn-primary py-3">
                  {L.prints.cta} <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <span className="text-xs text-neutral-500">{L.prints.note}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {L.prints.products.map((product, i) => (
                <div
                  key={product.name}
                  className={`flex flex-col overflow-hidden rounded-[26px] p-4 sm:p-5 ${
                    ["bg-dash-yellow-soft", "bg-dash-blue-soft", "bg-neutral-950 text-white", "bg-dash-bg"][i]
                  }`}
                >
                  <PrintVisual kind={i} />
                  <p className="mt-4 text-lg leading-tight font-semibold tracking-tight">{product.name}</p>
                  <p className={`mt-0.5 text-xs ${i === 2 ? "text-white/65" : "text-neutral-600"}`}>{product.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Funciones */}
        <section className="rounded-[36px] bg-white px-5 py-10 sm:px-10 sm:py-14">
          {[
            { label: L.features.forYou, sub: L.features.forYouSub, items: FOR_YOU, texts: L.forYou, pill: "bg-dash-yellow-soft" },
            { label: L.features.forClient, sub: L.features.forClientSub, items: FOR_CLIENT, texts: L.forClient, pill: "bg-dash-blue-soft" },
          ].map((row, r) => (
            <div key={row.label} className={`grid gap-5 lg:grid-cols-[220px_1fr] lg:items-center ${r > 0 ? "mt-10 lg:mt-6" : ""}`}>
              <div>
                <h2 className="text-3xl leading-tight tracking-tight sm:text-4xl">{row.label}</h2>
                <span className={`mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase ${row.pill}`}>{row.sub}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {row.items.map(({ Icon, tone }, i) => (
                  <div key={i} className={`flex aspect-square flex-col justify-between rounded-[24px] p-4 sm:p-5 ${TILE_TONE[tone]}`}>
                    <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
                    <p className="text-sm leading-snug font-medium sm:text-[15px]">{row.texts[i]}</p>
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
              <h2 className="mt-8 text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">{L.audience.title}</h2>
              <p className="mt-4 text-neutral-500">{L.audience.lead}</p>
            </div>
            <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
              {L.audiences.map((a, i) => (
                <div key={a.title} className="relative flex aspect-[3/4.4] w-[70vw] max-w-[280px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[26px] p-5 text-white sm:w-auto sm:max-w-none">
                  <Shot n={AUDIENCE_SHOTS[i]} className="absolute inset-0" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="relative">
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase backdrop-blur">{a.tag}</span>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight">{a.title}</h3>
                    <p className="mt-1 text-sm text-white/80">{a.text}</p>
                    <Link href="/signup" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white py-1.5 pr-1.5 pl-4 text-xs font-semibold tracking-[0.1em] text-neutral-950 uppercase">
                      {L.audience.cta}
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
              {L.pricing.title}<sup>({PLAN_IDS.length})</sup>
            </h2>
            <p className="max-w-sm text-neutral-500">
              {L.pricing.lead(TRIAL_DAYS)}
            </p>
          </div>
          <div className="mt-10 grid gap-x-5 gap-y-8 md:grid-cols-3">
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              return (
                <Folder
                  key={id}
                  color={PLAN_COLOR[id]}
                  tab={<span className="rounded-full bg-white px-3 py-1 text-xs font-medium">{L.planTab[id]}</span>}
                >
                  <div className="flex h-full flex-col px-6 pt-3 pb-6">
                    <p className="text-lg font-semibold">{plan.name}</p>
                    <p className="mt-2 text-5xl tracking-[-0.04em]">
                      {formatPrice(plan)}
                      <span className="text-base tracking-normal text-black/55">{L.pricing.perMonth}</span>
                    </p>
                    <div className="folder-dots mt-5" />
                    <ul className="mt-5 space-y-2.5 text-sm">
                      {[...t.labels.planHighlights[id], L.pricing.trial(TRIAL_DAYS)].map((h) => (
                        <li key={h} className="flex items-start gap-2.5">
                          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white">
                            <CheckIcon className="h-3 w-3" />
                          </span>
                          {h}
                        </li>
                      ))}
                    </ul>
                    <Link href="/signup" className="btn-primary mt-8 py-3">
                      {L.pricing.cta}
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
            <h2 className="text-4xl tracking-[-0.03em] sm:text-5xl">{L.faq.title}</h2>
            <p className="mt-3 text-neutral-500">{L.faq.lead}</p>
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
          <h2 className="relative mx-auto max-w-2xl text-5xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">{L.final.title}</h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/65">
            {L.final.lead(APP_NAME, TRIAL_DAYS)}
          </p>
          <Link href="/signup" className="btn-brand relative mt-8 py-3.5 text-base">
            {L.final.cta} <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 pb-10 text-sm text-neutral-500 sm:flex-row">
        <Logo />
        <div className="flex gap-5">
          <Link href="/login" className="hover:text-neutral-950">
            {L.footer.signIn}
          </Link>
          <Link href="/signup" className="hover:text-neutral-950">
            {L.footer.signUp}
          </Link>
          <LanguageSwitch />
        </div>
        <p>© {new Date().getFullYear()} {APP_NAME}</p>
      </footer>
    </div>
  );
}
