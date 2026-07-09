import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Uses the service_role key → must run server-side on the Node.js runtime.
export const runtime = "nodejs";

// Admin provisioning: create login accounts for students, school-issued style.
// The school (advisor/manager) uploads a roster; each student gets a real auth
// account (email + an initial password) keyed on their MSSV (student_code).
//
// Security:
// - service_role NEVER reaches the browser; it lives only in this server route.
// - The CALLER must present a valid Supabase JWT of an advisor/manager (checked
//   with the anon client first). Only then do we touch the admin client.
// - Students are always role 'student' (metadata role is fixed here).
//
// Env: SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API).
function numOr(v: unknown, d: number): number {
  const n = Number(v);
  return v === null || v === undefined || v === "" || isNaN(n) ? d : n;
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

  // --- admin client (service_role) --------------------------------------------
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "admin_not_configured" }, { status: 501 });
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const students: any[] = Array.isArray(body?.students) ? body.students : [];
  const batchPassword = String(body?.password || "").trim();
  if (!students.length) return NextResponse.json({ ok: false, error: "no students" }, { status: 400 });

  const results: { code: string; email: string; ok: boolean; error?: string }[] = [];
  for (const s of students) {
    const email = String(s.email || "").trim().toLowerCase();
    const code = String(s.student_code || s.code || "").trim();
    const pass = String(s.password || batchPassword || "").trim();
    if (!email || !code) { results.push({ code, email, ok: false, error: "missing email or MSSV" }); continue; }
    if (pass.length < 6) { results.push({ code, email, ok: false, error: "password < 6 chars" }); continue; }

    // Create the auth user. The DB trigger (on_auth_user_created) creates the
    // matching profile from this metadata (role forced to 'student').
    const { error: cErr } = await admin.auth.admin.createUser({
      email,
      password: pass,
      email_confirm: true,
      user_metadata: {
        full_name: String(s.full_name || s.name || "").trim(),
        role: "student",
        student_code: code,
        program: String(s.program || "").trim(),
        cohort: String(s.cohort || "").trim(),
      },
    });
    if (cErr) { results.push({ code, email, ok: false, error: cErr.message }); continue; }

    // Fill extra profile fields the trigger doesn't set. Advisors own the rows
    // they import; a manager leaves advisor_id for major-based auto-assignment.
    const patch: Record<string, unknown> = {
      attendance_rate: numOr(s.attendance_rate, 100),
      lms_activity_score: numOr(s.lms_activity_score, 100),
    };
    if (caller.role === "advisor") patch.advisor_id = caller.id;
    await admin.from("profiles").update(patch).eq("email", email);

    results.push({ code, email, ok: true });
  }

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, created, failed: results.length - created, results });
}
