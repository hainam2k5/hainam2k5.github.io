import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Uses the service_role key → must run server-side on the Node.js runtime.
export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Automatic SIS/LMS integration (Tích hợp SIS/LMS tự động).
//
// A small institution usually can't call a real SIS/LMS API directly, so the
// common, robust pattern is a scheduled EXPORT: the LMS publishes a sheet of
// engagement metrics (attendance %, activity score) keyed by student code, and
// the risk system pulls it on a schedule / on demand and updates each profile.
//
// This route implements that pull. It accepts either:
//   { url: "https://.../pub?output=csv" }   → fetched & parsed server-side, OR
//   { rows: [{ student_code, attendance_rate?, lms_activity_score? }] }
// Fetching server-side also sidesteps browser CORS on the source sheet.
//
// Security:
// - service_role NEVER reaches the browser; only this server route holds it.
// - Caller must present a valid Supabase JWT of an advisor/manager.
// - An advisor may only sync THEIR OWN advisees (advisor_id scoping is enforced
//   here explicitly because service_role bypasses RLS). A manager syncs all.
// -----------------------------------------------------------------------------

type Row = { student_code: string; attendance_rate?: number; lms_activity_score?: number };

function clampPct(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (isNaN(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

// Minimal CSV parser (handles quoted fields and commas inside quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

function rowsFromCsv(text: string): Row[] {
  const grid = parseCsv(text);
  if (!grid.length) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const idxCode = header.findIndex((h) => ["student_code", "mssv", "code", "ma_sv", "masv"].includes(h));
  const idxAtt = header.findIndex((h) => ["attendance_rate", "attendance", "diem_danh", "chuyen_can"].includes(h));
  const idxLms = header.findIndex((h) => ["lms_activity_score", "lms", "activity", "hoat_dong_lms"].includes(h));
  if (idxCode < 0) return [];
  const out: Row[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const code = String(cells[idxCode] || "").trim();
    if (!code) continue;
    out.push({
      student_code: code,
      attendance_rate: idxAtt >= 0 ? clampPct(cells[idxAtt]) : undefined,
      lms_activity_score: idxLms >= 0 ? clampPct(cells[idxLms]) : undefined,
    });
  }
  return out;
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  // --- verify the caller is an advisor/manager (via their Supabase JWT) --------
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await sb.auth.getUser(token);
  const uid = userData?.user?.id;
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: caller } = await sb.from("profiles").select("id, role").eq("user_id", uid).maybeSingle();
  if (!caller || (caller.role !== "advisor" && caller.role !== "manager")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // --- collect rows: from a source URL (server-side fetch) or an inline array --
  let rows: Row[] = [];
  const sourceUrl = String(body?.url || "").trim();
  if (sourceUrl) {
    if (!/^https:\/\//i.test(sourceUrl)) {
      return NextResponse.json({ ok: false, error: "url must be https" }, { status: 400 });
    }
    try {
      const resp = await fetch(sourceUrl, { redirect: "follow" });
      if (!resp.ok) return NextResponse.json({ ok: false, error: `fetch failed (${resp.status})` }, { status: 400 });
      const text = await resp.text();
      rows = rowsFromCsv(text);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "fetch error: " + (e?.message || "unknown") }, { status: 400 });
    }
  } else if (typeof body?.csv === "string" && body.csv.trim()) {
    rows = rowsFromCsv(body.csv);
  } else if (Array.isArray(body?.rows)) {
    rows = body.rows
      .map((r: any) => ({
        student_code: String(r.student_code || r.mssv || r.code || "").trim(),
        attendance_rate: clampPct(r.attendance_rate ?? r.attendance),
        lms_activity_score: clampPct(r.lms_activity_score ?? r.lms),
      }))
      .filter((r: Row) => r.student_code);
  }

  if (!rows.length) return NextResponse.json({ ok: false, error: "no usable rows" }, { status: 400 });

  // --- apply updates with service_role (advisor scoping enforced here) ---------
  if (!serviceKey) return NextResponse.json({ ok: false, error: "admin_not_configured" }, { status: 501 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let updated = 0;
  let skipped = 0;
  const errors: { student_code: string; error: string }[] = [];
  for (const r of rows) {
    const patch: Record<string, number> = {};
    if (r.attendance_rate !== undefined) patch.attendance_rate = r.attendance_rate;
    if (r.lms_activity_score !== undefined) patch.lms_activity_score = r.lms_activity_score;
    if (!Object.keys(patch).length) { skipped++; continue; }

    let q = admin.from("profiles").update(patch).eq("student_code", r.student_code).eq("role", "student");
    if (caller.role === "advisor") q = q.eq("advisor_id", caller.id); // advisor: own advisees only
    const { data, error } = await q.select("id");
    if (error) { errors.push({ student_code: r.student_code, error: error.message }); continue; }
    if (!data || !data.length) { skipped++; continue; } // not found / not owned by this advisor
    updated += data.length;
  }

  return NextResponse.json({ ok: true, received: rows.length, updated, skipped, errors });
}
