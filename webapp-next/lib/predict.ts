// =============================================================================
// Explainable prediction: how likely is a student to ENTER the alarm zone
// (risk score ≥ 40 = Medium+), before they actually get there.
//
// Two transparent signals (no black-box model):
//  1) Proximity — how close the current composite score is to the 40 threshold,
//     plus which individual indicators sit in a "warning band" near their limit.
//  2) Trajectory — the slope of the student's risk_score history projected 30d
//     ahead; a rising trend raises the likelihood and gives an ETA.
// =============================================================================
import type { RiskScore } from "./types";

const ALARM_SCORE = 40; // Medium threshold = the "alarm zone"

export interface PredictInput {
  score: number | null; // current composite risk score (null if unscored)
  cpa: number | null;
  attendance_rate: number;
  lms_activity_score: number;
  failed_count: number;
}
export type PredBand = "alarm" | "high" | "watch" | "safe" | "unscored";
export interface PredReason { key: string; params?: Record<string, string | number>; }
export interface Prediction {
  band: PredBand;
  likelihood: number; // 0..100
  etaDays: number | null;
  reasons: PredReason[];
  predicted: boolean; // true when below alarm but likely to enter it
}

function slopePerDay(history: RiskScore[]): number {
  const pts = (history || [])
    .filter((h) => h.computed_at)
    .slice()
    .sort((a, b) => new Date(a.computed_at).getTime() - new Date(b.computed_at).getTime());
  if (pts.length < 2) return 0;
  const first = pts[0], last = pts[pts.length - 1];
  const days = (new Date(last.computed_at).getTime() - new Date(first.computed_at).getTime()) / 86400000;
  if (days < 1) return 0; // not enough temporal spread for a trend
  return (last.score - first.score) / days;
}

export function predictAlarm(input: PredictInput, history: RiskScore[]): Prediction {
  const score = input.score;
  if (score === null || score === undefined) return { band: "unscored", likelihood: 0, etaDays: null, reasons: [], predicted: false };
  if (score >= ALARM_SCORE) return { band: "alarm", likelihood: 100, etaDays: null, reasons: [{ key: "inAlarm", params: { score } }], predicted: false };

  const slope = slopePerDay(history);
  const proj = Math.max(0, Math.min(100, score + slope * 30)); // projected score in 30 days
  const prox = score / ALARM_SCORE; // 0..1 — how far toward the threshold now
  const likelihood = Math.round(Math.max(0, Math.min(99, 100 * (0.6 * prox + 0.4 * Math.min(1, proj / ALARM_SCORE)))));

  const reasons: PredReason[] = [];
  if (slope > 0.05) reasons.push({ key: "rising", params: { week: (slope * 7).toFixed(1) } });
  if (input.cpa !== null && input.cpa >= 2.3 && input.cpa <= 3.0) reasons.push({ key: "gpaNear", params: { cpa: input.cpa.toFixed(2) } });
  if (input.attendance_rate >= 78 && input.attendance_rate <= 90) reasons.push({ key: "attNear", params: { att: Math.round(input.attendance_rate) } });
  if (input.lms_activity_score >= 52 && input.lms_activity_score <= 70) reasons.push({ key: "lmsNear", params: { lms: Math.round(input.lms_activity_score) } });
  if (score >= 30) reasons.push({ key: "closeScore", params: { score } });

  let etaDays: number | null = null;
  if (slope > 0.05) {
    const e = Math.round((ALARM_SCORE - score) / slope);
    etaDays = e >= 1 && e <= 90 ? e : null; // only show a plausible, near-term ETA
  }
  const band: PredBand = likelihood >= 60 ? "high" : likelihood >= 35 ? "watch" : "safe";
  return { band, likelihood, etaDays, reasons, predicted: band !== "safe" };
}
