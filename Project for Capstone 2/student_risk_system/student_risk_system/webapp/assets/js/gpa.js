// =============================================================================
// GPA / CPA — VNU 10-point → letter → 4.0 scale.
// Edit GRADE_TABLE to match your faculty's exact regulation if needed.
// =============================================================================
window.GPA = (function () {
  const GRADE_TABLE = [
    { min: 8.5, letter: "A",  point: 4.0 },
    { min: 8.0, letter: "B+", point: 3.5 },
    { min: 7.0, letter: "B",  point: 3.0 },
    { min: 6.5, letter: "C+", point: 2.5 },
    { min: 5.5, letter: "C",  point: 2.0 },
    { min: 5.0, letter: "D+", point: 1.5 },
    { min: 4.0, letter: "D",  point: 1.0 },
    { min: 0.0, letter: "F",  point: 0.0 },
  ];

  // Parse to a number, or null when blank/invalid (so "not entered" ≠ 0).
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  function numOr(v, d) { const n = num(v); return n === null ? d : n; }
  function round2(x) { return Math.round(x * 100) / 100; }

  // 10-point total → { letter, point }
  function gradeFromTotal(total) {
    if (total === null || total === undefined || isNaN(total)) return null;
    for (const row of GRADE_TABLE) if (total >= row.min) return { letter: row.letter, point: row.point };
    return { letter: "F", point: 0 };
  }

  // Compute a course's finalised grade from its 3 components + weights.
  // Returns { total, letter, point } — all null if any component is missing.
  function computeCourse(c) {
    const r = num(c.score_regular), m = num(c.score_midterm), f = num(c.score_final);
    if (r === null || m === null || f === null) return { total: null, letter: null, point: null };
    const wr = numOr(c.weight_regular, 0.2), wm = numOr(c.weight_midterm, 0.3), wf = numOr(c.weight_final, 0.5);
    const total = round2(r * wr + m * wm + f * wf);
    const g = gradeFromTotal(total);
    return { total, letter: g.letter, point: g.point };
  }

  // Weighted GPA/CPA by credits over finalised courses only.
  // Returns { gpa: number|null, credits }.
  function gpaOf(courses) {
    let pts = 0, cr = 0;
    for (const c of courses || []) {
      if (c.grade_point === null || c.grade_point === undefined) continue;
      const credits = numOr(c.credits, 0);
      pts += Number(c.grade_point) * credits;
      cr += credits;
    }
    return cr > 0 ? { gpa: round2(pts / cr), credits: cr } : { gpa: null, credits: 0 };
  }

  // Group courses into semesters (newest first) with per-semester GPA.
  function bySemester(courses) {
    const map = new Map();
    for (const c of courses || []) {
      const key = c.semester || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    const out = [];
    for (const [semester, list] of map) {
      const g = gpaOf(list);
      out.push({ semester, courses: list, gpa: g.gpa, credits: g.credits });
    }
    out.sort((a, b) => (a.semester < b.semester ? 1 : -1)); // newest first
    return out;
  }

  // Number of failed (F, grade_point 0) finalised courses.
  function failedCount(courses) {
    return (courses || []).filter(
      (c) => c.grade_point !== null && c.grade_point !== undefined && Number(c.grade_point) === 0
    ).length;
  }

  return { GRADE_TABLE, num, numOr, round2, gradeFromTotal, computeCourse, gpaOf, bySemester, failedCount };
})();
