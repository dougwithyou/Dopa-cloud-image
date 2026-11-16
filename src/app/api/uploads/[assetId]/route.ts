import { NextResponse } from "next/server";
import { loadPendingAsset } from "@/lib/upload-session";
import { abortMultipartUpload } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Aborta una subida en curso y libera el espacio reservado. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const loaded = await loadPendingAsset(assetId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  await abortMultipartUpload(loaded.asset.r2_key, loaded.asset.r2_upload_id);
  await createAdminClient().from("assets").delete().eq("id", assetId).eq("upload_status", "pending");
  return NextResponse.json({ aborted: true });
}
