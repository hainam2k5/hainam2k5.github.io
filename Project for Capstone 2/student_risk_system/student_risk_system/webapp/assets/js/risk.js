// =============================================================================
// Explainable, rule-based risk engine (ported from risk_engine.py).
// Four indicators → 0..100 risk contributions → weighted composite → level.
// Data sources here: CPA (4.0), attendance %, LMS activity, and # failed courses.
// =============================================================================
window.Risk = (function () {
  const WEIGHTS = { gpa: 0.40, attendance: 0.30, lms: 0.15, failed: 0.15 };
  const THRESHOLDS = [[85, "Critical"], [65, "High"], [40, "Medium"], [0, "Low"]];

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10;

  // CPA below 2.5 raises risk; below 0 maxes out. null CPA = unknown = 0 risk.
  function gpaRisk(cpa) {
    if (cpa === null || cpa === undefined) return 0;
    const g = clamp(Number(cpa) || 0, 0, 4);
    return clamp(((2.5 - g) / 2.5) * 100, 0, 100);
  }
  function attendanceRisk(rate) { const x = clamp(Number(rate) || 0, 0, 100); return clamp(((85 - x) / 85) * 100, 0, 100); }
  function lmsRisk(a) { const x = clamp(Number(a) || 0, 0, 100); return clamp(((60 - x) / 60) * 100, 0, 100); }
  function failedRisk(n) { return Math.min(100, Math.max(0, (Number(n) || 0) * 34)); }

  // input: { cpa, attendance_rate, lms_activity_score, failed_count }
  function compute(input) {
    const gr = gpaRisk(input.cpa);
    const ar = attendanceRisk(input.attendance_rate);
    const lr = lmsRisk(input.lms_activity_score);
    const fr = failedRisk(input.failed_count);

    const fg = gr * WEIGHTS.gpa, fa = ar * WEIGHTS.attendance, fl = lr * WEIGHTS.lms, ff = fr * WEIGHTS.failed;
    let score = clamp(fg + fa + fl + ff, 0, 100);
    score = Math.round(score * 10) / 10;

    let level = "Low";
    for (const [t, l] of THRESHOLDS) { if (score >= t) { level = l; break; } }

    return {
      score, level,
      factor_gpa: r1(fg), factor_attendance: r1(fa), factor_lms: r1(fl), factor_failed_credits: r1(ff),
    };
  }

  function alertWorthy(level) { return level === "Medium" || level === "High" || level === "Critical"; }

  return { WEIGHTS, compute, alertWorthy };
})();
