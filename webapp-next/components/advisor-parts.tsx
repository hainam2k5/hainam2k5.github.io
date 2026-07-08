"use client";
import { useState, ChangeEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { numFmt, gradeClass } from "@/lib/format";
import type { Course, Profile, RiskScore } from "@/lib/types";
import { PROGRAMS } from "@/lib/programs";

export const FACTOR_MAX = { gpa: 40, att: 30, lms: 15, fail: 15 };
export const IV_TYPES = ["advising", "callEmail", "studyPlan", "referral", "followup"];

// ------------------------------------------------------------ one grade row
export function CourseRow({ course, onSave }: { course: Course; onSave: (id: string, r: string, m: string, f: string) => void }) {
  const [r, setR] = useState(course.score_regular ?? "");
  const [m, setM] = useState(course.score_midterm ?? "");
  const [f, setF] = useState(course.score_final ?? "");
  const { t } = useI18n();
  return (
    <tr>
      <td><b>{course.name}</b><div className="muted-note">{course.code || ""}</div></td>
      <td className="mono">{course.credits || 0}</td>
      <td><input className="cell-in" type="number" step="0.1" min="0" max="10" value={r} onChange={(e) => setR(e.target.value)} /></td>
      <td><input className="cell-in" type="number" step="0.1" min="0" max="10" value={m} onChange={(e) => setM(e.target.value)} /></td>
      <td><input className="cell-in" type="number" step="0.1" min="0" max="10" value={f} onChange={(e) => setF(e.target.value)} /></td>
      <td className="mono strong">{numFmt(course.total_score, 2)}</td>
      <td><span className={"grade-chip " + gradeClass(course.letter_grade)}>{course.letter_grade || "—"}</span></td>
      <td><button className="btn btn-sm" onClick={() => onSave(course.id, String(r), String(m), String(f))}>{t("btn.save")}</button></td>
    </tr>
  );
}

// --------------------------------------------------------------- add course
export interface NewCourse { code: string; name: string; credits: string; semester: string; year: string; wr: string; wm: string; wf: string; sr: string; sm: string; sf: string; }
export function AddCourseForm({ onAdd }: { onAdd: (c: NewCourse) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState<NewCourse>({ code: "", name: "", credits: "3", semester: "", year: "", wr: "0.2", wm: "0.3", wf: "0.5", sr: "", sm: "", sf: "" });
  const up = (k: keyof NewCourse) => (e: ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <>
      <div className="field-grid-2">
        <div className="field"><label>{t("label.courseCode")}</label><input type="text" value={v.code} onChange={up("code")} placeholder="INT2202" /></div>
        <div className="field"><label>{t("label.courseName")}</label><input type="text" value={v.name} onChange={up("name")} placeholder="Data Structures" /></div>
      </div>
      <div className="field-grid">
        <div className="field"><label>{t("label.credits")}</label><input type="number" value={v.credits} onChange={up("credits")} min="1" /></div>
        <div className="field"><label>{t("label.semester")}</label><input type="text" value={v.semester} onChange={up("semester")} placeholder="2025-1" /></div>
        <div className="field"><label>{t("label.year")}</label><input type="text" value={v.year} onChange={up("year")} placeholder="2024-2025" /></div>
      </div>
      <div className="field-grid">
        <div className="field"><label>{t("label.wReg")}</label><input type="number" value={v.wr} onChange={up("wr")} step="0.05" min="0" max="1" /></div>
        <div className="field"><label>{t("label.wMid")}</label><input type="number" value={v.wm} onChange={up("wm")} step="0.05" min="0" max="1" /></div>
        <div className="field"><label>{t("label.wFin")}</label><input type="number" value={v.wf} onChange={up("wf")} step="0.05" min="0" max="1" /></div>
      </div>
      <div className="field-grid">
        <div className="field"><label>{t("label.sReg")}</label><input type="number" value={v.sr} onChange={up("sr")} step="0.1" min="0" max="10" /></div>
        <div className="field"><label>{t("label.sMid")}</label><input type="number" value={v.sm} onChange={up("sm")} step="0.1" min="0" max="10" /></div>
        <div className="field"><label>{t("label.sFin")}</label><input type="number" value={v.sf} onChange={up("sf")} step="0.1" min="0" max="10" /></div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => onAdd(v)}>{t("btn.addCourse")}</button>
      <div className="muted-note" style={{ marginTop: 8 }}>{t("note.weights")}</div>
    </>
  );
}

// -------------------------------------------------------------- add student
export interface NewStudent { name: string; code: string; email: string; program: string; cohort: string; att: string; lms: string; }
export function AddStudentForm({ onAdd }: { onAdd: (s: NewStudent) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState<NewStudent>({ name: "", code: "", email: "", program: "", cohort: "", att: "100", lms: "100" });
  const up = (k: keyof NewStudent) => (e: ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-head"><div className="card-title"><Icon name="students" /> {t("adv.addStudent")}</div></div>
      <div className="field-grid">
        <div className="field"><label>{t("form.fullName")}</label><input type="text" value={v.name} onChange={up("name")} placeholder="Nguyễn Văn A" /></div>
        <div className="field"><label>{t("form.studentCode")}</label><input type="text" value={v.code} onChange={up("code")} placeholder="SV007" /></div>
        <div className="field"><label>{t("form.email")}</label><input type="email" value={v.email} onChange={up("email")} placeholder="sv007@truong.edu.vn" /></div>
      </div>
      <div className="field-grid">
        <div className="field"><label>{t("form.program")}</label><select value={v.program} onChange={(e) => setV({ ...v, program: e.target.value })}><option value="">{t("form.selectProgram")}</option>{PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="field"><label>{t("form.cohort")}</label><input type="text" value={v.cohort} onChange={up("cohort")} placeholder="K69" /></div>
        <div className="field"><label>{t("label.attendance")}</label><input type="number" value={v.att} onChange={up("att")} min="0" max="100" /></div>
      </div>
      <div className="field-grid-2">
        <div className="field"><label>{t("label.lms")}</label><input type="number" value={v.lms} onChange={up("lms")} min="0" max="100" /></div>
        <div className="field" style={{ display: "flex", alignItems: "flex-end" }}><button className="btn btn-primary btn-block" onClick={() => onAdd(v)}>{t("btn.save")}</button></div>
      </div>
      <div className="muted-note">{t("adv.addStudentHint")}</div>
    </div>
  );
}

// ------------------------------------------------------------- indicators
export function IndicatorsBox({ student, onSave }: { student: Profile; onSave: (att: string, lms: string) => void }) {
  const { t } = useI18n();
  const [att, setAtt] = useState(String(student.attendance_rate));
  const [lms, setLms] = useState(String(student.lms_activity_score));
  return (
    <div className="card">
      <div className="card-head"><div className="card-title"><Icon name="chart" /> {t("card.indicators")}</div></div>
      <div className="field-grid-2">
        <div className="field"><label>{t("label.attendance")}</label><input type="number" value={att} onChange={(e) => setAtt(e.target.value)} min="0" max="100" /></div>
        <div className="field"><label>{t("label.lms")}</label><input type="number" value={lms} onChange={(e) => setLms(e.target.value)} min="0" max="100" /></div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => onSave(att, lms)}>{t("btn.saveRecalc")}</button>
    </div>
  );
}

// ------------------------------------------------------------- send notif
export function SendNotifBox({ onSend }: { onSend: (title: string, body: string, reset: () => void) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="card">
      <div className="card-head"><div className="card-title"><Icon name="send" /> {t("card.sendNotif")}</div></div>
      <div className="field"><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ph.notifTitle")} /></div>
      <div className="field"><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("ph.notifBody")} /></div>
      <button className="btn btn-primary btn-sm" onClick={() => onSend(title, body, () => { setTitle(""); setBody(""); })}>{t("btn.sendNotif")}</button>
    </div>
  );
}

// ------------------------------------------------------ intervention form
export function InterventionForm({ onAdd }: { onAdd: (type: string, notes: string, status: string) => void }) {
  const { t } = useI18n();
  const [type, setType] = useState(IV_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Planned");
  return (
    <>
      <div className="divider" />
      <div className="field"><label>{t("label.ivType")}</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {IV_TYPES.map((k) => <option key={k} value={k}>{t("ivtype." + k)}</option>)}
        </select></div>
      <div className="field"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("ph.ivNotes")} /></div>
      <div className="field"><label>{t("label.ivStatus")}</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["Planned", "Completed", "Follow-up needed"].map((s) => <option key={s} value={s}>{t("iv." + s)}</option>)}
        </select></div>
      <button className="btn btn-primary btn-sm" onClick={() => onAdd(type, notes, status)}>{t("btn.logIv")}</button>
    </>
  );
}

