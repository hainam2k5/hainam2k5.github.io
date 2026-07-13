// GPA / CPA — VNU 10-point → letter → 4.0 scale. Ported from the static app.
import type { Course } from "./types";

export const GRADE_TABLE = [
  { min: 8.5, letter: "A", point: 4.0 },
  { min: 8.0, letter: "B+", point: 3.5 },
  { min: 7.0, letter: "B", point: 3.0 },
  { min: 6.5, letter: "C+", point: 2.5 },
  { min: 5.5, letter: "C", point: 2.0 },
  { min: 5.0, letter: "D+", point: 1.5 },
  { min: 4.0, letter: "D", point: 1.0 },
  { min: 0.0, letter: "F", point: 0.0 },
];

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
export function numOr(v: unknown, d: number): number {
  const n = num(v);
  return n === null ? d : n;
}
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function gradeFromTotal(total: number | null): { letter: string; point: number } | null {
  if (total === null || total === undefined || isNaN(total)) return null;
  for (const row of GRADE_TABLE) if (total >= row.min) return { letter: row.letter, point: row.point };
  return { letter: "F", point: 0 };
}

export interface CourseGrade {
  total: number | null;
  letter: string | null;
  point: number | null;
}

type Scoreish = number | string | null | undefined;
export function computeCourse(c: {
  score_regular?: Scoreish;
  score_midterm?: Scoreish;
  score_final?: Scoreish;
  weight_regular?: Scoreish;
  weight_midterm?: Scoreish;
  weight_final?: Scoreish;
}): CourseGrade {
  const r = num(c.score_regular), m = num(c.score_midterm), f = num(c.score_final);
  if (r === null || m === null || f === null) return { total: null, letter: null, point: null };
  const wr = numOr(c.weight_regular, 0.2), wm = numOr(c.weight_midterm, 0.3), wf = numOr(c.weight_final, 0.5);
  const total = round2(r * wr + m * wm + f * wf);
  const g = gradeFromTotal(total)!;
  return { total, letter: g.letter, point: g.point };
}

export function gpaOf(courses: Course[]): { gpa: number | null; credits: number } {
  let pts = 0, cr = 0;
  for (const c of courses || []) {
    if (c.grade_point === null || c.grade_point === undefined) continue;
    const credits = numOr(c.credits, 0);
    pts += Number(c.grade_point) * credits;
    cr += credits;
  }
  return cr > 0 ? { gpa: round2(pts / cr), credits: cr } : { gpa: null, credits: 0 };
}

// Cumulative 10-point average (credit-weighted), as shown on the SIS transcript.
export function avg10Of(courses: Course[]): number | null {
  let pts = 0, cr = 0;
  for (const c of courses || []) {
    if (c.total_score === null || c.total_score === undefined) continue;
    const credits = numOr(c.credits, 0);
    pts += Number(c.total_score) * credits;
    cr += credits;
  }
  return cr > 0 ? round2(pts / cr) : null;
}

export interface Semester {
  semester: string;
  courses: Course[];
  gpa: number | null;
  credits: number;
}

export function bySemester(courses: Course[]): Semester[] {
  const map = new Map<string, Course[]>();
  for (const c of courses || []) {
    const key = c.semester || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  const out: Semester[] = [];
  for (const [semester, list] of map) {
    const g = gpaOf(list);
    out.push({ semester, courses: list, gpa: g.gpa, credits: g.credits });
  }
  out.sort((a, b) => (a.semester < b.semester ? 1 : -1)); // newest first
  return out;
}

export function failedCount(courses: Course[]): number {
  return (courses || []).filter(
    (c) => c.grade_point !== null && c.grade_point !== undefined && Number(c.grade_point) === 0
  ).length;
}
