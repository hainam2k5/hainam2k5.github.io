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

        {/* Thông điệp giới thiệu (overlay dưới) */}
        <div className="abp-hero">
          <h1>{t("login.heroTitle")}</h1>
          <p>{t("login.heroDesc")}</p>
          <ul className="abp-features">
            {features.map(([ic, k]) => (
              <li key={k}><Icon name={ic} size={18} /><span>{t(k)}</span></li>
            ))}
          </ul>
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
