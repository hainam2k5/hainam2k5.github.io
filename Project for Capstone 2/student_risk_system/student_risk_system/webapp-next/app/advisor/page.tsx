"use client";
import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { supabase, configured, getMyProfile, homeFor } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";
import { Icon } from "@/lib/icons";
import { LangSwitch, RiskBadge, RiskBar } from "@/components/common";
import { gpaOf, bySemester, failedCount, computeCourse, numOr } from "@/lib/gpa";
import { compute as computeRisk, alertWorthy } from "@/lib/risk";
import { fmtDate, initials, riskLabel } from "@/lib/format";
import {
  CourseRow, AddCourseForm, AddStudentForm, IndicatorsBox, SendNotifBox, InterventionForm, FactorList,
  IV_TYPES, NewCourse, NewStudent,
} from "@/components/advisor-parts";
import type { Profile, Course, RiskScore, Alert, Intervention, Message } from "@/lib/types";

type View = "dashboard" | "students" | "student" | "alerts" | "interventions" | "messages";
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

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [detailMsgs, setDetailMsgs] = useState<Message[]>([]);
  const [detailReply, setDetailReply] = useState("");
  const [allMsgs, setAllMsgs] = useState<Message[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [msgTick, setMsgTick] = useState(0);

  // ------------------------------------------------------------ core data
  async function fetchCore(): Promise<Core> {
    // Advisors only manage students assigned to them (their major); managers see all.
    const scope = !!me && me.role === "advisor";
    let sQuery = sb!.from("profiles").select("*").eq("role", "student");
    if (scope) sQuery = sQuery.eq("advisor_id", me!.id);
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

  async function recomputeStudent(student: Profile, core: Core): Promise<boolean> {
    const cs = core.courses.filter((c) => c.student_id === student.id);
    const g = gpaOf(cs);
    const failed = failedCount(cs);
    if (g.gpa === null && failed === 0) return false;
    const result = computeRisk({ cpa: g.gpa, attendance_rate: student.attendance_rate, lms_activity_score: student.lms_activity_score, failed_count: failed });
    await sb!.from("risk_scores").insert({
      student_id: student.id, score: result.score, risk_level: result.level,
      factor_gpa: result.factor_gpa, factor_attendance: result.factor_attendance,
      factor_lms: result.factor_lms, factor_failed_credits: result.factor_failed_credits,
    });
    const openAlert = core.alerts.find((a) => a.student_id === student.id && a.status === "Open");
    if (alertWorthy(result.level) && !openAlert) {
      await sb!.from("alerts").insert({
        student_id: student.id, advisor_id: student.advisor_id || me!.id,
        risk_level: result.level, score_at_alert: result.score, status: "Open",
      });
      await sb!.from("notifications").insert({
        student_id: student.id, sender_id: me!.id, type: "alert",
        title: t("alert.autoTitle"), body: t("alert.autoBody", { level: riskLabel(t, result.level) }),
      });
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
      const core = await fetchCore();
      if (!active) return;
      applyCore(core);
      let scored = false;
      for (const s of core.students) {
        if (!core.risks.some((r) => r.student_id === s.id)) {
          const did = await recomputeStudent(s, core);
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

  const openStudent = (id: string) => { setSelectedId(id); setView("student"); };

  // ------------------------------------------------------------ mutations
  async function saveCourse(courseId: string, r: string, m: string, f: string) {
    if (!sb || !selectedId) return;
    const course = (coursesBy[selectedId] || []).find((c) => c.id === courseId);
    if (!course) return;
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

  async function addStudent(s: NewStudent) {
    if (!sb || !me) return;
    if (!s.name.trim()) return toast(t("toast.enterName"), "error");
    const { error } = await sb.from("profiles").insert({
      role: "student", full_name: s.name.trim(),
      student_code: s.code.trim() || null, email: s.email.trim() || null,
      program: s.program.trim(), cohort: s.cohort.trim(), advisor_id: me.id,
      attendance_rate: numOr(s.att, 100), lms_activity_score: numOr(s.lms, 100),
    });
    if (error) return toast(error.message, "error");
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
    let ok = 0, fail = 0;
    for (const row of rows) {
      const code = (row.student_code || row.code || "").trim();
      const name = (row.full_name || row.name || "").trim();
      if (!name && !code) continue;
      const { error } = await sb.from("profiles").insert({
        role: "student", full_name: name || code, student_code: code || null,
        email: (row.email || "").trim() || null, program: (row.program || "").trim(), cohort: (row.cohort || "").trim(),
        advisor_id: me.id, attendance_rate: numOr(row.attendance_rate, 100), lms_activity_score: numOr(row.lms_activity_score, 100),
      });
      if (error) fail++; else ok++;
    }
    toast(t("adv.importDone", { n: ok }) + (fail ? " · " + t("adv.importFail", { n: fail }) : ""), fail ? "error" : "success");
    await loadCore();
  }
  function downloadTemplate() {
    const csv = "student_code,full_name,email,program,cohort,attendance_rate,lms_activity_score\nSV010,Nguyen Van A,sv010@truong.edu.vn,He thong thong tin,K69,90,80\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "students_template.csv"; a.click();
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
          <th>{t("th.student")}</th><th>{t("th.studentId")}</th><th className="text-right">CPA</th><th>{t("th.riskScore")}</th><th>{t("th.level")}</th><th>{t("th.alert")}</th>
        </tr></thead>
        <tbody>
          {rows.map(({ s, a }) => (
            <tr key={s.id} className="row-link" onClick={() => openStudent(s.id)}>
              <td><b>{s.full_name}</b><div className="muted-note">{s.program || ""}</div></td>
              <td className="mono">{s.student_code || "—"}</td>
              <td className="text-right mono strong">{a.cpa === null ? "—" : a.cpa.toFixed(2)}</td>
              <td><div className="score-cell"><span className="score-num">{a.risk ? a.risk.score : "—"}</span><RiskBar risk={a.risk} /></div></td>
              <td><RiskBadge level={a.risk ? a.risk.risk_level : "Unscored"} /></td>
              <td>{openAlertFor(s.id) ? <span className="pill Open">{t("status.Open")}</span> : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
            <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}><Icon name="plus" size={16} /> {t("adv.addStudent")}</button>
          </div>
        </div>
        {showAdd && <AddStudentForm onAdd={addStudent} />}
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
    ["alerts", "alert", "nav.alerts"],
    ["interventions", "notes", "nav.interventions"],
    ["messages", "message", "nav.messages"],
  ];
  const activeNav = view === "student" ? "students" : view;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-logo">SR</div>
          <div><div className="brand-name">{t("brand.name")}</div><div className="brand-sub">{t("brand.advisorSub")}</div></div>
        </div>
        <div className="topbar-spacer" />
        <LangSwitch />
        <div className="topbar-user">
          <div className="avatar">{initials(me.full_name)}</div>
          <div className="who"><b>{me.full_name || t("role.advisor")}</b><small>{me.role === "manager" ? t("role.manager") : t("meta.advisor")}</small></div>
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
          {view === "student" && renderStudentDetail()}
          {view === "alerts" && renderAlerts()}
          {view === "interventions" && renderInterventions()}
          {view === "messages" && renderMessages()}
        </main>
      </div>
    </>
  );
}
