import type { TFunc } from "./i18n";

export function initials(name?: string | null): string {
  const parts = String(name || "?").trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function fmtDate(iso: string | null | undefined, locale: string, withTime?: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const s = d.toLocaleDateString(locale);
  return withTime ? s + " " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : s;
}

export function numFmt(v: unknown, digits = 2): string {
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

export function gradeClass(letter: string | null | undefined): string {
  return (
    {
      A: "grade-A", "B+": "grade-Bp", B: "grade-B", "C+": "grade-Cp",
      C: "grade-C", "D+": "grade-Dp", D: "grade-D", F: "grade-F",
    } as Record<string, string>
  )[letter || ""] || "";
}

export function riskLabel(t: TFunc, level: string | null | undefined): string {
  return t("risk." + (level || "Unscored"));
}
