import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// nodemailer needs the Node.js runtime (net/tls), not the Edge runtime.
export const runtime = "nodejs";

// Sends a grade-update email via a Gmail account (SMTP). Server-side only:
// GMAIL_USER / GMAIL_APP_PASSWORD never reach the browser.
//
// Why Gmail SMTP: it needs no verified domain (unlike Resend), delivers well,
// and ~500 emails/day is plenty for this system. Create an App Password on a
// Google account with 2-Step Verification enabled and set:
//   GMAIL_USER=vnuis.risk.alert@gmail.com
//   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx     (16-char app password, no spaces)
//   NOTIFY_FROM_NAME=Hệ thống Cảnh báo Rủi ro Học tập — VNU-IS   (optional)
//
// Security model:
// - Caller must present a valid Supabase JWT of an advisor/manager (403 otherwise).
// - The client sends a studentId, NOT an email address. The recipient's email is
//   looked up server-side through a client scoped to the CALLER's token, so RLS
//   decides which students this advisor may reach. The endpoint cannot be used
//   as an open mail relay to arbitrary addresses.
// - All interpolated strings are HTML-escaped before being embedded in the mail.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

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
  const { data: caller } = await sb.from("profiles").select("role").eq("user_id", uid).maybeSingle();
  if (!caller || !["advisor", "manager", "teacher"].includes(caller.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // --- graceful no-ops (app must still work without email configured) ----------
  if (!gmailUser || !gmailPass) return NextResponse.json({ ok: true, skipped: "no GMAIL_USER/GMAIL_APP_PASSWORD" });
  if (!body?.studentId) return NextResponse.json({ ok: true, skipped: "no student" });

  // Recipient resolved server-side, through the caller's own RLS view.
  const { data: student } = await sb
    .from("profiles")
    .select("email, full_name")
    .eq("id", String(body.studentId))
    .eq("role", "student")
    .maybeSingle();
  if (!student || !student.email) return NextResponse.json({ ok: true, skipped: "no email" });

  const esc = (v: unknown) =>
    String(v === null || v === undefined || v === "" ? "—" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const lang = body.lang === "en" ? "en" : "vi";
  const course = esc(body.courseName);
  const L =
    lang === "en"
      ? { subject: `Grade updated — ${course}`, greeting: `Hello ${esc(student.full_name)},`, line: `The grade for <b>${course}</b> has been updated.`, reg: "Regular", mid: "Midterm", fin: "Final", total: "Total", grade: "Grade", foot: "Academic Risk Alert System" }
      : { subject: `Cập nhật điểm — ${course}`, greeting: `Chào ${esc(student.full_name)},`, line: `Điểm môn <b>${course}</b> vừa được cập nhật.`, reg: "Thường xuyên", mid: "Giữa kỳ", fin: "Cuối kỳ", total: "Tổng", grade: "Điểm chữ", foot: "Hệ thống Cảnh báo Rủi ro Học tập" };

  const row = (k: string, v: string, bold?: boolean) =>
    `<tr><td style="padding:6px 10px;border:1px solid #e4e8f0">${bold ? "<b>" + k + "</b>" : k}</td><td style="padding:6px 10px;border:1px solid #e4e8f0">${bold ? "<b>" + v + "</b>" : v}</td></tr>`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#121a2b">
      <h2 style="color:#1b4fc4;margin:0 0 10px">${L.subject}</h2>
      <p style="margin:0 0 6px">${L.greeting}</p>
      <p style="margin:0 0 12px">${L.line}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${row(L.reg, esc(body.r))}${row(L.mid, esc(body.m))}${row(L.fin, esc(body.f))}${row(L.total, esc(body.total), true)}${row(L.grade, esc(body.letter))}
      </table>
      <p style="color:#5c6678;font-size:12px;margin-top:16px">${L.foot}</p>
    </div>`;

  // Gmail requires the From address to be the authenticated account; only the
  // display name is customisable.
  const fromName = process.env.NOTIFY_FROM_NAME || "Academic Risk Alert";
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });
  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${gmailUser}>`,
      to: student.email,
      subject: L.subject,
      html,
    });
    return NextResponse.json({ ok: true, id: info.messageId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
