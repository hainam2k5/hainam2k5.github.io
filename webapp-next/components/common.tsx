"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { RiskScore } from "@/lib/types";

// School logo + name for the top-left of every signed-in page. When `onClick`
// is given the whole block becomes a button (e.g. "back to overview"). Falls
// back to a text badge if /school-logo.png is missing.
export function BrandLogo({ onClick, title }: { onClick?: () => void; title?: string }) {
  const [ok, setOk] = useState(true);
  return (
    <div
      className={"brand" + (onClick ? " brand-link" : "")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? title : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="brand-logo-img" src="/school-logo.png" alt="Trường Quốc tế — Đại học Quốc gia Hà Nội" onError={() => setOk(false)} />
      ) : (
        <>
          <div className="brand-logo brand-logo-fallback">VNU<span>iS</span></div>
          <div>
            <div className="brand-name">Trường Quốc tế</div>
            <div className="brand-sub">VNU International School</div>
          </div>
        </>
      )}
    </div>
  );
}

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
