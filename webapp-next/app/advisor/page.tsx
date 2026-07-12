"use client";
import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { supabase, configured, getMyProfile, homeFor } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";
import { Icon } from "@/lib/icons";
import { BrandLogo, LangSwitch, RiskBadge, RiskBar } from "@/components/common";
import { gpaOf, bySemester, failedCount, computeCourse, numOr } from "@/lib/gpa";
import { compute as computeRisk, alertWorthy, DEFAULT_CONFIG, type RiskConfig } from "@/lib/risk";
import { fmtDate, initials, riskLabel } from "@/lib/format";
import {
  CourseRow, AddCourseForm, AddStudentForm, IndicatorsBox, SendNotifBox, InterventionForm, FactorList,
  IV_TYPES, NewCourse, NewStudent,
} from "@/components/advisor-parts";
import { predictAlarm, type Prediction } from "@/lib/predict";
import type { Profile, Course, RiskScore, Alert, Intervention, Message, Appointment } from "@/lib/types";

type View = "dashboard" | "students" | "student" | "alerts" | "interventions" | "messages" | "evaluation" | "gradebook";
// A validated grade row ready to write (used by the grade-import preview).
type PGrade = { sid: string; code: string; name: string; credits: number; semester: string; academic_year: string; wr: number; wm: number; wf: number; sr: number | null; sm: number | null; sf: number | null; total: number | null; letter: string | null; point: number | null };
interface Agg { courses: Course[]; cpa: number | null; credits: number; failed: number; risk: RiskScore | null; }
interface Core { students: Profile[]; courses: Course[]; risks: RiskScore[]; alerts: Alert[]; interventions: Intervention[]; msgUnread: number; }

