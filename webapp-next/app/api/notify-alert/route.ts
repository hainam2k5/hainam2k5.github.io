import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

// Emails an at-risk student directly when their results enter the alarm zone.
// Research (OAAI, Course Signals) finds that simply making a student AWARE they
// are at risk is one of the strongest levers for behaviour change — this sends
// that awareness nudge to the student's own inbox, in addition to the in-app alert.
//
// Same security model as /api/notify-grade: caller must be an advisor/manager
// (JWT checked), the recipient email is resolved server-side via the caller's RLS
// scope (client only sends studentId), and all values are HTML-escaped. Uses the
// shared Gmail SMTP config (GMAIL_USER / GMAIL_APP_PASSWORD); graceful no-op when
// email is not configured.
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

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await sb.auth.getUser(token);
  const uid = userData?.user?.id;
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: caller } = await sb.from("profiles").select("role").eq("user_id", uid).maybeSingle();
  if (!caller || (caller.role !== "advisor" && caller.role !== "manager")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (!gmailUser || !gmailPass) return NextResponse.json({ ok: true, skipped: "no GMAIL_USER/GMAIL_APP_PASSWORD" });
  if (!body?.studentId) return NextResponse.json({ ok: true, skipped: "no student" });

  const { data: student } = await sb
    .from("profiles")
    .select("email, full_name")
    .eq("id", String(body.studentId))
    .eq("role", "student")
    .maybeSingle();
  if (!student || !student.email) return NextResponse.json({ ok: true, skipped: "no email" });

  const esc = (v: unknown) =>
    String(v === null || v === undefined || v === "" ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const lang = body.lang === "en" ? "en" : "vi";
  // Risk level label localised (Medium/High/Critical → Vietnamese).
  const levelKey = String(body.level || "");
  const levelVi: Record<string, string> = { Medium: "Trung bình", High: "Cao", Critical: "Nghiêm trọng" };
  const level = esc(lang === "en" ? levelKey : levelVi[levelKey] || levelKey);

  const L =
    lang === "en"
      ? {
          subject: "Academic performance alert",
          greeting: `Hello ${esc(student.full_name)},`,
          line1: `Your recent academic results are at the <b>${level}</b> risk level.`,
          line2: "Please contact your academic advisor soon for support — early action makes a real difference.",
          cta: "Sign in to view details",
          foot: "Academic Risk Alert System — VNU-IS",
        }
      : {
          subject: "Cảnh báo kết quả học tập",
          greeting: `Chào ${esc(student.full_name)},`,
          line1: `Kết quả học tập gần đây của bạn đang ở mức rủi ro <b>${level}</b>.`,
          line2: "Hãy liên hệ cố vấn học tập sớm để được hỗ trợ — hành động sớm tạo khác biệt thật sự.",
          cta: "Đăng nhập để xem chi tiết",
          foot: "Hệ thống Cảnh báo Rủi ro Học tập — VNU-IS",
        };

  const link = "https://hainam2k5-github-io.vercel.app";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#121a2b">
      <h2 style="color:#c02626;margin:0 0 10px">${L.subject}</h2>
      <p style="margin:0 0 6px">${L.greeting}</p>
      <p style="margin:0 0 6px">${L.line1}</p>
      <p style="margin:0 0 14px">${L.line2}</p>
      <p style="margin:0 0 16px"><a href="${link}" style="background:#2461e6;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">${L.cta}</a></p>
      <p style="color:#5c6678;font-size:12px;margin-top:16px">${L.foot}</p>
    </div>`;

  const fromName = process.env.NOTIFY_FROM_NAME || "Academic Risk Alert";
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });
  try {
    const info = await transporter.sendMail({ from: `"${fromName}" <${gmailUser}>`, to: student.email, subject: L.subject, html });
    return NextResponse.json({ ok: true, id: info.messageId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}
