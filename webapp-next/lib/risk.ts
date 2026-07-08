// Explainable, rule-based risk engine. Ported from the static app (risk.js).
export const WEIGHTS = { gpa: 0.4, attendance: 0.3, lms: 0.15, failed: 0.15 };
const THRESHOLDS: [number, string][] = [[85, "Critical"], [65, "High"], [40, "Medium"], [0, "Low"]];

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

export function compute(input: RiskInput): RiskResult {
  const gr = gpaRisk(input.cpa);
  const ar = attendanceRisk(input.attendance_rate);
  const lr = lmsRisk(input.lms_activity_score);
  const fr = failedRisk(input.failed_count);

  const fg = gr * WEIGHTS.gpa, fa = ar * WEIGHTS.attendance, fl = lr * WEIGHTS.lms, ff = fr * WEIGHTS.failed;
  let score = clamp(fg + fa + fl + ff, 0, 100);
  score = Math.round(score * 10) / 10;

  let level = "Low";
  for (const [th, l] of THRESHOLDS) { if (score >= th) { level = l; break; } }

  return {
    score, level,
    factor_gpa: r1(fg), factor_attendance: r1(fa), factor_lms: r1(fl), factor_failed_credits: r1(ff),
  };
}

export function alertWorthy(level: string): boolean {
  return level === "Medium" || level === "High" || level === "Critical";
}