export default function AdvisorPage() {
  const { t, locale, lang } = useI18n();
  const router = useRouter();
  const sb = supabase;

  const [me, setMe] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const [students, setStudents] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [risks, setRisks] = useState<RiskScore[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [msgUnread, setMsgUnread] = useState(0);

  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [alertStatusFilter, setAlertStatusFilter] = useState("Open");
  // Grade-import preview: parsed + validated rows awaiting confirmation.
  const [gradePreview, setGradePreview] = useState<null | { rows: PGrade[]; errors: { line: number; reason: string }[]; fileName: string }>(null);
  const [importing, setImporting] = useState(false);
  // Gradebook grid: pick a course (code|semester) and edit the whole class inline.
  const [gbCourse, setGbCourse] = useState<string | null>(null);
  const [gbEdits, setGbEdits] = useState<Record<string, { sr?: string; sm?: string; sf?: string }>>({});
  const [gbSaving, setGbSaving] = useState(false);
  // Configurable risk weights/thresholds (loaded from risk_config; default fallback).
  const [riskCfg, setRiskCfg] = useState<RiskConfig>(DEFAULT_CONFIG);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [syncUrl, setSyncUrl] = useState("");
  const [syncCsv, setSyncCsv] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [detailMsgs, setDetailMsgs] = useState<Message[]>([]);
  const [detailReply, setDetailReply] = useState("");
  const [detailAppts, setDetailAppts] = useState<Appointment[]>([]);
  const [apptTick, setApptTick] = useState(0);
  const [allMsgs, setAllMsgs] = useState<Message[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [msgTick, setMsgTick] = useState(0);

  // ------------------------------------------------------------ core data
  async function fetchCore(): Promise<Core> {
    // Advisors only manage students assigned to them (their major); managers see all.
    const scope = !!me && me.role === "advisor";
    let sQuery = sb!.from("profiles").select("*").eq("role", "student");
    // advisor sees their students + any not-yet-assigned student (so self-signups aren't orphaned)
    if (scope) sQuery = sQuery.or("advisor_id.eq." + me!.id + ",advisor_id.is.null");
    const stu = await sQuery.order("full_name");
    const studentsData = (stu.data as Profile[]) || [];
    const ids = studentsData.map((s) => s.id);

    // apply the student-id filter BEFORE .order()/count (filters must precede transforms)
    const applyScope = (q: any) => (scope ? q.in("student_id", ids) : q);
    const [crs, rsk, alr, unread] = await Promise.all([
      applyScope(sb!.from("courses").select("*")),
      applyScope(sb!.from("risk_scores").select("*")).order("computed_at", { ascending: false }),
      applyScope(sb!.from("alerts").select("*")).order("created_at", { ascending: false }),
      applyScope(sb!.from("messages").select("id", { count: "exact", head: true }).eq("is_read", false).eq("sender_role", "student")),
    ]);
    const alertsData = (alr.data as Alert[]) || [];
    const alertIds = alertsData.map((a) => a.id);
    let ivData: Intervention[] = [];
    if (scope) {
      if (alertIds.length) {
        const ivRes = await sb!.from("interventions").select("*").in("alert_id", alertIds).order("created_at", { ascending: false });
        ivData = (ivRes.data as Intervention[]) || [];
      }
    } else {
      const ivRes = await sb!.from("interventions").select("*").order("created_at", { ascending: false });
      ivData = (ivRes.data as Intervention[]) || [];
    }
    return {
      students: studentsData, courses: (crs.data as Course[]) || [],
      risks: (rsk.data as RiskScore[]) || [], alerts: alertsData, interventions: ivData, msgUnread: unread.count || 0,
    };
  }
  function applyCore(c: Core) {
    setStudents(c.students); setCourses(c.courses); setRisks(c.risks); setAlerts(c.alerts); setInterventions(c.interventions); setMsgUnread(c.msgUnread);
  }
  async function loadCore(): Promise<Core> { const c = await fetchCore(); applyCore(c); return c; }

  async function recomputeStudent(student: Profile, core: Core, cfg: RiskConfig = riskCfg): Promise<boolean> {
    const cs = core.courses.filter((c) => c.student_id === student.id);
    const g = gpaOf(cs);
    const failed = failedCount(cs);
    if (g.gpa === null && failed === 0) return false;
    const result = computeRisk({ cpa: g.gpa, attendance_rate: student.attendance_rate, lms_activity_score: student.lms_activity_score, failed_count: failed }, cfg);
    await sb!.from("risk_scores").insert({
      student_id: student.id, score: result.score, risk_level: result.level,
      factor_gpa: result.factor_gpa, factor_attendance: result.factor_attendance,
      factor_lms: result.factor_lms, factor_failed_credits: result.factor_failed_credits,
    });
    // Compound rules — early signals that fire an alert even when the composite
    // score is still low (e.g. a sharp GPA drop, repeated fails, disengagement).
    const sems = bySemester(cs).filter((x) => x.gpa !== null);
    const gpaDrop = sems.length >= 2 ? (sems[1].gpa as number) - (sems[0].gpa as number) : 0; // sems newest-first
    const reasons: string[] = [];
    if (gpaDrop >= 0.5) reasons.push(t("alert.rGpaDrop", { d: gpaDrop.toFixed(2) }));
    if (failed >= 2) reasons.push(t("alert.rFailed", { n: failed }));
    if (student.attendance_rate < 75) reasons.push(t("alert.rAttendance", { att: Math.round(student.attendance_rate) }));
    if (student.lms_activity_score < 40) reasons.push(t("alert.rLms", { lms: Math.round(student.lms_activity_score) }));

    const openAlert = core.alerts.find((a) => a.student_id === student.id && a.status === "Open");
    if ((alertWorthy(result.level) || reasons.length > 0) && !openAlert) {
      // A compound-only trigger (score still Low) is floored at Medium so it reads
      // as a genuine alert.
      const alertLevel = alertWorthy(result.level) ? result.level : "Medium";
      await sb!.from("alerts").insert({
        student_id: student.id, advisor_id: student.advisor_id || me!.id,
        risk_level: alertLevel, score_at_alert: result.score, status: "Open",
      });
      const body = t("alert.autoBody", { level: riskLabel(t, alertLevel) })
        + (reasons.length ? " " + t("alert.reasonsLabel") + " " + reasons.join("; ") + "." : "");
      await sb!.from("notifications").insert({
        student_id: student.id, sender_id: me!.id, type: "alert",
        title: t("alert.autoTitle"), body,
      });
      // Best-effort awareness email to the student (no-op if email unconfigured).
      if (student.email) {
        try {
          const { data: sess } = await sb!.auth.getSession();
          const token = sess.session?.access_token;
          if (token) {
            void fetch("/api/notify-alert", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ studentId: student.id, level: alertLevel, lang }),
            }).catch(() => {});
          }
        } catch { /* ignore email errors */ }
      }
    }
    return true;
  }
  async function recomputeAll() {
    const core = await fetchCore();
    for (const s of core.students) await recomputeStudent(s, core);
    await loadCore();
    toast(t("toast.recalcAll"), "success");
  }

  // ------------------------------------------------------------ guard
  useEffect(() => {
    if (!configured) { router.replace("/"); return; }
    getMyProfile().then((p) => {
      if (!p) { router.replace("/"); return; }
      if (p.role !== "advisor" && p.role !== "manager") { router.replace(homeFor(p.role)); return; }
      setMe(p);
    });
  }, [router]);

  // ------------------------------------------------------------ load + realtime
  useEffect(() => {
    if (!me || !sb) return;
    let active = true;
    (async () => {
      // Load custom risk config if the table exists (else keep defaults).
      const { data: cfg } = await sb.from("risk_config").select("w_gpa,w_att,w_lms,w_fail,th_medium,th_high,th_critical").eq("id", 1).maybeSingle();
      const effCfg: RiskConfig = cfg
        ? { w_gpa: +cfg.w_gpa, w_att: +cfg.w_att, w_lms: +cfg.w_lms, w_fail: +cfg.w_fail, th_medium: +cfg.th_medium, th_high: +cfg.th_high, th_critical: +cfg.th_critical }
        : DEFAULT_CONFIG;
      if (active && cfg) setRiskCfg(effCfg);
      const core = await fetchCore();
      if (!active) return;
      applyCore(core);
      let scored = false;
      for (const s of core.students) {
        if (!core.risks.some((r) => r.student_id === s.id)) {
          const did = await recomputeStudent(s, core, effCfg);
          if (did) scored = true;
        }
      }
      if (scored && active) await loadCore();
      if (active) setReady(true);
    })();

    const chMsg = sb.channel("rt-adv-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        if (payload.new.sender_role === "student") { setMsgUnread((n) => n + 1); toast(t("adv.toastNewMsg")); }
        setMsgTick((x) => x + 1);
      })
      .subscribe();
    const chAlerts = sb.channel("rt-adv-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => { loadCore(); })
      .subscribe();

    return () => { active = false; sb.removeChannel(chMsg); sb.removeChannel(chAlerts); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // load this student's chat messages for the detail view (advisor ↔ student)
  useEffect(() => {
    if (view !== "student" || !selectedId || !sb) return;
    sb.from("messages").select("*").eq("student_id", selectedId).order("created_at", { ascending: true })
      .then(({ data }) => setDetailMsgs((data as Message[]) || []));
  }, [view, selectedId, msgTick]);

  // load this student's advisor appointments for the detail view
  useEffect(() => {
    if (view !== "student" || !selectedId || !sb) return;
    sb.from("appointments").select("*").eq("student_id", selectedId).order("starts_at", { ascending: true })
      .then(({ data }) => setDetailAppts((data as Appointment[]) || []));
  }, [view, selectedId, apptTick]);

  // load messages for the messages view (and on realtime tick)
  useEffect(() => {
    if (view !== "messages" || !sb) return;
    sb.from("messages").select("*").order("created_at", { ascending: true })
      .then(({ data }) => setAllMsgs((data as Message[]) || []));
  }, [view, msgTick]);

  // mark the selected thread's student messages as read
  useEffect(() => {
    if (view !== "messages" || !selectedThread || !sb) return;
    const unreadIds = allMsgs.filter((m) => m.student_id === selectedThread && m.sender_role === "student" && !m.is_read).map((m) => m.id);
    if (!unreadIds.length) return;
    sb.from("messages").update({ is_read: true }).in("id", unreadIds).then(() => {
      setAllMsgs((prev) => prev.map((m) => (unreadIds.includes(m.id) ? { ...m, is_read: true } : m)));
      setMsgUnread((n) => Math.max(0, n - unreadIds.length));
    });
  }, [view, selectedThread, allMsgs]);

  // ------------------------------------------------------------ derived
  const coursesBy = useMemo(() => {
    const m: Record<string, Course[]> = {};
    for (const c of courses) (m[c.student_id] = m[c.student_id] || []).push(c);
    return m;
  }, [courses]);
  const riskBy = useMemo(() => {
    const m: Record<string, RiskScore> = {};
    for (const r of risks) if (!m[r.student_id]) m[r.student_id] = r; // risks are desc → first is latest
    return m;
  }, [risks]);
  // Distinct courses (code + semester) for the gradebook selector.
  const courseOptions = useMemo(() => {
    const m = new Map<string, { k: string; code: string; name: string; semester: string; count: number }>();
    for (const c of courses) {
      if (!c.code) continue;
      const k = c.code + "|" + c.semester;
      const e = m.get(k);
      if (e) e.count++; else m.set(k, { k, code: c.code, name: c.name, semester: c.semester, count: 1 });
    }
    return [...m.values()].sort((a, b) => (b.semester + a.code).localeCompare(a.semester + b.code));
  }, [courses]);

  const studentById = (id: string) => students.find((s) => s.id === id);
  const openAlertFor = (id: string) => alerts.find((a) => a.student_id === id && a.status === "Open") || null;
  const agg = (s: Profile): Agg => {
    const cs = coursesBy[s.id] || [];
    const overall = gpaOf(cs);
    return { courses: cs, cpa: overall.gpa, credits: overall.credits, failed: failedCount(cs), risk: riskBy[s.id] || null };
  };
  const statusLabel = (s: string) => t("status." + s);
  const ivStatusLabel = (s: string) => t("iv." + s);
  const ivTypeLabel = (k: string) => { const v = t("ivtype." + k); return v === "ivtype." + k ? k : v; };
  const bandToRisk = (b: string) => (({ alarm: "Critical", high: "High", watch: "Medium", safe: "Low", unscored: "Unscored" } as Record<string, string>)[b] || "Unscored");
  const predOf = (s: Profile, a: Agg): Prediction =>
    predictAlarm({ score: a.risk ? a.risk.score : null, cpa: a.cpa, attendance_rate: s.attendance_rate, lms_activity_score: s.lms_activity_score, failed_count: a.failed }, risks.filter((r) => r.student_id === s.id));

  const openStudent = (id: string) => { setSelectedId(id); setView("student"); };

  // ------------------------------------------------------------ mutations
  async function saveCourse(courseId: string, r: string, m: string, f: string) {
    if (!sb || !selectedId) return;
    const course = (coursesBy[selectedId] || []).find((c) => c.id === courseId);
    if (!course) return;
    if (course.locked) return toast(t("toast.courseLocked"), "error");
    if (![r, m, f].every((v) => parseScore(v).ok)) return toast(t("gimp.errScore"), "error");
    const g = computeCourse({ score_regular: r, score_midterm: m, score_final: f, weight_regular: course.weight_regular, weight_midterm: course.weight_midterm, weight_final: course.weight_final });
    const { error } = await sb.from("courses").update({
      score_regular: r === "" ? null : Number(r),
      score_midterm: m === "" ? null : Number(m),
      score_final: f === "" ? null : Number(f),
      total_score: g.total, letter_grade: g.letter, grade_point: g.point, updated_at: new Date().toISOString(),
    }).eq("id", courseId);
    if (error) return toast(error.message, "error");
    const fmt = (v: string) => (v === "" ? "—" : v);
    const notifBody = t("notif.gradeBodyDetailed", { course: course.name, r: fmt(r), m: fmt(m), f: fmt(f), total: g.total === null ? "—" : String(g.total), letter: g.letter || "—" });
    await sb.from("notifications").insert({ student_id: selectedId, sender_id: me!.id, type: "grade", title: t("notif.gradeTitle"), body: notifBody });
    toast(t("toast.gradeSaved"), "success");
    const core = await loadCore();
    const st = core.students.find((x) => x.id === selectedId);
    if (st) {
      await recomputeStudent(st, core);
      // best-effort email to the student (no-op if RESEND_API_KEY / email missing)
      if (st.email) {
        try {
          const { data: sess } = await sb.auth.getSession();
          const token = sess.session?.access_token;
          if (token) {
            void fetch("/api/notify-grade", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ studentId: st.id, courseName: course.name, r: fmt(r), m: fmt(m), f: fmt(f), total: g.total, letter: g.letter, lang }),
            }).catch(() => {});
          }
        } catch { /* ignore email errors */ }
      }
    }
    await loadCore();
  }

  async function addCourse(c: NewCourse) {
    if (!sb || !selectedId) return;
    if (!c.name.trim()) return toast(t("toast.enterCourse"), "error");
    if (![c.sr, c.sm, c.sf].every((v) => parseScore(v).ok)) return toast(t("gimp.errScore"), "error");
    const wr = numOr(c.wr, 0.2), wm = numOr(c.wm, 0.3), wf = numOr(c.wf, 0.5);
    const g = computeCourse({ score_regular: c.sr, score_midterm: c.sm, score_final: c.sf, weight_regular: wr, weight_midterm: wm, weight_final: wf });
    const { error } = await sb.from("courses").insert({
      student_id: selectedId, code: c.code.trim(), name: c.name.trim(), credits: parseInt(c.credits) || 3,
      semester: c.semester.trim() || "—", academic_year: c.year.trim(),
      weight_regular: wr, weight_midterm: wm, weight_final: wf,
      score_regular: c.sr === "" ? null : Number(c.sr), score_midterm: c.sm === "" ? null : Number(c.sm), score_final: c.sf === "" ? null : Number(c.sf),
      total_score: g.total, letter_grade: g.letter, grade_point: g.point,
    });
    if (error) return toast(error.message, "error");
    toast(t("toast.courseAdded"), "success");
    const core = await loadCore();
    const st = core.students.find((x) => x.id === selectedId);
    if (st) await recomputeStudent(st, core);
    await loadCore();
  }

  async function saveIndicators(att: string, lms: string) {
    if (!sb || !selectedId) return;
    const st0 = studentById(selectedId);
    const { error } = await sb.from("profiles").update({
      attendance_rate: numOr(att, st0?.attendance_rate ?? 100), lms_activity_score: numOr(lms, st0?.lms_activity_score ?? 100),
    }).eq("id", selectedId);
    if (error) return toast(error.message, "error");
    toast(t("toast.indicators"), "success");
    const core = await loadCore();
    const st = core.students.find((x) => x.id === selectedId);
    if (st) await recomputeStudent(st, core);
    await loadCore();
  }

  // Provision real login accounts (email + password) via the server-side admin
  // endpoint, which uses the service_role key. Keyed on MSSV (student_code).
  async function provisionStudents(students: any[], password: string): Promise<any> {
    const { data: sess } = await sb!.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, error: "unauthorized" };
    const res = await fetch("/api/admin/import-students", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ students, password }),
    });
    return res.json().catch(() => ({ ok: false, error: "bad response" }));
  }
  function adminErr(r: any): string {
    if (r?.error === "admin_not_configured") return t("toast.adminNotConfigured");
    if (r?.error === "forbidden" || r?.error === "unauthorized") return t("toast.notConfigured");
    return String(r?.error || "error");
  }

  // Pull attendance % + LMS activity from an external SIS/LMS export and apply.
  async function syncLms(source: "url" | "csv") {
    if (!sb) return;
    if (source === "url" && !syncUrl.trim()) return toast(t("sync.needUrl"), "error");
    if (source === "csv" && !syncCsv.trim()) return toast(t("sync.needCsv"), "error");
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return toast(t("toast.notConfigured"), "error");
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-lms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(source === "url" ? { url: syncUrl.trim() } : { csv: syncCsv }),
      });
      const r = await res.json().catch(() => ({ ok: false, error: "bad response" }));
      if (!r.ok) { toast(adminErr(r), "error"); setSyncResult(t("sync.failed") + " " + adminErr(r)); return; }
      setSyncResult(t("sync.result", { updated: r.updated, skipped: r.skipped, received: r.received }));
      toast(t("sync.done", { n: r.updated }), "success");
      await recomputeAll();     // re-fetch new metrics + recompute risk from them
    } finally {
      setSyncing(false);
    }
  }

  async function addStudent(s: NewStudent) {
    if (!sb || !me) return;
    if (!s.name.trim() || !s.code.trim() || !s.email.trim()) return toast(t("toast.enterNameEmailCode"), "error");
    if ((s.pw || "").trim().length < 6) return toast(t("toast.pwMin"), "error");
    const r = await provisionStudents([{
      student_code: s.code.trim(), full_name: s.name.trim(), email: s.email.trim(),
      program: s.program.trim(), cohort: s.cohort.trim(),
      attendance_rate: s.att, lms_activity_score: s.lms, password: s.pw.trim(),
    }], s.pw.trim());
    if (!r.ok) return toast(adminErr(r), "error");
    if (r.failed) return toast(r.results?.[0]?.error || t("adv.importFail", { n: r.failed }), "error");
    toast(t("toast.studentAdded"), "success");
    setShowAdd(false);
    await loadCore();
  }

  async function sendNotification(title: string, body: string, reset: () => void) {
    if (!sb || !selectedId) return;
    if (!title.trim() && !body.trim()) return toast(t("toast.enterNotif"), "error");
    const { error } = await sb.from("notifications").insert({ student_id: selectedId, sender_id: me!.id, type: "message", title: title.trim() || t("notif.fromAdvisor"), body: body.trim() });
    if (error) return toast(error.message, "error");
    toast(t("toast.notifSent"), "success");
    reset();
  }

  async function assignAlert(alertId: string) {
    if (!sb) return;
    const al = alerts.find((x) => x.id === alertId);
    const patch: Record<string, unknown> = { advisor_id: me!.id };
    if (al && al.status === "Open") patch.status = "Acknowledged";
    const { error } = await sb.from("alerts").update(patch).eq("id", alertId);
    if (error) return toast(error.message, "error");
    await loadCore();
  }
  async function setAlertStatus(alertId: string, status: string) {
    if (!sb) return;
    const patch: Record<string, unknown> = { status };
    if (status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await sb.from("alerts").update(patch).eq("id", alertId);
    if (error) return toast(error.message, "error");
    toast(t("toast.alertStatus"), "success");
    await loadCore();
  }
  async function addIntervention(attachAlert: Alert, type: string, notes: string, status: string) {
    if (!sb) return;
    const { error } = await sb.from("interventions").insert({ alert_id: attachAlert.id, advisor_id: me!.id, action_type: type, notes: notes.trim(), status });
    if (error) return toast(error.message, "error");
    if (attachAlert.status === "Open") await sb.from("alerts").update({ status: "Acknowledged" }).eq("id", attachAlert.id);
    toast(t("toast.ivLogged"), "success");
    await loadCore();
  }
  async function sendDetailReply(e: FormEvent) {
    e.preventDefault();
    if (!sb || !selectedId) return;
    const body = detailReply.trim(); if (!body) return;
    setDetailReply("");
    const { error } = await sb.from("messages").insert({ student_id: selectedId, advisor_id: me!.id, sender_id: me!.id, sender_role: "advisor", body });
    if (error) { toast(error.message, "error"); return; }
    await sb.from("notifications").insert({ student_id: selectedId, sender_id: me!.id, type: "message", title: t("notif.advReplyTitle"), body });
    setMsgTick((x) => x + 1);
  }
  function parseCsv(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = (cells[i] || "").trim()));
      return obj;
    });
  }
  async function importCsv(file: File) {
    if (!sb || !me) return;
    const rows = parseCsv(await file.text());
    const students = rows
      .map((row) => ({
        student_code: (row.student_code || row.code || "").trim(),
        full_name: (row.full_name || row.name || "").trim(),
        email: (row.email || "").trim(),
        program: (row.program || "").trim(),
        cohort: (row.cohort || "").trim(),
        attendance_rate: row.attendance_rate,
        lms_activity_score: row.lms_activity_score,
        password: (row.password || "").trim(),
      }))
      .filter((s) => s.student_code || s.email);
    if (!students.length) return toast(t("adv.importFail", { n: 0 }), "error");
    // A shared initial password for any row that didn't include its own.
    const batch = (window.prompt(t("adv.batchPasswordPrompt"), "") || "").trim();
    const r = await provisionStudents(students, batch);
    if (!r.ok) return toast(adminErr(r), "error");
    toast(t("adv.importDone", { n: r.created }) + (r.failed ? " · " + t("adv.importFail", { n: r.failed }) : ""), r.failed ? "error" : "success");
    await loadCore();
  }
  function downloadTemplate() {
    const csv = "student_code,full_name,email,program,cohort,attendance_rate,lms_activity_score,password\nSV010,Nguyen Van A,sv010@gmail.com,He thong thong tin,K69,90,80,Sv@123456\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "students_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // A score cell: empty is allowed (null); otherwise must be a number in 0..10.
  const parseScore = (v: unknown): { ok: boolean; val: number | null } => {
    if (v === "" || v === null || v === undefined) return { ok: true, val: null };
    const n = Number(v);
    return isNaN(n) || n < 0 || n > 10 ? { ok: false, val: null } : { ok: true, val: n };
  };

  // Step 1 — parse + VALIDATE a grade CSV (keyed on MSSV) into a preview. Nothing
  // is written yet; the advisor confirms after seeing valid/error counts.
  async function prepareGrades(file: File) {
    if (!sb || !me) return;
    const rows = parseCsv(await file.text());
    const byCode = new Map<string, string>();
    for (const s of students) if (s.student_code) byCode.set(s.student_code.trim().toLowerCase(), s.id);
    const valid: PGrade[] = [];
    const errors: { line: number; reason: string }[] = [];
    rows.forEach((row, i) => {
      const line = i + 2; // +1 for header, +1 for 1-based
      const code = (row.student_code || row.mssv || row.code || "").trim();
      const name = (row.course_name || row.name || "").trim();
      if (!code) return errors.push({ line, reason: t("gimp.errNoMssv") });
      const sid = byCode.get(code.toLowerCase());
      if (!sid) return errors.push({ line, reason: t("gimp.errMssvNotFound", { code }) });
      if (!name) return errors.push({ line, reason: t("gimp.errNoCourse") });
      const sr = parseScore(row.score_regular), sm = parseScore(row.score_midterm), sf = parseScore(row.score_final);
      if (!sr.ok || !sm.ok || !sf.ok) return errors.push({ line, reason: t("gimp.errScore") });
      const wr = numOr(row.weight_regular, 0.2), wm = numOr(row.weight_midterm, 0.3), wf = numOr(row.weight_final, 0.5);
      const g = computeCourse({ score_regular: row.score_regular, score_midterm: row.score_midterm, score_final: row.score_final, weight_regular: wr, weight_midterm: wm, weight_final: wf });
      valid.push({
        sid, code: (row.course_code || "").trim(), name, credits: parseInt(row.credits) || 3,
        semester: (row.semester || "").trim() || "—", academic_year: (row.academic_year || row.year || "").trim(),
        wr, wm, wf, sr: sr.val, sm: sm.val, sf: sf.val, total: g.total, letter: g.letter, point: g.point,
      });
    });
    setGradePreview({ rows: valid, errors, fileName: file.name });
  }

  // Step 2 — write the previewed rows FAST: one query to load existing courses,
  // then a single bulk insert for new rows + parallel updates for existing ones.
  async function commitGrades() {
    if (!sb || !me || !gradePreview) return;
    const rows = gradePreview.rows;
    if (!rows.length) { setGradePreview(null); return; }
    setImporting(true);
    const sids = [...new Set(rows.map((r) => r.sid))];
    const { data: existing } = await sb.from("courses").select("id, student_id, code, semester, locked").in("student_id", sids);
    const key = (sid: string, code: string, sem: string) => sid + "|" + code + "|" + sem;
    const existMap = new Map<string, { id: string; locked: boolean }>();
    for (const c of (existing || []) as any[]) if (c.code) existMap.set(key(c.student_id, c.code, c.semester), { id: c.id, locked: !!c.locked });
    const now = new Date().toISOString();
    const toInsert: any[] = [];
    const toUpdate: { id: string; payload: any }[] = [];
    let lockedSkipped = 0;
    for (const r of rows) {
      const payload = {
        student_id: r.sid, code: r.code, name: r.name, credits: r.credits, semester: r.semester, academic_year: r.academic_year,
        weight_regular: r.wr, weight_midterm: r.wm, weight_final: r.wf, score_regular: r.sr, score_midterm: r.sm, score_final: r.sf,
        total_score: r.total, letter_grade: r.letter, grade_point: r.point, updated_at: now,
      };
      const ex = r.code ? existMap.get(key(r.sid, r.code, r.semester)) : undefined;
      if (ex?.locked) { lockedSkipped++; continue; } // never overwrite a locked course
      if (ex) toUpdate.push({ id: ex.id, payload }); else toInsert.push(payload);
    }
    let failed = 0;
    if (toInsert.length) { const { error } = await sb.from("courses").insert(toInsert); if (error) failed += toInsert.length; }
    const upRes = await Promise.all(toUpdate.map((u) => sb!.from("courses").update(u.payload).eq("id", u.id)));
    failed += upRes.filter((r) => r.error).length;
    const core = await fetchCore();
    for (const sid of sids) { const st = core.students.find((x) => x.id === sid); if (st) await recomputeStudent(st, core); }
    await loadCore();
    setImporting(false);
    setGradePreview(null);
    const done = rows.length - failed - lockedSkipped;
    toast(t("adv.importGradesDone", { n: done }) + (lockedSkipped ? " · " + t("gb.lockedSkip", { n: lockedSkipped }) : "") + (failed ? " · " + t("adv.importFail", { n: failed }) : ""), failed || lockedSkipped ? "error" : "success");
  }
  function downloadGradeErrors() {
    if (!gradePreview) return;
    const csv = "line,reason\n" + gradePreview.errors.map((e) => e.line + ',"' + e.reason.replace(/"/g, '""') + '"').join("\n") + "\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "grade_import_errors.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  function downloadGradeTemplate() {
    const csv =
      "student_code,course_code,course_name,credits,semester,academic_year,weight_regular,weight_midterm,weight_final,score_regular,score_midterm,score_final\n" +
      "SV001,INT1004,Nhap mon lap trinh,3,2024-2,2024-2025,0.2,0.3,0.5,8.0,8.5,9.0\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "grades_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!sb || !selectedThread) return;
    const body = reply.trim(); if (!body) return;
    setReply("");
    const { error } = await sb.from("messages").insert({ student_id: selectedThread, advisor_id: me!.id, sender_id: me!.id, sender_role: "advisor", body });
    if (error) { toast(error.message, "error"); return; }
    await sb.from("notifications").insert({ student_id: selectedThread, sender_id: me!.id, type: "message", title: t("notif.advReplyTitle"), body });
    setMsgTick((x) => x + 1);
  }

  // ------------------------------------------------------------ renderers
  const RiskTable = (rows: { s: Profile; a: Agg }[]) => {
    if (!rows.length) return <div className="empty"><Icon name="check" size={30} />{t("empty.noStudents")}</div>;
    return (
      <table>
        <thead><tr>
          <th>{t("th.student")}</th><th>{t("th.studentId")}</th><th className="text-right">CPA</th><th>{t("th.riskScore")}</th><th>{t("th.level")}</th><th>{t("th.predict")}</th><th>{t("th.alert")}</th>
        </tr></thead>
        <tbody>
          {rows.map(({ s, a }) => (
            <tr key={s.id} className="row-link" onClick={() => openStudent(s.id)}>
              <td><b>{s.full_name}</b><div className="muted-note">{s.program || ""}</div></td>
              <td className="mono">{s.student_code || "—"}</td>
              <td className="text-right mono strong">{a.cpa === null ? "—" : a.cpa.toFixed(2)}</td>
              <td><div className="score-cell"><span className="score-num">{a.risk ? a.risk.score : "—"}</span><RiskBar risk={a.risk} /></div></td>
              <td><RiskBadge level={a.risk ? a.risk.risk_level : "Unscored"} /></td>
              <td>{(() => { const p = predOf(s, a); return <span className={"badge badge-" + bandToRisk(p.band)}>{t("predict.band." + p.band)}</span>; })()}</td>
              <td>{openAlertFor(s.id) ? <span className="pill Open">{t("status.Open")}</span> : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ---- Gradebook grid: grade a whole class (one course) at once ----
  const gbVal = (c: Course, field: "sr" | "sm" | "sf") => {
    const e = gbEdits[c.id];
    if (e && e[field] !== undefined) return e[field] as string;
    const src = field === "sr" ? c.score_regular : field === "sm" ? c.score_midterm : c.score_final;
    return src === null || src === undefined ? "" : String(src);
  };
  const gbSet = (id: string, field: "sr" | "sm" | "sf", v: string) =>
    setGbEdits((p) => ({ ...p, [id]: { ...p[id], [field]: v } }));

  async function saveGradebook(rows: Course[]) {
    if (!sb) return;
    for (const c of rows) {
      if (![gbVal(c, "sr"), gbVal(c, "sm"), gbVal(c, "sf")].every((v) => parseScore(v).ok)) return toast(t("gimp.errScore"), "error");
    }
    setGbSaving(true);
    const now = new Date().toISOString();
    const affected = new Set<string>();
    const ups = rows.map((c) => {
      const sr = gbVal(c, "sr"), sm = gbVal(c, "sm"), sf = gbVal(c, "sf");
      const g = computeCourse({ score_regular: sr, score_midterm: sm, score_final: sf, weight_regular: c.weight_regular, weight_midterm: c.weight_midterm, weight_final: c.weight_final });
      affected.add(c.student_id);
      return sb!.from("courses").update({
        score_regular: parseScore(sr).val, score_midterm: parseScore(sm).val, score_final: parseScore(sf).val,
        total_score: g.total, letter_grade: g.letter, grade_point: g.point, updated_at: now,
      }).eq("id", c.id);
    });
    const res = await Promise.all(ups);
    const failed = res.filter((r) => r.error).length;
    const core = await fetchCore();
    for (const sid of affected) { const st = core.students.find((x) => x.id === sid); if (st) await recomputeStudent(st, core); }
    await loadCore();
    setGbSaving(false);
    setGbEdits({});
    toast(failed ? t("adv.importFail", { n: failed }) : t("gb.saved"), failed ? "error" : "success");
  }

  // Lock/unlock all rows of the selected course (finalize grades).
  async function toggleLock(rows: Course[], lock: boolean) {
    if (!sb || !rows.length) return;
    setGbSaving(true);
    const { error } = await sb.from("courses").update({ locked: lock }).in("id", rows.map((c) => c.id));
    setGbSaving(false);
    if (error) return toast(t("gb.lockErr"), "error");
    await loadCore();
    toast(lock ? t("gb.locked") : t("gb.unlocked"), "success");
  }

  // Export a course's grade sheet to CSV (same columns as the grade importer, so
  // it round-trips: download → edit in Excel → re-import via "Nhập điểm").
  function exportGradebook(rows: Course[]) {
    if (!rows.length) return;
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = "student_code,student_name,course_code,course_name,credits,semester,academic_year,weight_regular,weight_midterm,weight_final,score_regular,score_midterm,score_final";
    const lines = rows
      .map((c) => ({ c, s: studentById(c.student_id) }))
      .sort((a, b) => (a.s?.full_name || "").localeCompare(b.s?.full_name || ""))
      .map(({ c, s }) => [
        s?.student_code || "", s?.full_name || "", c.code || "", c.name || "", c.credits, c.semester, c.academic_year || "",
        c.weight_regular, c.weight_midterm, c.weight_final, c.score_regular ?? "", c.score_midterm ?? "", c.score_final ?? "",
      ].map(esc).join(","));
    const csv = "﻿" + [header, ...lines].join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const [xc, xs] = (gbCourse || "|").split("|");
    const a = document.createElement("a"); a.href = url; a.download = "diem_" + xc + "_" + xs + ".csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const renderGradebook = () => {
    const [code, sem] = gbCourse ? gbCourse.split("|") : ["", ""];
    const rows = gbCourse ? courses.filter((c) => c.code === code && c.semester === sem) : [];
    const list = rows.map((c) => ({ c, s: studentById(c.student_id) })).filter((r): r is { c: Course; s: Profile } => !!r.s);
    list.sort((a, b) => (a.s.full_name || "").localeCompare(b.s.full_name || ""));
    const locked = list.length > 0 && list.every(({ c }) => c.locked);
    return (
      <>
        <div className="page-head"><div><div className="page-title">{t("gb.title")}</div><div className="page-sub">{t("gb.sub")}</div></div></div>
        <div className="card">
          <div className="field" style={{ maxWidth: 480 }}>
            <label>{t("gb.pickCourse")}</label>
            <select value={gbCourse || ""} onChange={(e) => { setGbCourse(e.target.value || null); setGbEdits({}); }}>
              <option value="">{t("gb.selectCourse")}</option>
              {courseOptions.map((o) => <option key={o.k} value={o.k}>{o.code} — {o.name} · {o.semester} ({o.count})</option>)}
            </select>
          </div>
          {!gbCourse && <div className="muted-note">{t("gb.hint")}</div>}
          {gbCourse && (list.length ? (
            <>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>{t("th.student")}</th><th>{t("th.studentId")}</th><th>{t("th.reg")}</th><th>{t("th.mid")}</th><th>{t("th.final")}</th><th>{t("th.total")}</th><th>{t("th.grade")}</th></tr></thead>
                  <tbody>
                    {list.map(({ c, s }) => {
                      const sr = gbVal(c, "sr"), sm = gbVal(c, "sm"), sf = gbVal(c, "sf");
                      const g = computeCourse({ score_regular: sr, score_midterm: sm, score_final: sf, weight_regular: c.weight_regular, weight_midterm: c.weight_midterm, weight_final: c.weight_final });
                      return (
                        <tr key={c.id}>
                          <td>{s.full_name}</td><td className="mono">{s.student_code || "—"}</td>
                          <td><input className="cell-in" inputMode="decimal" value={sr} disabled={locked} onChange={(e) => gbSet(c.id, "sr", e.target.value)} /></td>
                          <td><input className="cell-in" inputMode="decimal" value={sm} disabled={locked} onChange={(e) => gbSet(c.id, "sm", e.target.value)} /></td>
                          <td><input className="cell-in" inputMode="decimal" value={sf} disabled={locked} onChange={(e) => gbSet(c.id, "sf", e.target.value)} /></td>
                          <td className="mono">{g.total === null ? "—" : g.total}</td>
                          <td><span className={"grade-chip grade-" + (g.letter || "").replace("+", "p")}>{g.letter || "—"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {locked && <span className="pill Resolved">{t("gb.lockedBadge")}</span>}
                <button className="btn btn-primary" disabled={gbSaving || locked} onClick={() => saveGradebook(rows)}>{gbSaving ? t("loading") : t("gb.saveAll", { n: list.length })}</button>
                <button className="btn" onClick={() => exportGradebook(rows)}><Icon name="inbox" size={16} /> {t("gb.export")}</button>
                <button className="btn" disabled={gbSaving} onClick={() => toggleLock(rows, !locked)}>{locked ? t("gb.unlock") : t("gb.lock")}</button>
              </div>
            </>
          ) : <div className="empty">{t("gb.noStudents")}</div>)}
        </div>
      </>
    );
  };

  // Risk config: managers edit weights + thresholds; persisted to risk_config.
  const setCfg = (k: keyof RiskConfig, v: number) => setRiskCfg((p) => ({ ...p, [k]: v }));
  async function saveConfig() {
    if (!sb || me?.role !== "manager") return;
    setCfgSaving(true);
    const { error } = await sb.from("risk_config").update({
      w_gpa: riskCfg.w_gpa, w_att: riskCfg.w_att, w_lms: riskCfg.w_lms, w_fail: riskCfg.w_fail,
      th_medium: riskCfg.th_medium, th_high: riskCfg.th_high, th_critical: riskCfg.th_critical, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setCfgSaving(false);
    if (error) return toast(t("cfg.err"), "error");
    toast(t("cfg.saved"), "success");
  }

  const renderConfigCard = () => {
    const isMgr = me?.role === "manager";
    const wSum = riskCfg.w_gpa + riskCfg.w_att + riskCfg.w_lms + riskCfg.w_fail;
    const numField = (label: string, k: keyof RiskConfig, step: string) => (
      <div className="field"><label>{label}</label>
        <input type="number" step={step} min="0" value={riskCfg[k]} disabled={!isMgr} onChange={(e) => setCfg(k, numOr(e.target.value, 0))} /></div>
    );
    return (
      <div className="card">
        <div className="card-head"><div className="card-title"><Icon name="edit" /> {t("cfg.title")}</div>
          <div className="card-sub">{isMgr ? t("cfg.subManager") : t("cfg.subRead")}</div></div>
        <div className="card-sub" style={{ marginBottom: 6 }}>{t("cfg.weights")}</div>
        <div className="field-grid">
          {numField(t("factor.gpa"), "w_gpa", "0.05")}{numField(t("factor.att"), "w_att", "0.05")}
          {numField(t("factor.lms"), "w_lms", "0.05")}{numField(t("factor.fail"), "w_fail", "0.05")}
        </div>
        <div className="muted-note" style={{ marginTop: -4, marginBottom: 10 }}>{t("cfg.weightSum", { sum: wSum.toFixed(2) })}</div>
        <div className="card-sub" style={{ marginBottom: 6 }}>{t("cfg.thresholds")}</div>
        <div className="field-grid">
          {numField(t("risk.Medium"), "th_medium", "1")}{numField(t("risk.High"), "th_high", "1")}{numField(t("risk.Critical"), "th_critical", "1")}
        </div>
        {isMgr && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <button className="btn btn-primary" disabled={cfgSaving} onClick={saveConfig}>{cfgSaving ? t("loading") : t("cfg.save")}</button>
            <span className="muted-note">{t("cfg.applyNote")}</span>
          </div>
        )}
      </div>
    );
  };

  // Automatic SIS/LMS integration: pull attendance % + LMS activity from an
  // external export (a published Google-Sheet CSV, or pasted CSV) and update
  // each student, then recompute risk. Advisors sync their own advisees only.
  const renderSyncCard = () => (
    <div className="card">
      <div className="card-head">
        <div className="card-title"><Icon name="refresh" /> {t("sync.title")}</div>
        <div className="card-sub">{t("sync.sub")}</div>
      </div>
      <div className="muted-note" style={{ marginBottom: 8 }}>{t("sync.help")}</div>
      <div className="field"><label>{t("sync.url")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="url" placeholder="https://docs.google.com/.../pub?output=csv" value={syncUrl}
            onChange={(e) => setSyncUrl(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={syncing} onClick={() => syncLms("url")} style={{ flex: "none" }}>
            {syncing ? t("loading") : t("sync.pull")}</button>
        </div>
      </div>
      <div className="card-sub" style={{ margin: "8px 0 6px" }}>{t("sync.orPaste")}</div>
      <textarea rows={4} placeholder={"student_code,attendance_rate,lms_activity_score\n22000001,88,72"}
        value={syncCsv} onChange={(e) => setSyncCsv(e.target.value)}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button className="btn" disabled={syncing} onClick={() => syncLms("csv")}>{syncing ? t("loading") : t("sync.applyCsv")}</button>
        {syncResult && <span className="muted-note">{syncResult}</span>}
      </div>
    </div>
  );

  // Evaluation: (1) accuracy of the risk alert vs a ground-truth "weak standing"
  // label (CPA < 2.0), reported as precision/recall/F1; (2) whether logged
  // interventions actually lowered risk (before vs after). Both from loaded data.
  const renderEvaluation = () => {
    const WEAK_CPA = 2.0;
    const scored = students.map((s) => ({ s, a: agg(s) })).filter((r) => r.a.risk && r.a.cpa !== null);
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const { a } of scored) {
      const flagged = a.risk!.score >= riskCfg.th_medium; // alert = Medium+
      const weak = (a.cpa as number) < WEAK_CPA;          // ground truth = poor standing
      if (flagged && weak) tp++; else if (flagged && !weak) fp++;
      else if (!flagged && weak) fn++; else tn++;
    }
    const div = (n: number, d: number) => (d === 0 ? null : n / d);
    const precision = div(tp, tp + fp), recall = div(tp, tp + fn);
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    const accuracy = div(tp + tn, scored.length);
    const pc = (v: number | null) => (v === null ? "—" : (v * 100).toFixed(1) + "%");
    const f3 = (v: number | null) => (v === null ? "—" : v.toFixed(3));

    // Intervention effectiveness: risk score before vs after each intervention.
    const alertStudent = (aid: string) => alerts.find((a) => a.id === aid)?.student_id;
    const histOf = (sid: string) => risks.filter((r) => r.student_id === sid).slice().sort((a, b) => new Date(a.computed_at).getTime() - new Date(b.computed_at).getTime());
    let measured = 0, improved = 0, sumDelta = 0;
    for (const iv of interventions) {
      const sid = alertStudent(iv.alert_id); if (!sid) continue;
      const tms = new Date(iv.created_at).getTime();
      const hist = histOf(sid);
      const before = [...hist].reverse().find((r) => new Date(r.computed_at).getTime() <= tms);
      const after = hist.find((r) => new Date(r.computed_at).getTime() > tms);
      if (!before || !after) continue;
      measured++; const d = after.score - before.score; sumDelta += d; if (d < 0) improved++;
    }
    const improvedRate = measured ? (improved / measured) * 100 : null;
    const avgDelta = measured ? sumDelta / measured : null;

    return (
      <>
        <div className="page-head">
          <div><div className="page-title">{t("eval.title")}</div><div className="page-sub">{t("eval.sub")}</div></div>
          <button className="btn btn-primary" onClick={recomputeAll}><Icon name="refresh" size={16} /> {t("btn.recalc")}</button>
        </div>

        {renderConfigCard()}
        {renderSyncCard()}

        <div className="card">
          <div className="card-head">
            <div className="card-title"><Icon name="target" /> {t("eval.accuracyTitle")}</div>
            <div className="card-sub">{t("eval.groundTruth")} · {t("eval.scoredN", { n: scored.length })}</div>
          </div>
          <div className="kpi-grid">
            <div className="kpi accent"><div className="kpi-label">{t("eval.f1")}</div><div className="kpi-value">{f3(f1)}</div></div>
            <div className="kpi"><div className="kpi-label">{t("eval.precision")}</div><div className="kpi-value">{pc(precision)}</div></div>
            <div className="kpi"><div className="kpi-label">{t("eval.recall")}</div><div className="kpi-value">{pc(recall)}</div></div>
            <div className="kpi"><div className="kpi-label">{t("eval.accuracy")}</div><div className="kpi-value">{pc(accuracy)}</div></div>
          </div>
          <div className="divider" />
          <div className="card-sub" style={{ marginBottom: 8 }}>{t("eval.confusion")}</div>
          <table>
            <thead><tr><th></th><th className="text-right">{t("eval.actualWeak")}</th><th className="text-right">{t("eval.actualOk")}</th></tr></thead>
            <tbody>
              <tr><td><b>{t("eval.predAtRisk")}</b></td><td className="text-right mono"><span className="badge badge-Low">TP {tp}</span></td><td className="text-right mono"><span className="badge badge-Medium">FP {fp}</span></td></tr>
              <tr><td><b>{t("eval.predSafe")}</b></td><td className="text-right mono"><span className="badge badge-Critical">FN {fn}</span></td><td className="text-right mono"><span className="badge badge-Low">TN {tn}</span></td></tr>
            </tbody>
          </table>
          <div className="muted-note" style={{ marginTop: 10 }}>{t("eval.accNote")}</div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title"><Icon name="activity" /> {t("eval.ivTitle")}</div></div>
          {measured ? (
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">{t("eval.ivMeasured")}</div><div className="kpi-value">{measured}</div></div>
              <div className="kpi"><div className="kpi-label">{t("eval.ivImproved")}</div><div className="kpi-value tone-Low">{improvedRate === null ? "—" : improvedRate.toFixed(0) + "%"}</div></div>
              <div className="kpi"><div className="kpi-label">{t("eval.ivAvgDelta")}</div><div className="kpi-value">{avgDelta === null ? "—" : (avgDelta > 0 ? "+" : "") + avgDelta.toFixed(1)}</div></div>
            </div>
          ) : (
            <div className="empty"><Icon name="activity" size={26} /><div>{t("eval.ivNoData")}</div></div>
          )}
        </div>
      </>
    );
  };

  const renderDashboard = () => {
    const rows = students.map((s) => ({ s, a: agg(s) }));
    const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0, Unscored: 0 };
    rows.forEach((r) => (counts[r.a.risk ? r.a.risk.risk_level : "Unscored"]++));
    const openAlerts = alerts.filter((a) => a.status === "Open").length;
    const cpaVals = rows.map((r) => r.a.cpa).filter((v): v is number => v !== null);
    const avgCpa = cpaVals.length ? cpaVals.reduce((x, y) => x + y, 0) / cpaVals.length : null;
    const topRisk = rows.filter((r) => r.a.risk).sort((x, y) => y.a.risk!.score - x.a.risk!.score).slice(0, 8);

    // --- evaluation KPIs (from the PDF rubric) ---
    const resolved = alerts.filter((a) => a.status === "Resolved" && a.resolved_at);
    const avgHandleDays = resolved.length
      ? resolved.reduce((s, a) => s + (new Date(a.resolved_at as string).getTime() - new Date(a.created_at).getTime()), 0) / resolved.length / 86400000
      : null;
    const ivTotal = interventions.length;
    const ivCompleteRate = ivTotal ? (interventions.filter((iv) => iv.status === "Completed").length / ivTotal) * 100 : null;
    const resolvedRate = alerts.length ? (alerts.filter((a) => a.status === "Resolved").length / alerts.length) * 100 : null;
    const highIds = rows.filter((r) => r.a.risk && (r.a.risk.risk_level === "High" || r.a.risk.risk_level === "Critical")).map((r) => r.s.id);
    const followed = highIds.filter((sid) => {
      const aIds = alerts.filter((a) => a.student_id === sid).map((a) => a.id);
      return interventions.some((iv) => aIds.includes(iv.alert_id));
    }).length;
    const followupRate = highIds.length ? (followed / highIds.length) * 100 : null;
    const pct = (v: number | null) => (v === null ? "—" : v.toFixed(0) + "%");
    const predictedCount = rows.filter((r) => predOf(r.s, r.a).predicted).length;

    // --- 14-day risk trend (count of Medium+ snapshots per day) ---
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const trend: { label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today0); d.setDate(d.getDate() - i);
      const start = d.getTime(), end = start + 86400000;
      const count = risks.filter((r) => {
        const ts = new Date(r.computed_at).getTime();
        return ts >= start && ts < end && (r.risk_level === "Medium" || r.risk_level === "High" || r.risk_level === "Critical");
      }).length;
      trend.push({ label: d.getDate() + "/" + (d.getMonth() + 1), count });
    }
    const trendMax = Math.max(1, ...trend.map((b) => b.count));
    return (
      <>
        <div className="page-head">
          <div><div className="page-title">{t("adv.dashTitle")}</div><div className="page-sub">{t("adv.dashSub")}</div></div>
          <button className="btn btn-primary" onClick={recomputeAll}><Icon name="refresh" size={16} /> {t("btn.recalc")}</button>
        </div>
        <div className="kpi-grid">
          <div className="kpi accent"><div className="kpi-label">{t("kpi.totalStudents")}</div><div className="kpi-value">{students.length}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.openAlerts")}</div><div className="kpi-value tone-Critical">{openAlerts}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.highCrit")}</div><div className="kpi-value tone-High">{counts.High + counts.Critical}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.avgCpa")}</div><div className="kpi-value">{avgCpa === null ? "—" : avgCpa.toFixed(2)}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.predicted")}</div><div className="kpi-value tone-High">{predictedCount}</div></div>
        </div>
        <div className="page-sub" style={{ fontWeight: 700, color: "var(--text)", margin: "2px 0 10px" }}>{t("adv.evaluation")}</div>
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">{t("kpi.avgHandle")}</div><div className="kpi-value">{avgHandleDays === null ? "—" : avgHandleDays.toFixed(1)}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.ivComplete")}</div><div className="kpi-value">{pct(ivCompleteRate)}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.followup")}</div><div className="kpi-value">{pct(followupRate)}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.resolvedRate")}</div><div className="kpi-value">{pct(resolvedRate)}</div></div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title"><Icon name="alert" /> {t("card.topRisk")}</div><a className="back-link" onClick={() => setView("students")}>{t("link.seeAll")}</a></div>
          {RiskTable(topRisk)}
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title"><Icon name="alert" /> {t("card.recentAlerts")}</div></div>
          {alerts.length === 0 ? (
            <div className="empty"><Icon name="bell" size={30} />{t("empty.noAlerts")}</div>
          ) : (
            <table>
              <thead><tr><th>{t("th.student")}</th><th>{t("th.level")}</th><th className="text-right">{t("th.score")}</th><th>{t("th.status")}</th><th>{t("th.time")}</th></tr></thead>
              <tbody>
                {alerts.slice(0, 8).map((al) => { const s = studentById(al.student_id); return (
                  <tr key={al.id} className="row-link" onClick={() => openStudent(al.student_id)}>
                    <td>{s ? s.full_name : "—"}</td><td><RiskBadge level={al.risk_level} /></td>
                    <td className="text-right mono">{al.score_at_alert}</td><td><span className={"pill " + al.status}>{statusLabel(al.status)}</span></td>
                    <td className="text-muted">{fmtDate(al.created_at, locale, true)}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title"><Icon name="chart" /> {t("card.trend")}</div></div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {trend.map((b, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={String(b.count)}>
                <div style={{ width: "100%", height: (b.count / trendMax) * 84 + "px", minHeight: b.count ? 4 : 0, background: "var(--primary)", borderRadius: "4px 4px 0 0" }} />
                <div style={{ fontSize: 9, color: "var(--faint)" }}>{b.label}</div>
              </div>
            ))}
          </div>
          <div className="muted-note" style={{ marginTop: 8 }}>{t("trend.hint")}</div>
        </div>
      </>
    );
  };

  // Export a risk report (CSV) for the current student list — for staff meetings.
  function exportReport(list: { s: Profile; a: Agg }[]) {
    if (!list.length) return;
    const esc = (v: unknown) => { const x = String(v ?? ""); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const header = "student_code,full_name,program,cohort,cpa,credits,failed,risk_score,risk_level,prediction,open_alert,attendance_rate,lms_activity";
    const lines = list.map(({ s, a }) => {
      const pred = predOf(s, a);
      return [
        s.student_code || "", s.full_name || "", s.program || "", s.cohort || "",
        a.cpa === null ? "" : a.cpa.toFixed(2), a.credits, a.failed,
        a.risk ? a.risk.score : "", a.risk ? riskLabel(t, a.risk.risk_level) : t("risk.Unscored"),
        t("predict.band." + pred.band), openAlertFor(s.id) ? "1" : "", s.attendance_rate, s.lms_activity_score,
      ].map(esc).join(",");
    });
    const csv = "﻿" + [header, ...lines].join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bao_cao_rui_ro_" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const renderStudents = () => {
    const levels = ["", "Critical", "High", "Medium", "Low"];
    let rows = students.map((s) => ({ s, a: agg(s) }));
    if (q) { const qq = q.toLowerCase(); rows = rows.filter(({ s }) => (s.full_name || "").toLowerCase().includes(qq) || (s.student_code || "").toLowerCase().includes(qq)); }
    if (level) rows = rows.filter(({ a }) => (a.risk ? a.risk.risk_level : "Unscored") === level);
    rows.sort((x, y) => (y.a.risk ? y.a.risk.score : -1) - (x.a.risk ? x.a.risk.score : -1));
    return (
      <>
        <div className="page-head">
          <div><div className="page-title">{t("adv.studentsTitle")}</div><div className="page-sub">{t("adv.studentsSub", { n: students.length })}</div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="btn"><Icon name="inbox" size={16} /> {t("adv.import")}
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
            </label>
            <button className="btn" onClick={downloadTemplate}>{t("adv.importTemplate")}</button>
            <label className="btn"><Icon name="chart" size={16} /> {t("adv.importGrades")}
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) prepareGrades(f); e.target.value = ""; }} />
            </label>
            <button className="btn" onClick={downloadGradeTemplate}>{t("adv.gradeTemplate")}</button>
            <button className="btn" onClick={() => exportReport(rows)}><Icon name="notes" size={16} /> {t("adv.exportReport")}</button>
            <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}><Icon name="plus" size={16} /> {t("adv.addStudent")}</button>
          </div>
        </div>
        {showAdd && <AddStudentForm onAdd={addStudent} />}
        {gradePreview && (
          <div className="card">
            <div className="card-head">
              <div className="card-title"><Icon name="chart" /> {t("gimp.title")}</div>
              <div className="card-sub">{gradePreview.fileName}</div>
            </div>
            <div className="toolbar" style={{ marginBottom: 4 }}>
              <span className="pill Resolved">{t("gimp.valid", { n: gradePreview.rows.length })}</span>
              {gradePreview.errors.length > 0 && <span className="pill Open">{t("gimp.errors", { n: gradePreview.errors.length })}</span>}
            </div>
            {gradePreview.errors.length > 0 && (
              <div className="muted-note" style={{ maxHeight: 150, overflowY: "auto", background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px", margin: "6px 0 10px" }}>
                {gradePreview.errors.slice(0, 25).map((e, i) => <div key={i}>{t("gimp.line")} {e.line}: {e.reason}</div>)}
                {gradePreview.errors.length > 25 && <div>… +{gradePreview.errors.length - 25}</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={importing || gradePreview.rows.length === 0} onClick={commitGrades}>
                {importing ? t("loading") : t("gimp.confirm", { n: gradePreview.rows.length })}
              </button>
              <button className="btn" disabled={importing} onClick={() => setGradePreview(null)}>{t("gimp.cancel")}</button>
              {gradePreview.errors.length > 0 && <button className="btn" onClick={downloadGradeErrors}>{t("gimp.downloadErrors")}</button>}
            </div>
          </div>
        )}
        <div className="toolbar">
          <div className="search"><Icon name="search" size={16} /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ph.search")} /></div>
          <div className="chips">
            {levels.map((lv) => <span key={lv} className={"chip" + (level === lv ? " active" : "")} onClick={() => setLevel(lv)}>{lv === "" ? t("status.All") : t("risk." + lv)}</span>)}
          </div>
        </div>
        <div className="card">{RiskTable(rows)}</div>
      </>
    );
  };

  async function setApptStatus(id: string, status: Appointment["status"]) {
    if (!sb) return;
    const { error } = await sb.from("appointments").update({ status }).eq("id", id);
    if (error) { toast(t("appt.err"), "error"); return; }
    setApptTick((n) => n + 1);
    toast(t("appt.updated"), "success");
  }

  const renderStudentDetail = () => {
    const student = selectedId ? studentById(selectedId) : null;
    if (!student) return <div className="empty">{t("adv.notFound")}</div>;
    const a = agg(student);
    const semesters = bySemester(a.courses);
    const risk = a.risk;
    const open = openAlertFor(student.id);
    const studentAlerts = alerts.filter((al) => al.student_id === student.id);
    const latestSem = semesters.find((s) => s.gpa !== null);
    const attachAlert = open || studentAlerts[0];
    const detailIvList = interventions.filter((iv) => studentAlerts.some((al) => al.id === iv.alert_id));
    const pred = predOf(student, a);
    return (
      <>
        <a className="back-link" onClick={() => setView("students")}>{t("adv.back")}</a>
        <div className="page-head" style={{ marginTop: 10 }}>
          <div><div className="page-title">{student.full_name}</div>
            <div className="page-sub">{[student.student_code, student.program, student.cohort].filter(Boolean).join(" · ")}</div></div>
          <div style={{ textAlign: "right" }}><RiskBadge level={risk ? risk.risk_level : "Unscored"} />
            <div className="page-sub">{t("adv.riskScoreLabel")} <b>{risk ? risk.score : "—"}</b></div></div>
        </div>
        {open && (
          <div className={"alert-banner risk-" + open.risk_level}>
            <div className="ab-ic"><Icon name="alert" size={20} /></div>
            <div>
              <div className="ab-title">{t("banner.openTitle", { level: riskLabel(t, open.risk_level) })}</div>
              <div>{t("banner.openBody", { time: fmtDate(open.created_at, locale, true) })}</div>
            </div>
          </div>
        )}
        <div className="kpi-grid">
          <div className="kpi accent"><div className="kpi-label">CPA</div><div className="kpi-value">{a.cpa === null ? "—" : a.cpa.toFixed(2)}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.gpaLatestShort")}</div><div className="kpi-value">{latestSem ? <>{latestSem.gpa!.toFixed(2)} <small>{latestSem.semester}</small></> : "—"}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.creditsShort")}</div><div className="kpi-value">{a.credits}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.failedF")}</div><div className={"kpi-value" + (a.failed ? " tone-Critical" : "")}>{a.failed}</div></div>
        </div>
        <div className="grid-2">
          <div>
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="edit" /> {t("card.gradeEntry")}</div><div className="card-sub">{t("card.gradeEntrySub")}</div></div>
              {semesters.length === 0 ? (
                <div className="empty" style={{ padding: 18 }}><Icon name="edit" size={28} />{t("empty.noCourses")}</div>
              ) : (
                semesters.map((s) => (
                  <div key={s.semester} style={{ marginBottom: 16 }}>
                    <div className="spread" style={{ marginBottom: 6 }}>
                      <b>{t("sem.label", { sem: s.semester })}</b>
                      <span className="pill">GPA: {s.gpa === null ? "—" : s.gpa.toFixed(2)} · {s.credits} {t("th.cr")}</span>
                    </div>
                    <table>
                      <thead><tr><th>{t("th.courseShort")}</th><th>{t("th.cr")}</th><th>{t("th.reg")}</th><th>{t("th.mid")}</th><th>{t("th.final")}</th><th>{t("th.total")}</th><th>{t("th.gradeShort")}</th><th></th></tr></thead>
                      <tbody>{s.courses.map((c) => <CourseRow key={c.id} course={c} onSave={saveCourse} />)}</tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="plus" /> {t("card.addCourse")}</div></div>
              <AddCourseForm onAdd={addCourse} />
            </div>
          </div>
          <div>
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="user" /> {t("adv.studentInfo")}</div></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="spread"><span className="text-muted">{t("form.studentCode")}</span><b className="mono">{student.student_code || "—"}</b></div>
                <div className="spread"><span className="text-muted">{t("form.program")}</span><b>{student.program || "—"}</b></div>
                <div className="spread"><span className="text-muted">{t("form.cohort")}</span><b>{student.cohort || "—"}</b></div>
                <div className="spread"><span className="text-muted">{t("adv.contactEmail")}</span>{student.email ? <a className="back-link" href={"mailto:" + student.email}>{student.email}</a> : <span className="text-muted">—</span>}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="target" /> {t("card.riskFactors")}</div></div>
              <FactorList risk={risk} updated={risk ? fmtDate(risk.computed_at, locale, true) : ""} />
            </div>
            <div className="card">
              <div className="card-head">
                <div className="card-title"><Icon name="activity" /> {t("predict.title")}</div>
                <span className={"badge badge-" + bandToRisk(pred.band)}>{t("predict.band." + pred.band)}</span>
              </div>
              {pred.band === "unscored" ? (
                <div className="muted-note">{t("factor.noData")}</div>
              ) : (
                <>
                  {pred.band !== "alarm" && <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{t("predict.likelihood", { n: pred.likelihood })}</div>}
                  {pred.etaDays !== null && <div className="muted-note" style={{ marginBottom: 6 }}>{t("predict.eta", { n: pred.etaDays })}</div>}
                  {pred.reasons.length > 0 && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--muted)" }}>
                      {pred.reasons.map((r, i) => <li key={i}>{t("predict.reason." + r.key, r.params)}</li>)}
                    </ul>
                  )}
                  {pred.predicted && <div className="muted-note" style={{ marginTop: 10 }}>{t("predict.suggest")}</div>}
                  {pred.band === "safe" && <div className="muted-note" style={{ marginTop: 10 }}>{t("predict.stable")}</div>}
                </>
              )}
            </div>
            <IndicatorsBox student={student} onSave={saveIndicators} />
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="alert" /> {t("card.alert")}</div></div>
              {studentAlerts.length === 0 ? (
                <div className="muted-note">{t("alerts.none")}</div>
              ) : (
                studentAlerts.map((al) => (
                  <div key={al.id} className="spread" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div><RiskBadge level={al.risk_level} /> <span className="muted-note">· {fmtDate(al.created_at, locale)}</span></div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {al.advisor_id === me!.id ? <span className="muted-note">{t("adv.youHandle")}</span> : <button className="btn btn-sm" onClick={() => assignAlert(al.id)}>{t("btn.take")}</button>}
                      <select value={al.status} onChange={(e) => setAlertStatus(al.id, e.target.value)} style={{ width: "auto", padding: "6px 8px", margin: 0 }}>
                        {["Open", "Acknowledged", "Resolved", "Dismissed"].map((st) => <option key={st} value={st}>{statusLabel(st)}</option>)}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="notes" /> {t("card.intervention")}</div></div>
              {detailIvList.length > 0 && (
                <div className="timeline" style={{ marginBottom: 6 }}>
                  {detailIvList.map((iv) => (
                    <div className="timeline-item" key={iv.id}>
                      <div className="timeline-meta">{fmtDate(iv.created_at, locale, true)} · <span className="pill">{ivStatusLabel(iv.status)}</span></div>
                      <div><b>{ivTypeLabel(iv.action_type)}</b>{iv.notes ? " — " + iv.notes : ""}</div>
                    </div>
                  ))}
                </div>
              )}
              {attachAlert ? <InterventionForm onAdd={(type, notes, status) => addIntervention(attachAlert, type, notes, status)} /> : <div className="muted-note">{t("iv.needAlert")}</div>}
            </div>
            <SendNotifBox onSend={sendNotification} />
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="message" /> {t("card.chatStudent")}</div></div>
              <div className="chat">
                {detailMsgs.length === 0 ? (
                  <div className="empty" style={{ padding: 16 }}><Icon name="message" size={26} />{t("empty.noChat")}</div>
                ) : (
                  detailMsgs.map((mm) => {
                    const mine = mm.sender_role !== "student";
                    return <div key={mm.id} className={"msg " + (mine ? "msg-me" : "msg-them")}>{mm.body}<div className="mm">{(mine ? t("you") : student.full_name) + " · " + fmtDate(mm.created_at, locale, true)}</div></div>;
                  })
                )}
              </div>
              <form className="msg-input" onSubmit={sendDetailReply}>
                <input type="text" value={detailReply} onChange={(e) => setDetailReply(e.target.value)} placeholder={t("chat.phAdvisor")} autoComplete="off" />
                <button className="btn btn-primary" type="submit">{t("btn.send")}</button>
              </form>
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title"><Icon name="notes" /> {t("appt.title")}</div></div>
              {detailAppts.length === 0 ? (
                <div className="muted-note">{t("appt.none")}</div>
              ) : (
                detailAppts.map((ap) => (
                  <div key={ap.id} className="spread" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div><b>{fmtDate(ap.starts_at, locale, true)}</b></div>
                      {ap.note && <div className="muted-note" style={{ marginTop: 2 }}>{ap.note}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
                      <span className={"pill " + (ap.status === "confirmed" ? "Resolved" : ap.status === "done" ? "Dismissed" : ap.status === "cancelled" ? "Open" : "Acknowledged")}>{t("appt.st." + ap.status)}</span>
                      {ap.status === "requested" && <button className="btn btn-sm btn-primary" onClick={() => setApptStatus(ap.id, "confirmed")}>{t("appt.confirm")}</button>}
                      {ap.status === "confirmed" && <button className="btn btn-sm" onClick={() => setApptStatus(ap.id, "done")}>{t("appt.done")}</button>}
                      {(ap.status === "requested" || ap.status === "confirmed") && <button className="btn btn-sm" onClick={() => setApptStatus(ap.id, "cancelled")}>{t("appt.cancel")}</button>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderAlerts = () => {
    const opts = ["Open", "Acknowledged", "Resolved", "Dismissed", "All"];
    const list = alerts.filter((a) => alertStatusFilter === "All" || a.status === alertStatusFilter);
    return (
      <>
        <div className="page-head"><div><div className="page-title">{t("adv.alertsTitle")}</div><div className="page-sub">{t("adv.alertsSub")}</div></div></div>
        <div className="toolbar"><div className="chips">
          {opts.map((o) => <span key={o} className={"chip" + (alertStatusFilter === o ? " active" : "")} onClick={() => setAlertStatusFilter(o)}>{o === "All" ? t("status.All") : statusLabel(o)}</span>)}
        </div></div>
        <div className="card">
          {list.length === 0 ? (
            <div className="empty"><Icon name="bell" size={30} />{t("empty.noAlertsStatus")}</div>
          ) : (
            <table>
              <thead><tr><th>{t("th.student")}</th><th>{t("th.level")}</th><th className="text-right">{t("th.score")}</th><th>{t("th.status")}</th><th>{t("th.handler")}</th><th>{t("th.time")}</th></tr></thead>
              <tbody>
                {list.map((al) => { const s = studentById(al.student_id); const adv = al.advisor_id === me!.id ? t("you") : (al.advisor_id ? t("adv.otherAdvisor") : "—"); return (
                  <tr key={al.id} className="row-link" onClick={() => openStudent(al.student_id)}>
                    <td><b>{s ? s.full_name : "—"}</b><div className="muted-note">{s ? s.student_code || "" : ""}</div></td>
                    <td><RiskBadge level={al.risk_level} /></td><td className="text-right mono">{al.score_at_alert}</td>
                    <td><span className={"pill " + al.status}>{statusLabel(al.status)}</span></td><td>{adv}</td>
                    <td className="text-muted">{fmtDate(al.created_at, locale, true)}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderInterventions = () => {
    const alertMap: Record<string, Alert> = {};
    alerts.forEach((a) => (alertMap[a.id] = a));
    const list = interventions.filter((iv) => alertMap[iv.alert_id]); // scoped to this advisor's students
    return (
      <>
        <div className="page-head"><div><div className="page-title">{t("adv.ivTitle")}</div><div className="page-sub">{t("adv.ivSub", { n: list.length })}</div></div></div>
        <div className="card">
          {list.length === 0 ? (
            <div className="empty"><Icon name="notes" size={30} />{t("empty.noIv")}</div>
          ) : (
            <table>
              <thead><tr><th>{t("th.time")}</th><th>{t("th.student")}</th><th>{t("th.type")}</th><th>{t("th.notes")}</th><th>{t("th.status")}</th></tr></thead>
              <tbody>
                {list.map((iv) => { const al = alertMap[iv.alert_id]; const s = al ? studentById(al.student_id) : null; return (
                  <tr key={iv.id} className={s ? "row-link" : ""} onClick={() => s && openStudent(s.id)}>
                    <td className="text-muted">{fmtDate(iv.created_at, locale, true)}</td><td>{s ? s.full_name : "—"}</td>
                    <td>{ivTypeLabel(iv.action_type)}</td><td className="text-muted">{iv.notes || "—"}</td>
                    <td><span className="pill">{ivStatusLabel(iv.status)}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  const renderMessages = () => {
    const visibleIds = new Set(students.map((s) => s.id));
    const threads: Record<string, Message[]> = {};
    allMsgs.filter((m) => visibleIds.has(m.student_id)).forEach((m) => (threads[m.student_id] = threads[m.student_id] || []).push(m));
    const threadIds = Object.keys(threads).sort((a, b) => {
      const la = threads[a][threads[a].length - 1].created_at, lb = threads[b][threads[b].length - 1].created_at;
      return la < lb ? 1 : -1;
    });
    const activeThread = selectedThread && threads[selectedThread] ? selectedThread : threadIds[0] || null;
    const cur = activeThread ? threads[activeThread] : [];
    const curStudent = activeThread ? studentById(activeThread) : null;
    return (
      <>
        <div className="page-head"><div><div className="page-title">{t("adv.msgTitle")}</div><div className="page-sub">{t("adv.msgSub")}</div></div></div>
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><div className="card-title">{t("adv.conversations")}</div></div>
            {threadIds.length === 0 ? (
              <div className="empty"><Icon name="message" size={30} />{t("empty.noMessages")}</div>
            ) : (
              threadIds.map((sid) => {
                const s = studentById(sid); const msgs = threads[sid]; const last = msgs[msgs.length - 1];
                const unread = msgs.filter((m) => m.sender_role === "student" && !m.is_read).length;
                return (
                  <div key={sid} className={"notif" + (sid === activeThread ? " unread" : "")} style={{ cursor: "pointer" }} onClick={() => setSelectedThread(sid)}>
                    <div className="ni">{s ? initials(s.full_name) : "?"}</div>
                    <div style={{ flex: 1 }}>
                      <div className="nt">{s ? s.full_name : t("role.student")} {unread ? <span className="pill Open" style={{ padding: "0 6px" }}>{unread}</span> : null}</div>
                      <div className="nb" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{last.body}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="card">
            <div className="card-head"><div className="card-title">{curStudent ? curStudent.full_name : t("adv.conversation")}</div></div>
            {activeThread ? (
              <>
                <div className="chat">
                  {cur.map((m) => {
                    const mine = m.sender_role !== "student";
                    return <div key={m.id} className={"msg " + (mine ? "msg-me" : "msg-them")}>{m.body}<div className="mm">{(mine ? t("you") : (curStudent ? curStudent.full_name : t("role.student"))) + " · " + fmtDate(m.created_at, locale, true)}</div></div>;
                  })}
                </div>
                <form className="msg-input" onSubmit={sendReply}>
                  <input type="text" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("chat.phAdvisor")} autoComplete="off" />
                  <button className="btn btn-primary" type="submit">{t("btn.send")}</button>
                </form>
              </>
            ) : <div className="empty">{t("adv.pickThread")}</div>}
          </div>
        </div>
      </>
    );
  };

  if (!me || !ready) return <div className="empty" style={{ paddingTop: 80 }}>{t("loading")}</div>;

  const openAlertsCount = alerts.filter((a) => a.status === "Open").length;
  const navItems: [View, string, string][] = [
    ["dashboard", "dashboard", "nav.dashboard"],
    ["students", "students", "nav.students"],
    ["gradebook", "edit", "nav.gradebook"],
    ["alerts", "alert", "nav.alerts"],
    ["interventions", "notes", "nav.interventions"],
    ["messages", "message", "nav.messages"],
    ["evaluation", "target", "nav.evaluation"],
  ];
  const activeNav = view === "student" ? "students" : view;

  return (
    <>
      <div className="topbar">
        <BrandLogo onClick={() => setView("dashboard")} title={t("brand.home")} />
        <div className="topbar-spacer" />
        <LangSwitch />
        <div className="topbar-user">
          <div className="avatar">{initials(me.full_name)}</div>
          <div className="who"><b>{me.full_name || t("role.advisor")}</b><small>{(me.role === "manager" ? t("role.manager") : t("meta.advisor")) + (me.role === "advisor" && me.program ? " · " + me.program : "")}</small></div>
          <button className="btn btn-sm" onClick={async () => { await sb?.auth.signOut(); router.replace("/"); }}>{t("btn.logout")}</button>
        </div>
      </div>

      <div className="app-shell">
        <aside className="sidebar">
          <div className="nav-label">{t("nav.section")}</div>
          <nav className="nav">
            {navItems.map(([v, ic, key]) => (
              <a key={v} className={activeNav === v ? "active" : ""} onClick={() => setView(v)}>
                <Icon name={ic} size={18} /><span>{t(key)}</span>
                {v === "alerts" && openAlertsCount > 0 && <span className="count show">{openAlertsCount}</span>}
                {v === "messages" && msgUnread > 0 && <span className="count show">{msgUnread}</span>}
              </a>
            ))}
          </nav>
        </aside>
        <main className="main">
          {view === "dashboard" && renderDashboard()}
          {view === "students" && renderStudents()}
          {view === "gradebook" && renderGradebook()}
          {view === "student" && renderStudentDetail()}
          {view === "alerts" && renderAlerts()}
          {view === "interventions" && renderInterventions()}
          {view === "messages" && renderMessages()}
          {view === "evaluation" && renderEvaluation()}
        </main>
      </div>
    </>
  );
}
