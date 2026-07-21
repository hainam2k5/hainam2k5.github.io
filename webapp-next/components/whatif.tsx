"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { GRADE_TABLE, gpaOf, numOr } from "@/lib/gpa";
import { compute as computeRisk, DEFAULT_CONFIG, type RiskConfig } from "@/lib/risk";
import { riskLabel } from "@/lib/format";
import type { Profile, Course } from "@/lib/types";

// "What-if" grade-improvement simulator (student portal). Client-side only:
// the student tries better letter grades on already-graded courses and sees the
// CPA + risk score move instantly. Nothing is written to the database.
// Degree-target math needs no curriculum — just one editable "program total
// credits" number (default 130).
const RANKS = [
  { key: "whatif.rank.kha", min: 2.5 },
  { key: "whatif.rank.gioi", min: 3.2 },
  { key: "whatif.rank.xs", min: 3.6 },
];

export function WhatIf({ me, courses }: { me: Profile; courses: Course[] }) {
  const { t } = useI18n();
  const [sim, setSim] = useState<Record<string, number>>({}); // course id -> tried grade_point
  const [totalCr, setTotalCr] = useState("130");
  const [cfg, setCfg] = useState<RiskConfig>(DEFAULT_CONFIG);

  // Use the school's live weights/thresholds when readable; fall back silently.
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    (async () => {
      try {
        const { data } = await sb.from("risk_config").select("*").maybeSingle();
        if (data) setCfg({ ...DEFAULT_CONFIG, ...(data as Partial<RiskConfig>) });
      } catch { /* keep defaults */ }
    })();
  }, []);

  const graded = useMemo(
    () => courses.filter((c) => c.grade_point !== null && c.grade_point !== undefined && Number(c.grade_point) < 4),
    [courses],
  );

  const effective = useMemo(
    () => courses.map((c) => (sim[c.id] !== undefined ? { ...c, grade_point: sim[c.id] } : c)),
    [courses, sim],
  );

  const cur = gpaOf(courses);
  const simg = gpaOf(effective);
  const failedOf = (list: Course[]) => list.filter((c) => c.grade_point !== null && Number(c.grade_point) === 0).length;
  const riskOf = (cpa: number | null, failed: number) =>
    computeRisk({ cpa, attendance_rate: numOr(me.attendance_rate, 100), lms_activity_score: numOr(me.lms_activity_score, 100), failed_count: failed }, cfg);
  const r0 = riskOf(cur.gpa, failedOf(courses));
  const r1 = riskOf(simg.gpa, failedOf(effective));
  const active = Object.keys(sim).length > 0;
  const escaped = active && r0.score >= cfg.th_medium && r1.score < cfg.th_medium;

  // Required average over the remaining credits to reach each classification.
  const total = Math.max(0, parseInt(totalCr) || 0);
  const remaining = Math.max(0, total - simg.credits);
  const targetLine = (min: number): string => {
    const cpa = simg.gpa;
    if (cpa === null) return "—";
    if (remaining === 0) return cpa >= min ? t("whatif.reached") : t("whatif.done");
    const need = (min * total - cpa * simg.credits) / remaining;
    if (need <= 0) return t("whatif.reached");
    if (need > 4) return t("whatif.impossible");
    return t("whatif.needAvg", { v: need.toFixed(2) });
  };

  const toggle = (id: string, point: number) =>
    setSim((p) => { const n = { ...p }; if (n[id] === point) delete n[id]; else n[id] = point; return n; });

  const chip = (sel: boolean): React.CSSProperties => ({
    padding: "1px 9px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
    border: "1px solid " + (sel ? "var(--primary)" : "var(--border)"),
    background: sel ? "var(--primary)" : "transparent", color: sel ? "#fff" : "inherit", fontWeight: sel ? 700 : 500,
  });

  return (
    <div className="card no-print">
      <div className="card-head">
        <div className="card-title"><Icon name="chart" /> {t("whatif.title")}</div>
        <div className="card-sub">{t("whatif.sub")}</div>
      </div>

      {graded.length === 0 ? (
        <div className="muted-note">{t("whatif.noCourses")}</div>
      ) : (
        <>
          <div className="muted-note" style={{ marginBottom: 8 }}>{t("whatif.pickHint")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto", paddingRight: 4 }}>
            {graded.map((c) => (
              <div key={c.id} className="spread" style={{ gap: 10, alignItems: "baseline" }}>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{c.name}</b>
                  <span className="muted-note"> · {c.credits || 0} {t("sem.credits")} · {c.letter_grade}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {GRADE_TABLE.filter((g) => g.point > Number(c.grade_point)).map((g) => (
                    <button key={g.letter} type="button" style={chip(sim[c.id] === g.point)} onClick={() => toggle(c.id, g.point)}>{g.letter}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="divider" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="pill">CPA: <b style={{ margin: "0 4px" }}>{cur.gpa === null ? "—" : cur.gpa.toFixed(2)}</b>
              {active && simg.gpa !== null && <>→ <b style={{ marginLeft: 4, color: "var(--primary)" }}>{simg.gpa.toFixed(2)}</b></>}
            </span>
            <span className="pill">{t("whatif.riskScore")}: <b style={{ margin: "0 4px" }}>{r0.score}</b>
              {active && <>→ <b style={{ marginLeft: 4, color: escaped ? "var(--ok, #157F3C)" : "var(--primary)" }}>{r1.score}</b></>}
              {active && <span className="muted-note" style={{ marginLeft: 6 }}>({riskLabel(t, r0.level)} → {riskLabel(t, r1.level)}{escaped ? " · " + t("whatif.escape") : ""})</span>}
            </span>
            {active && <button className="btn btn-sm" onClick={() => setSim({})}>{t("whatif.reset")}</button>}
          </div>

          <div className="divider" />
          <div className="spread" style={{ marginBottom: 6 }}>
            <b style={{ fontSize: 13.5 }}>{t("whatif.targetTitle")}</b>
            <span className="muted-note">
              {t("whatif.totalCredits")}:
              <input value={totalCr} onChange={(e) => setTotalCr(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric"
                style={{ width: 52, marginLeft: 6, padding: "1px 6px", textAlign: "right" }} />
              {total > 0 && <span style={{ marginLeft: 6 }}>{t("whatif.remaining", { n: remaining })}</span>}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {RANKS.map((rk) => (
              <div key={rk.key} className="spread" style={{ fontSize: 13.5 }}>
                <span>{t(rk.key)}</span>
                <span className="mono" style={{ color: "var(--muted, #5C6678)" }}>{total > 0 ? targetLine(rk.min) : "—"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
