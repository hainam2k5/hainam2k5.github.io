"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { supabase, configured, getMyProfile, homeFor } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";
import { Icon } from "@/lib/icons";
import { LangSwitch } from "@/components/common";
import { PROGRAMS } from "@/lib/programs";

// Ảnh giới thiệu Trường Quốc tế (tự động đổi). Người dùng đặt ảnh thật vào
// webapp-next/public/school/slide1.jpg ... slide4.jpg. Nếu thiếu ảnh, nền
// gradient bên dưới vẫn hiển thị (không bị vỡ ảnh).
const SLIDES = [
  { src: "/school/slide1.jpg", grad: "linear-gradient(150deg,#0c2647,#1c53a6)" },
  { src: "/school/slide2.jpg", grad: "linear-gradient(150deg,#123a68,#2a7de1)" },
  { src: "/school/slide3.jpg", grad: "linear-gradient(150deg,#0f2f3d,#1c7a4d)" },
  { src: "/school/slide4.jpg", grad: "linear-gradient(150deg,#241a4d,#5b3fa6)" },
];

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  // Forgot-password (6-digit OTP) flow. null = normal login/register view.
  const [forgotStep, setForgotStep] = useState<null | "email" | "code">(null);
  const [fpEmail, setFpEmail] = useState("");
  const [fpCode, setFpCode] = useState("");
  const [fpPass, setFpPass] = useState("");
  const [fpPass2, setFpPass2] = useState("");
  // Registration: pick the account type first. Students self-register freely;
  // advisors must supply the secret advisor code (verified by the DB trigger).
  const [regRole, setRegRole] = useState<"student" | "advisor">("student");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regCohort, setRegCohort] = useState("");
  const [regProgram, setRegProgram] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regAdvisorCode, setRegAdvisorCode] = useState("");

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

  // Step 1 — email → send a 6-digit recovery code to the mailbox.
  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    if (!configured || !supabase) return toast(t("toast.notConfigured"), "error");
    const email = fpEmail.trim();
    if (!email) return toast(t("toast.enterEmail"), "error");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(t("toast.resetSent"), "success");
    setForgotStep("code");
  }

  // Step 2 — verify the 6-digit code, then set the new password.
  async function onVerifyReset(e: FormEvent) {
    e.preventDefault();
    if (!configured || !supabase) return toast(t("toast.notConfigured"), "error");
    if (fpPass !== fpPass2) return toast(t("reset.mismatch"), "error");
    setBusy(true);
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: fpEmail.trim(), token: fpCode.trim(), type: "recovery",
    });
    if (vErr) { setBusy(false); return toast(t("reset.invalid"), "error"); }
    const { error: uErr } = await supabase.auth.updateUser({ password: fpPass });
    if (uErr) { setBusy(false); return toast(uErr.message, "error"); }
    // Drop the temporary recovery session so the user signs in fresh.
    await supabase.auth.signOut();
    setBusy(false);
    toast(t("reset.done"), "success");
    setLoginEmail(fpEmail.trim());
    setLoginPassword("");
    setFpCode(""); setFpPass(""); setFpPass2("");
    setForgotStep(null);
    setTab("login");
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    if (!configured || !supabase) return toast(t("toast.notConfigured"), "error");

    // Every field is mandatory so no half-filled profile can be created.
    const base = regName.trim() && regEmail.trim() && regProgram.trim() && regPassword;
    const ok = regRole === "advisor"
      ? base && regAdvisorCode.trim()
      : base && regCode.trim() && regCohort.trim();
    if (!ok) return toast(t("toast.fillAll"), "error");

    // The role here is only a REQUEST. The DB trigger promotes to 'advisor' only
    // when advisor_code matches the school's secret; otherwise it stays a student.
    const meta =
      regRole === "advisor"
        ? { full_name: regName.trim(), role: "advisor", program: regProgram.trim(), advisor_code: regAdvisorCode.trim() }
        : { full_name: regName.trim(), role: "student", student_code: regCode.trim(), program: regProgram.trim(), cohort: regCohort.trim() };

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: regEmail.trim(),
      password: regPassword,
      options: { data: meta },
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

  return (
    <div className="auth-split">
      <aside className="auth-brandpane">
        {/* Ảnh Trường Quốc tế – tự động đổi */}
        <div className="abp-carousel" aria-hidden="true">
          {SLIDES.map((s, i) => (
            <div key={i} className={"abp-slide" + (i === slide ? " active" : "")} style={{ backgroundImage: s.grad }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            </div>
          ))}
          <div className="abp-scrim" />
        </div>

        {/* Logo + tên trường (góc trên bên trái). Khi có /school-logo.png
            (ảnh 2: khiên + tên trường) thì hiển thị đúng ảnh đó; nếu thiếu
            thì dùng huy hiệu chữ + tên trường thay thế. */}
        <div className="abp-topbar">
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="abp-logo-full" src="/school-logo.png" alt="Trường Quốc tế - Đại học Quốc gia Hà Nội" onError={() => setLogoOk(false)} />
          ) : (
            <>
              <div className="abp-logo abp-logo-fallback">VNU<span>iS</span></div>
              <div className="abp-school">
                <div className="abp-school-1">Đại học Quốc gia Hà Nội</div>
                <div className="abp-school-2">Trường Quốc tế</div>
                <div className="abp-school-3">VNU International School</div>
              </div>
            </>
          )}
        </div>

        {/* Chấm chuyển ảnh */}
        <div className="abp-dots" role="tablist" aria-label="Ảnh giới thiệu">
          {SLIDES.map((_, i) => (
            <button key={i} type="button" className={"abp-dot" + (i === slide ? " active" : "")}
              aria-label={"Ảnh " + (i + 1)} aria-selected={i === slide} role="tab" onClick={() => setSlide(i)} />
          ))}
        </div>
      </aside>

      <main className="auth-formpane">
        <div className="auth-card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><LangSwitch /></div>

          {forgotStep === null && (<>
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
                <div className="auth-forgot">
                  <button type="button" className="link-btn" onClick={() => { setForgotStep("email"); if (loginEmail) setFpEmail(loginEmail); }}>{t("login.forgotLink")}</button>
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{t("login.btnLogin")}</button>
              </form>
            ) : (
              <form onSubmit={onRegister}>
                {/* Account type: student (open) vs advisor (needs the secret code) */}
                <div className="role-toggle">
                  <button type="button" className={regRole === "student" ? "active" : ""} onClick={() => setRegRole("student")}>{t("role.student")}</button>
                  <button type="button" className={regRole === "advisor" ? "active" : ""} onClick={() => setRegRole("advisor")}>{t("role.advisor")}</button>
                </div>
                <div className="muted-note" style={{ marginBottom: 12 }}>{regRole === "advisor" ? t("reg.advisorNote") : t("reg.studentNote")}</div>

                <div className="field"><label>{t("form.fullName")}</label>
                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Nguyễn Văn A" required /></div>
                <div className="field"><label>{t("form.email")}</label>
                  <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="email@truong.edu.vn" required autoComplete="email" /></div>

                {regRole === "student" ? (
                  <div className="field-grid-2">
                    <div className="field"><label>{t("form.studentCode")}</label>
                      <input type="text" value={regCode} onChange={(e) => setRegCode(e.target.value)} placeholder="SV001" required /></div>
                    <div className="field"><label>{t("form.cohort")}</label>
                      <input type="text" value={regCohort} onChange={(e) => setRegCohort(e.target.value)} placeholder="K68" required /></div>
                  </div>
                ) : null}

                <div className="field"><label>{t("form.program")}</label>
                  <select value={regProgram} onChange={(e) => setRegProgram(e.target.value)} required>
                    <option value="">{t("form.selectProgram")}</option>
                    {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select></div>

                {regRole === "advisor" ? (
                  <div className="field"><label>{t("form.advisorCode")}</label>
                    <input type="password" value={regAdvisorCode} onChange={(e) => setRegAdvisorCode(e.target.value)} placeholder="••••••••" required autoComplete="off" /></div>
                ) : null}

                <div className="field"><label>{t("form.passwordMin")}</label>
                  <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" /></div>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{t("login.btnRegister")}</button>
              </form>
            )}
          </>)}

          {forgotStep === "email" && (
            <form onSubmit={onSendCode}>
              <div className="auth-title">{t("login.forgotTitle")}</div>
              <div className="auth-sub">{t("login.forgotDesc")}</div>
              {!configured && (
                <div className="config-warn"><Icon name="alert" size={18} /><div>{t("login.configWarn")}</div></div>
              )}
              <div className="field"><label>{t("form.email")}</label>
                <input type="email" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} placeholder="email@truong.edu.vn" required autoComplete="email" autoFocus /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{t("login.btnSendReset")}</button>
              <div className="auth-back">
                <button type="button" className="link-btn" onClick={() => setForgotStep(null)}>{t("login.backToLogin")}</button>
              </div>
            </form>
          )}

          {forgotStep === "code" && (
            <form onSubmit={onVerifyReset}>
              <div className="auth-title">{t("reset.title")}</div>
              <div className="auth-sub">{t("reset.sentTo", { email: fpEmail.trim() })}</div>
              <div className="field"><label>{t("reset.code")}</label>
                <input className="otp-input" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={fpCode} onChange={(e) => setFpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••" required autoFocus autoComplete="one-time-code" /></div>
              <div className="field"><label>{t("reset.newPassword")}</label>
                <input type="password" value={fpPass} onChange={(e) => setFpPass(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" /></div>
              <div className="field"><label>{t("reset.confirmPassword")}</label>
                <input type="password" value={fpPass2} onChange={(e) => setFpPass2(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" /></div>
              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{t("reset.btnUpdate")}</button>
              <div className="auth-back">
                <button type="button" className="link-btn" onClick={() => onSendCode({ preventDefault() {} } as FormEvent)} disabled={busy}>{t("login.btnSendReset")}</button>
                <span className="auth-back-sep">·</span>
                <button type="button" className="link-btn" onClick={() => setForgotStep(null)}>{t("login.backToLogin")}</button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
