import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { signDownloadUrl } from "@/lib/r2";
import { getStoreAccess, loadStoreProducts, publicProducts } from "@/lib/store";
import { shippingCentsFor } from "@/lib/print-pricing";
import { isPrintable } from "@/lib/store-types";
import { CartView } from "./cart-view";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.store.cartMeta, robots: { index: false, follow: false } };
}

/** Carrito y datos de envío de la tienda de una galería. */
export default async function CartPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await getStoreAccess(projectId);
  const s = (await getI18n()).t.store;
  if (!access) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-4 text-center">
        <h1 className="text-2xl font-semibold">{s.unavailableTitle}</h1>
        <p className="mt-2 max-w-sm text-sm text-neutral-500">{s.unavailableText}</p>
      </main>
    );
  }

  const admin = createAdminClient();
  const [products, { data: assets }] = await Promise.all([
    loadStoreProducts(admin, access.creator),
    admin
      .from("assets")
      .select("id, kind, file_name, size_bytes, r2_key")
      .eq("project_id", projectId)
      .eq("kind", "photo")
      .eq("upload_status", "complete"),
  ]);
  const printable = (assets ?? []).filter((a) => isPrintable({ ...a, size_bytes: Number(a.size_bytes) }));
  const photos = await Promise.all(
    printable.map(async (a) => ({
      id: a.id,
      fileName: a.file_name,
      url: await signDownloadUrl(a.r2_key, { disposition: "inline", stableForDay: true }),
    })),
  );

  return (
    <main className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link href={access.galleryHref} className="text-sm text-neutral-500 hover:text-neutral-900">
            {s.backToGallery}
          </Link>
          <p className="truncate text-sm font-semibold">{access.creator.business_name}</p>
        </div>
      </header>
      <CartView
        projectId={projectId}
        galleryTitle={access.project.title}
        galleryHref={access.galleryHref}
        products={publicProducts(products)}
        photos={photos}
        shippingPerGroupCents={shippingCentsFor(1)}
        taxAtCheckout={process.env.STRIPE_TAX_ENABLED === "true"}
        buyer={access.buyer ? { name: access.buyer.name, email: access.buyer.email } : null}
      />
    </main>
  );
}
