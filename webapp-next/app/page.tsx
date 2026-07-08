"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { supabase, configured, getMyProfile, homeFor } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";
import { Icon } from "@/lib/icons";
import { LangSwitch } from "@/components/common";
import { PROGRAMS } from "@/lib/programs";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regCohort, setRegCohort] = useState("");
  const [regProgram, setRegProgram] = useState("");
  const [regPassword, setRegPassword] = useState("");

  useEffect(() => {
    if (!configured) return;
    getMyProfile().then((p) => { if (p) router.replace(homeFor(p.role)); });
  }, [router]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    if (!configured || !supabase) return toast(t("toast.notConfigured"), "error");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    setBusy(false);
    if (error) return toast(error.message, "error");
    const p = await getMyProfile();
    router.replace(homeFor(p ? p.role : "student"));
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    if (!configured || !supabase) return toast(t("toast.notConfigured"), "error");
    setBusy(true);
    // Public signup is student-only; the DB trigger also forces role = 'student'.
    const { data, error } = await supabase.auth.signUp({
      email: regEmail.trim(),
      password: regPassword,
      options: {
        data: {
          full_name: regName.trim(), role: "student",
          student_code: regCode.trim(), program: regProgram.trim(), cohort: regCohort.trim(),
        },
      },
    });
    setBusy(false);
    if (error) return toast(error.message, "error");
    if (data.session) {
      const p = await getMyProfile();
      router.replace(homeFor(p ? p.role : "student"));
    } else {
      toast(t("toast.signupDone"), "success");
      setTab("login");
    }
  }

  const features: [string, string][] = [["chart", "login.feat1"], ["notes", "login.feat2"], ["message", "login.feat3"]];

  return (
    <div className="auth-split">
      <aside className="auth-brandpane">
        <div className="abp-brand">
          <div className="brand-logo">SR</div>
          <div>
            <div className="brand-name">{t("brand.name")}</div>
            <div className="brand-sub">{t("brand.dss")}</div>
          </div>
        </div>
        <div className="abp-hero">
          <h1>{t("login.heroTitle")}</h1>
          <p>{t("login.heroDesc")}</p>
          <ul className="abp-features">
            {features.map(([ic, k]) => (
              <li key={k}><Icon name={ic} size={18} /><span>{t(k)}</span></li>
            ))}
          </ul>
        </div>
        <div className="abp-foot">{t("login.footer")}</div>
      </aside>

      <main className="auth-formpane">
        <div className="auth-card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><LangSwitch /></div>
          <div className="auth-title">{t("login.welcome")}</div>
          <div className="auth-sub">{t("login.welcomeSub")}</div>

          {!configured && (
            <div className="config-warn">
              <Icon name="alert" size={18} />
              <div>{t("login.configWarn")}</div>
            </div>
          )}

          <div className="auth-tabs">
            <button type="button" className={tab === "login" ? "active" : ""} onClick={() => setTab("login")}>{t("login.tabLogin")}</button>
            <button type="button" className={tab === "register" ? "active" : ""} onClick={() => setTab("register")}>{t("login.tabRegister")}</button>
          </div>

          {tab === "login" ? (
            <form onSubmit={onLogin}>
              <div className="field"><label>{t("form.email")}</label>
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="email@truong.edu.vn" required autoComplete="email" /></div>
              <div className="field"><label>{t("form.password")}</label>
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{t("login.btnLogin")}</button>
            </form>
          ) : (
            <form onSubmit={onRegister}>
              <div className="muted-note" style={{ marginBottom: 12 }}>{t("login.registerNote")}</div>
              <div className="field"><label>{t("form.fullName")}</label>
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Nguyễn Văn A" required /></div>
              <div className="field"><label>{t("form.email")}</label>
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="email@truong.edu.vn" required autoComplete="email" /></div>
              <div className="field-grid-2">
                <div className="field"><label>{t("form.studentCode")}</label>
                  <input type="text" value={regCode} onChange={(e) => setRegCode(e.target.value)} placeholder="SV001" /></div>
                <div className="field"><label>{t("form.cohort")}</label>
                  <input type="text" value={regCohort} onChange={(e) => setRegCohort(e.target.value)} placeholder="K68" /></div>
              </div>
              <div className="field"><label>{t("form.program")}</label>
                <select value={regProgram} onChange={(e) => setRegProgram(e.target.value)}>
                  <option value="">{t("form.selectProgram")}</option>
                  {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select></div>
              <div className="field"><label>{t("form.passwordMin")}</label>
                <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{t("login.btnRegister")}</button>
            </form>
          )}

          <div className="auth-hint" dangerouslySetInnerHTML={{ __html: t("login.demoHint") }} />
        </div>
      </main>
    </div>
  );
}
