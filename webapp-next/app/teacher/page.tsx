"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { supabase, configured, getMyProfile, homeFor } from "@/lib/supabaseClient";
import { BrandLogo, LangSwitch } from "@/components/common";
import { Icon } from "@/lib/icons";
import { initials } from "@/lib/format";
import { ClassesView } from "@/components/classes-view";
import type { Profile } from "@/lib/types";

type TView = "attendance" | "grades";

// Teacher portal: a teacher (role 'teacher', not an advisor) manages the classes
// they teach across two separate pages — Attendance and Grades — via ClassesView.
export default function TeacherPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [me, setMe] = useState<Profile | null>(null);
  const [view, setView] = useState<TView>("attendance");

  useEffect(() => {
    if (!configured) { router.replace("/"); return; }
    getMyProfile().then((p) => {
      if (!p) { router.replace("/"); return; }
      if (p.role !== "teacher") { router.replace(homeFor(p.role)); return; }
      setMe(p);
    });
  }, [router]);

  if (!me) return <div className="empty" style={{ paddingTop: 80 }}>{t("loading")}</div>;

  const nav: [TView, string, string][] = [
    ["attendance", "grad", "nav.attendance"],
    ["grades", "edit", "nav.grades"],
  ];

  return (
    <>
      <div className="topbar">
        <BrandLogo onClick={() => setView("attendance")} title={t("brand.home")} />
        <div className="topbar-spacer" />
        <LangSwitch />
        <div className="topbar-user">
          <div className="avatar">{initials(me.full_name)}</div>
          <div className="who"><b>{me.full_name || t("role.teacher")}</b><small>{t("role.teacher") + (me.program ? " · " + me.program : "")}</small></div>
          <button className="btn btn-sm" onClick={async () => { await supabase?.auth.signOut(); router.replace("/"); }}>{t("btn.logout")}</button>
        </div>
      </div>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="nav-label">{t("nav.section")}</div>
          <nav className="nav">
            {nav.map(([v, ic, key]) => (
              <a key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
                <Icon name={ic} size={18} /><span>{t(key)}</span>
              </a>
            ))}
          </nav>
        </aside>
        <main className="main">
          {view === "attendance" && <ClassesView me={me} mode="attend" />}
          {view === "grades" && <ClassesView me={me} mode="grades" />}
        </main>
      </div>
    </>
  );
}
