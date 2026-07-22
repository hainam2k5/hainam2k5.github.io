"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Icon } from "@/lib/icons";
import { computeCourse } from "@/lib/gpa";
import type { Profile, Section, Course, Attendance } from "@/lib/types";

type Row = { c: Course; s: Profile };

// Unified "Classes" screen: a teacher (or an advisor who also teaches, or a
// manager) picks a class they teach, then switches between two TABS for that
// class — Attendance (per weekly session) and Grades (TX/GK/CK). A class roster
// is the set of `courses` rows whose (code, semester, academic_year) match the
// section. Classes meet once a week, so attendance is taken per session date.
export function ClassesView({ me }: { me: Profile }) {
  const { t, lang } = useI18n();
  const sb = supabase;
  const [tab, setTab] = useState<"attend" | "grades">("attend");
  const [sections, setSections] = useState<Section[]>([]);
  const [selId, setSelId] = useState("");
  const [roster, setRoster] = useState<Row[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [rates, setRates] = useState<Record<string, { pre: number; tot: number }>>({});
  const [gEdits, setGEdits] = useState<Record<string, { sr?: string; sm?: string; sf?: string }>>({});
  const [saving, setSaving] = useState(false);

  const sel = sections.find((s) => s.id === selId) || null;

  async function loadSections() {
    if (!sb) return;
    // Each user manages only the classes they own. An advisor may also teach a
    // few classes (owns those sections); they are not meant to run every class.
    const { data } = await sb.from("sections").select("*").eq("teacher_id", me.id).order("created_at", { ascending: false });
    const list = (data as Section[]) || [];
    setSections(list);
    setSelId((cur) => cur || (list[0]?.id ?? ""));
  }
  useEffect(() => { loadSections(); }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRoster(sec: Section, d: string) {
    if (!sb) return;
    // Fetch only the columns this screen renders (courses has 19, profiles 12).
    const { data: crs } = await sb.from("courses")
      .select("id, student_id, code, semester, academic_year, score_regular, score_midterm, score_final")
      .eq("code", sec.code).eq("semester", sec.semester);
    const courses = ((crs as Course[]) || []).filter((c) => (c.academic_year || "") === (sec.academic_year || ""));
    const ids = [...new Set(courses.map((c) => c.student_id))];
    let profs: Profile[] = [];
    if (ids.length) profs = ((await sb.from("profiles").select("id, full_name, student_code, email").in("id", ids)).data as Profile[]) || [];
    const pmap = new Map(profs.map((p) => [p.id, p]));
    const list: Row[] = courses.map((c) => ({ c, s: pmap.get(c.student_id) as Profile })).filter((r) => r.s);
    list.sort((a, b) => (a.s.full_name || "").localeCompare(b.s.full_name || ""));
    setRoster(list);
    setGEdits({});
    const rows = ((await sb.from("attendance").select("student_id, session_date, present").eq("section_id", sec.id)).data as Attendance[]) || [];
    const r: Record<string, { pre: number; tot: number }> = {};
    for (const a of rows) { const x = r[a.student_id] || { pre: 0, tot: 0 }; x.tot++; if (a.present) x.pre++; r[a.student_id] = x; }
    setRates(r);
    const pres: Record<string, boolean> = {};
    for (const { s } of list) pres[s.id] = true;
    for (const a of rows) if (a.session_date === d) pres[a.student_id] = a.present;
    setPresent(pres);
  }
  useEffect(() => { if (sel) loadRoster(sel, date); }, [selId, date, sections.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAttendance() {
    if (!sb || !sel || !roster.length) return;
    setSaving(true);
    const rows = roster.map(({ s }) => ({ section_id: sel.id, student_id: s.id, session_date: date, present: present[s.id] !== false }));
    const { error } = await sb.from("attendance").upsert(rows, { onConflict: "section_id,student_id,session_date" });
    setSaving(false);
    if (error) return toast(t("cls.attErr"), "error");
    toast(t("cls.attSaved"), "success");
    loadRoster(sel, date);
  }

  const gVal = (c: Course, f: "sr" | "sm" | "sf") => {
    const e = gEdits[c.id];
    if (e && e[f] !== undefined) return e[f] as string;
    const src = f === "sr" ? c.score_regular : f === "sm" ? c.score_midterm : c.score_final;
    return src === null || src === undefined ? "" : String(src);
  };
  const setG = (id: string, f: "sr" | "sm" | "sf", v: string) => setGEdits((p) => ({ ...p, [id]: { ...p[id], [f]: v } }));
  const ok = (v: string) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 10);

  async function saveGrades() {
    if (!sb || !sel || !roster.length) return;
    for (const { c } of roster) if (![gVal(c, "sr"), gVal(c, "sm"), gVal(c, "sf")].every(ok)) return toast(t("cls.gErr"), "error");
    setSaving(true);
    const num = (v: string) => (v === "" ? null : Number(v));
    const now = new Date().toISOString();
    const ups = roster.map(({ c }) => {
      const sr = gVal(c, "sr"), sm = gVal(c, "sm"), sf = gVal(c, "sf");
      const g = computeCourse({ score_regular: sr, score_midterm: sm, score_final: sf, weight_regular: sel.weight_regular, weight_midterm: sel.weight_midterm, weight_final: sel.weight_final });
      return sb!.from("courses").update({
        score_regular: num(sr), score_midterm: num(sm), score_final: num(sf),
        weight_regular: sel.weight_regular, weight_midterm: sel.weight_midterm, weight_final: sel.weight_final,
        total_score: g.total, letter_grade: g.letter, grade_point: g.point, updated_at: now,
      }).eq("id", c.id);
    });
    const res = await Promise.all(ups);
    if (res.filter((r) => r.error).length) { setSaving(false); return toast(t("cls.gErr"), "error"); }
    // Best-effort: notify + email each student their updated grade. Only an
    // advisor/manager may do this (the notify-grade route and notifications RLS
    // both require that role); demo addresses (@sv.demo.edu.vn) are skipped so we
    // don't send to fake inboxes.
    if (me.role === "advisor" || me.role === "manager") {
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const fmt = (v: string) => (v === "" ? "—" : v);
      await Promise.all(roster.map(async ({ c, s }) => {
        const sr = gVal(c, "sr"), sm = gVal(c, "sm"), sf = gVal(c, "sf");
        const g = computeCourse({ score_regular: sr, score_midterm: sm, score_final: sf, weight_regular: sel.weight_regular, weight_midterm: sel.weight_midterm, weight_final: sel.weight_final });
        const body = t("notif.gradeBodyDetailed", { course: sel.name, r: fmt(sr), m: fmt(sm), f: fmt(sf), total: g.total === null ? "—" : String(g.total), letter: g.letter || "—" });
        await sb.from("notifications").insert({ student_id: s.id, sender_id: me.id, type: "grade", title: t("notif.gradeTitle"), body }); // RLS skips non-advisees
        if (token && s.email && !/@sv\.demo\.edu\.vn$/i.test(s.email)) {
          void fetch("/api/notify-grade", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ studentId: s.id, courseName: sel.name, r: fmt(sr), m: fmt(sm), f: fmt(sf), total: g.total, letter: g.letter, lang }),
          }).catch(() => {});
        }
      }));
    }
    setSaving(false);
    toast(t("cls.gSaved"), "success");
    loadRoster(sel, date);
  }

  const tabBtn = (tb: "attend" | "grades", ic: string, key: string) => (
    <button type="button" onClick={() => setTab(tb)}
      style={{
        border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        padding: "9px 16px", fontSize: 14, fontWeight: tab === tb ? 700 : 500,
        color: tab === tb ? "var(--primary, #2563eb)" : "var(--muted, #5C6678)",
        borderBottom: "2px solid " + (tab === tb ? "var(--primary, #2563eb)" : "transparent"),
      }}>
      <Icon name={ic} size={15} /> {t(key)}
    </button>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">{t("cls.title")}</div>
          <div className="page-sub">{t("cls.sub")}</div>
        </div>
      </div>

      <div className="card">
        <div className="field" style={{ maxWidth: 520, marginBottom: 0 }}>
          <label>{t("cls.pickClass")}</label>
          <select value={selId} onChange={(e) => setSelId(e.target.value)}>
            <option value="">{t("cls.selectClass")}</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name} · {s.semester}</option>)}
          </select>
        </div>
        {sections.length === 0 && <div className="muted-note" style={{ marginTop: 10 }}>{t("cls.noClasses")}</div>}
      </div>

      {sel && (
        <div className="card">
          {/* Two tabs for the selected class */}
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border, #e5e7eb)", marginBottom: 16 }}>
            {tabBtn("attend", "grad", "cls.tabAttend")}
            {tabBtn("grades", "edit", "cls.tabGrades")}
          </div>

          {tab === "attend" && (
            <div className="toolbar" style={{ marginBottom: 14 }}>
              <label style={{ margin: 0, alignSelf: "center" }}>{t("cls.session")}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
              <span className="muted-note" style={{ alignSelf: "center" }}>{t("cls.weeklyNote")}</span>
            </div>
          )}

          {roster.length === 0 ? (
            <div className="empty"><Icon name="students" size={30} />{t("cls.noStudents")}</div>
          ) : tab === "attend" ? (
            <>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>{t("th.student")}</th><th>{t("th.studentId")}</th><th style={{ textAlign: "center" }}>{t("cls.present")}</th><th className="text-right">{t("cls.attRate")}</th></tr></thead>
                  <tbody>
                    {roster.map(({ s }) => {
                      const r = rates[s.id]; const rate = r && r.tot ? Math.round((r.pre / r.tot) * 100) : null;
                      return (
                        <tr key={s.id}>
                          <td><b>{s.full_name}</b></td><td className="mono">{s.student_code || "—"}</td>
                          <td style={{ textAlign: "center" }}>
                            <input type="checkbox" checked={present[s.id] !== false} onChange={(e) => setPresent((p) => ({ ...p, [s.id]: e.target.checked }))} style={{ width: 18, height: 18 }} />
                          </td>
                          <td className="text-right mono">{rate === null ? "—" : rate + "%"}{r ? <span className="muted-note"> ({r.pre}/{r.tot})</span> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-primary" disabled={saving} onClick={saveAttendance}>{saving ? t("loading") : t("cls.saveAttend")}</button>
                <span className="muted-note">{t("cls.attHint")}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>{t("th.student")}</th><th>{t("th.studentId")}</th><th>{t("th.reg")}</th><th>{t("th.mid")}</th><th>{t("th.final")}</th><th>{t("th.total")}</th><th>{t("th.grade")}</th></tr></thead>
                  <tbody>
                    {roster.map(({ c, s }) => {
                      const sr = gVal(c, "sr"), sm = gVal(c, "sm"), sf = gVal(c, "sf");
                      const g = computeCourse({ score_regular: sr, score_midterm: sm, score_final: sf, weight_regular: sel.weight_regular, weight_midterm: sel.weight_midterm, weight_final: sel.weight_final });
                      return (
                        <tr key={c.id}>
                          <td><b>{s.full_name}</b></td><td className="mono">{s.student_code || "—"}</td>
                          <td><input className="cell-in" inputMode="decimal" value={sr} onChange={(e) => setG(c.id, "sr", e.target.value)} /></td>
                          <td><input className="cell-in" inputMode="decimal" value={sm} onChange={(e) => setG(c.id, "sm", e.target.value)} /></td>
                          <td><input className="cell-in" inputMode="decimal" value={sf} onChange={(e) => setG(c.id, "sf", e.target.value)} /></td>
                          <td className="mono">{g.total === null ? "—" : g.total}</td>
                          <td><span className={"grade-chip grade-" + (g.letter || "").replace("+", "p")}>{g.letter || "—"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-primary" disabled={saving} onClick={saveGrades}>{saving ? t("loading") : t("cls.saveGrades")}</button>
                <span className="muted-note">{t("cls.weightsNote", { r: sel.weight_regular, m: sel.weight_midterm, f: sel.weight_final })}</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
