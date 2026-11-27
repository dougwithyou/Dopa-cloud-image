import type { Metadata } from "next";
import Link from "next/link";
import { calculateItems } from "@/lib/labs/whcc";
import { retailPriceCents } from "@/lib/print-pricing";
import { getStoreAccess, loadStoreProducts } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddDesignToCart, KeepEditingButton } from "./add-design";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.store.designMeta, robots: { index: false, follow: false } };
}

/**
 * Regreso desde el editor de WHCC. Se acepta una sola vez por enlace (token) y
 * se comprueba con WHCC que el diseño esté terminado antes de llevarlo al carrito.
 */
export default async function EditorReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ item?: string; t?: string }>;
}) {
  const { projectId } = await params;
  const { item, t } = await searchParams;
  const access = await getStoreAccess(projectId);
  const s = (await getI18n()).t.store;
  const admin = createAdminClient();
  const row =
    access && item
      ? (
          await admin
            .from("print_editor_items")
            .select("*")
            .eq("configured_product_id", item)
            .eq("project_id", projectId)
            .maybeSingle()
        ).data
      : null;

  // Token válido (o ya aceptado antes y terminado, por si recarga la página).
  const accepted = row && ((t && row.return_token === t) || (row.finished && !row.return_token));
  if (!access || !row || !accepted) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">{s.linkInvalid}</h1>
        <p className="mt-2 text-sm text-neutral-500">{s.linkInvalidText}</p>
      </Shell>
    );
  }

  const [calc, products] = await Promise.all([
    calculateItems([{ configuredProductId: row.configured_product_id }]).catch(() => null),
    loadStoreProducts(admin, access.creator),
  ]);
  const product = products.find((p) => p.id === row.product_id);
  const result = calc?.items[0];

  if (!product || !result) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">{s.checkFailed}</h1>
        <p className="mt-2 text-sm text-neutral-500">{s.checkFailedText}</p>
        <KeepEditingButton projectId={projectId} editorItemId={row.id} label={s.backToEditor} />
      </Shell>
    );
  }

  if (!result.isValidForOrder) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">{s.notFinished}</h1>
        <ul className="mt-3 space-y-1 text-sm text-neutral-600">
          {(result.problems.length > 0 ? result.problems : [s.notFinishedDefault]).map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
        <KeepEditingButton projectId={projectId} editorItemId={row.id} label={s.keepDesigning} />
        <Link href={access.galleryHref} className="mt-3 block text-sm text-neutral-500 underline">
          {s.backToGalleryPlain}
        </Link>
      </Shell>
    );
  }

  await admin
    .from("print_editor_items")
    .update({ finished: true, return_token: null, preview_url: result.previewUrl })
    .eq("id", row.id);

  return (
    <Shell>
      <AddDesignToCart
        projectId={projectId}
        cartHref={`/tienda/${projectId}`}
        line={{
          productId: product.id,
          editorItemId: row.id,
          quantity: product.kind === "card" ? Math.max(product.minQuantity, result.quantity) : 1,
          previewUrl: result.previewUrl,
          unitPriceCents: retailPriceCents(result.unitPriceCents || product.costCents, product.markupPercent),
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 text-center text-neutral-900">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
