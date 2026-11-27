import { getI18n } from "@/i18n/server";
import { NextResponse, type NextRequest } from "next/server";
import { getCreatorContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Exporta los contactos de las galerías compartidas en CSV (UTF-8 con BOM,
 * compatible con Excel, Google Sheets, Mailchimp, Brevo, Resend…).
 * ?consent=1 exporta solo quienes aceptaron recibir correos de marketing.
 */
export async function GET(req: NextRequest) {
  const a = (await getI18n()).t.api;
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.json({ error: a.notAuthenticated }, { status: 401 });

  let query = ctx.supabase
    .from("gallery_leads")
    .select("first_name, last_name, email, marketing_consent, consent_at, visits, created_at, last_visit_at, projects(title)")
    .order("created_at", { ascending: false })
    .limit(50_000);
  const onlyConsent = req.nextUrl.searchParams.get("consent") === "1";
  if (onlyConsent) query = query.eq("marketing_consent", true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: a.exportFailed }, { status: 500 });

  const header = a.csvHeader;
  const rows = (data ?? []).map((l) =>
    [
      l.first_name,
      l.last_name,
      l.email,
      l.marketing_consent ? a.yes : a.no,
      l.consent_at ?? "",
      l.projects?.title ?? "",
      l.visits,
      l.created_at,
      l.last_visit_at,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contactos${onlyConsent ? "-marketing" : ""}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
