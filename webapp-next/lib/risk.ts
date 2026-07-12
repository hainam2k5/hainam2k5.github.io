// Explainable, rule-based risk engine. Ported from the static app (risk.js).
// Weights + level thresholds are configurable (per institution / major) so the
// model isn't locked to one policy — a limitation highlighted in the literature.
export interface RiskConfig {
  w_gpa: number; w_att: number; w_lms: number; w_fail: number;
  th_medium: number; th_high: number; th_critical: number;
}
export const DEFAULT_CONFIG: RiskConfig = {
  w_gpa: 0.4, w_att: 0.3, w_lms: 0.15, w_fail: 0.15, th_medium: 40, th_high: 65, th_critical: 85,
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

function gpaRisk(cpa: number | null | undefined): number {
  if (cpa === null || cpa === undefined) return 0;
  const g = clamp(Number(cpa) || 0, 0, 4);
  return clamp(((2.5 - g) / 2.5) * 100, 0, 100);
}
function attendanceRisk(rate: number): number {
  const x = clamp(Number(rate) || 0, 0, 100);
  return clamp(((85 - x) / 85) * 100, 0, 100);
}
function lmsRisk(a: number): number {
  const x = clamp(Number(a) || 0, 0, 100);
  return clamp(((60 - x) / 60) * 100, 0, 100);
}
function failedRisk(n: number): number {
  return Math.min(100, Math.max(0, (Number(n) || 0) * 34));
}

export interface RiskInput {
  cpa: number | null;
  attendance_rate: number;
  lms_activity_score: number;
  failed_count: number;
}
export interface RiskResult {
  score: number;
  level: string;
  factor_gpa: number;
  factor_attendance: number;
  factor_lms: number;
  factor_failed_credits: number;
}

export function compute(input: RiskInput, cfg: RiskConfig = DEFAULT_CONFIG): RiskResult {
  const gr = gpaRisk(input.cpa);
  const ar = attendanceRisk(input.attendance_rate);
  const lr = lmsRisk(input.lms_activity_score);
  const fr = failedRisk(input.failed_count);

  const fg = gr * cfg.w_gpa, fa = ar * cfg.w_att, fl = lr * cfg.w_lms, ff = fr * cfg.w_fail;
  let score = clamp(fg + fa + fl + ff, 0, 100);
  score = Math.round(score * 10) / 10;

  const thresholds: [number, string][] = [[cfg.th_critical, "Critical"], [cfg.th_high, "High"], [cfg.th_medium, "Medium"], [0, "Low"]];
  let level = "Low";
  for (const [th, l] of thresholds) { if (score >= th) { level = l; break; } }

  return {
    score, level,
    factor_gpa: r1(fg), factor_attendance: r1(fa), factor_lms: r1(fl), factor_failed_credits: r1(ff),
  };
}

export function alertWorthy(level: string): boolean {
  return level === "Medium" || level === "High" || level === "Critical";
}
