import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadPendingAsset } from "@/lib/upload-session";
import { signUploadParts } from "@/lib/r2";
import { partPlan } from "@/lib/upload-rules";

export const dynamic = "force-dynamic";

const Body = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100),
});

/** Firma URLs PUT para un lote de partes. Next.js nunca recibe los bytes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const loaded = await loadPendingAsset(assetId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { asset } = loaded;

  // Solo se firman las partes que corresponden al tamaño declarado.
  const { partCount } = partPlan(asset.size_bytes);
  const partNumbers = [...new Set(parsed.data.partNumbers)];
  if (partNumbers.some((n) => n > partCount)) {
    return NextResponse.json({ error: "Número de parte fuera de rango" }, { status: 400 });
  }

  const urls = await signUploadParts(asset.r2_key, asset.r2_upload_id, partNumbers);
  return NextResponse.json({ urls });
}
