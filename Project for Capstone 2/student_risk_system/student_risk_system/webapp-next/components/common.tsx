"use client";
import { useI18n } from "@/lib/i18n";
import type { RiskScore } from "@/lib/types";

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch">
      <button type="button" className={lang === "vi" ? "active" : ""} onClick={() => setLang("vi")}>VI</button>
      <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
    </div>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const { t } = useI18n();
  const lv = level || "Unscored";
  return <span className={"badge badge-" + lv}>{t("risk." + lv)}</span>;
}

export function RiskBar({ risk }: { risk: RiskScore | null }) {
  if (!risk) return <div className="riskbar" />;
  const seg = (cls: string, v: number) =>
    v > 0 ? <span key={cls} className={cls} style={{ width: v + "%" }} /> : null;
  return (
    <div className="riskbar">
      {seg("f-gpa", risk.factor_gpa)}
      {seg("f-att", risk.factor_attendance)}
      {seg("f-lms", risk.factor_lms)}
      {seg("f-fail", risk.factor_failed_credits)}
    </div>
  );
}