// --------------------------------------------------------- risk factor list
export function FactorList({ risk, updated }: { risk: RiskScore | null; updated: string }) {
  const { t } = useI18n();
  if (!risk) return <div className="muted-note">{t("factor.noData")}</div>;
  const items: [string, number, number, string][] = [
    [t("factor.gpa"), risk.factor_gpa, FACTOR_MAX.gpa, "#6366f1"],
    [t("factor.att"), risk.factor_attendance, FACTOR_MAX.att, "#0ea5e9"],
    [t("factor.lms"), risk.factor_lms, FACTOR_MAX.lms, "#f59e0b"],
    [t("factor.fail"), risk.factor_failed_credits, FACTOR_MAX.fail, "#ef4444"],
  ];
  return (
    <>
      <div className="factor-list">
        {items.map(([name, val, max, color]) => (
          <div className="factor-item" key={name}>
            <div className="factor-name">{name}</div>
            <div className="factor-track"><div className="factor-fill" style={{ width: Math.min(100, (val / max) * 100) + "%", background: color }} /></div>
            <div className="factor-val">{val}</div>
          </div>
        ))}
      </div>
      <div className="muted-note" style={{ marginTop: 10 }}>{t("factor.summary", { score: risk.score, time: updated })}</div>
    </>
  );
}
