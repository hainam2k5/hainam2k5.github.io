import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Sends a grade-update email via Resend. Server-side only: RESEND_API_KEY never
// reaches the browser. Caller must present a valid advisor/manager access token.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const resendKey = process.env.RESEND_API_KEY;

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
  const { data: profile } = await sb.from("profiles").select("role").eq("user_id", uid).maybeSingle();
  if (!profile || (profile.role !== "advisor" && profile.role !== "manager")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // --- graceful no-ops (app must still work without email configured) ----------
  if (!resendKey) return NextResponse.json({ ok: true, skipped: "no RESEND_API_KEY" });
  if (!body?.to) return NextResponse.json({ ok: true, skipped: "no recipient" });

  const lang = body.lang === "en" ? "en" : "vi";
  const f = (v: any) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const L =
    lang === "en"
      ? { subject: `Grade updated — ${f(body.courseName)}`, greeting: `Hello ${f(body.studentName)},`, line: `Your advisor updated the grade for <b>${f(body.courseName)}</b>.`, reg: "Regular", mid: "Midterm", fin: "Final", total: "Total", grade: "Grade", foot: "Academic Risk Alert System" }
      : { subject: `Cập nhật điểm — ${f(body.courseName)}`, greeting: `Chào ${f(body.studentName)},`, line: `Cố vấn đã cập nhật điểm môn <b>${f(body.courseName)}</b>.`, reg: "Thường xuyên", mid: "Giữa kỳ", fin: "Cuối kỳ", total: "Tổng", grade: "Điểm chữ", foot: "Hệ thống Cảnh báo Rủi ro Học tập" };

  const row = (k: string, v: string, bold?: boolean) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e4e8f0">${bold ? "<b>" + k + "</b>" : k}</td><td style="padding:6px 10px;border:1px solid #e4e8f0">${bold ? "<b>" + v + "</b>" : v}</td></tr>`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#121a2b">
      <h2 style="color:#1b4fc4;margin:0 0 10px">${L.subject}</h2>
      <p style="margin:0 0 6px">${L.greeting}</p>
      <p style="margin:0 0 12px">${L.line}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${row(L.reg, f(body.r))}${row(L.mid, f(body.m))}${row(L.fin, f(body.f))}${row(L.total, f(body.total), true)}${row(L.grade, f(body.letter))}
      </table>
      <p style="color:#5c6678;font-size:12px;margin-top:16px">${L.foot}</p>
    </div>`;

  const from = process.env.NOTIFY_FROM || "Academic Risk Alert <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [body.to], subject: L.subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ ok: false, error: data }, { status: 502 });
  return NextResponse.json({ ok: true, id: (data as any)?.id });
}
