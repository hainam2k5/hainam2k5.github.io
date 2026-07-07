"use client";
import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { supabase, configured, getMyProfile, homeFor } from "@/lib/supabaseClient";
import { toast } from "@/lib/toast";
import { Icon } from "@/lib/icons";
import { LangSwitch } from "@/components/common";
import { gpaOf, bySemester, failedCount } from "@/lib/gpa";
import { fmtDate, initials, numFmt, gradeClass } from "@/lib/format";
import type { Profile, Course, Notification, Message } from "@/lib/types";

const NOTIF_IC: Record<string, string> = { grade: "notes", alert: "alert", message: "message", system: "bell" };

export default function StudentPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [advisor, setAdvisor] = useState<Profile | null>(null);
  const [draft, setDraft] = useState("");
  const notifRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  // --- auth guard
  useEffect(() => {
    if (!configured) { router.replace("/"); return; }
    getMyProfile().then((p) => {
      if (!p) { router.replace("/"); return; }
      if (p.role !== "student") { router.replace(homeFor(p.role)); return; }
      setMe(p);
    });
  }, [router]);

  // --- data load + realtime
  useEffect(() => {
    if (!me || !supabase) return;
    const sb = supabase;
    let active = true;

    const loadCourses = async () => {
      const { data } = await sb.from("courses").select("*").eq("student_id", me.id).order("semester", { ascending: false });
      if (active) setCourses((data as Course[]) || []);
    };
    const loadNotifications = async () => {
      const { data } = await sb.from("notifications").select("*").eq("student_id", me.id).order("created_at", { ascending: false });
      if (active) setNotifications((data as Notification[]) || []);
    };
    const loadMessages = async () => {
      const { data } = await sb.from("messages").select("*").eq("student_id", me.id).order("created_at", { ascending: true });
      if (active) setMessages((data as Message[]) || []);
    };
    const loadAdvisor = async () => {
      if (!me.advisor_id) return;
      const { data } = await sb.from("profiles").select("id, full_name, email").eq("id", me.advisor_id).maybeSingle();
      if (active) setAdvisor(data as Profile);
    };

    loadCourses(); loadNotifications(); loadMessages(); loadAdvisor();

    const chCourses = sb.channel("rt-courses-" + me.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "courses", filter: "student_id=eq." + me.id },
        () => { loadCourses(); toast(t("toast.gradesUpdated"), "success"); })
      .subscribe();
    const chNotif = sb.channel("rt-notif-" + me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "student_id=eq." + me.id },
        (payload: any) => { toast(t("toast.newNotif", { title: payload.new.title || "" })); loadNotifications(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: "student_id=eq." + me.id },
        () => loadNotifications())
      .subscribe();
    const chMsg = sb.channel("rt-msg-" + me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "student_id=eq." + me.id },
        (payload: any) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== me.id) toast(t("toast.advisorReplied"));
        })
      .subscribe();

    return () => { active = false; sb.removeChannel(chCourses); sb.removeChannel(chNotif); sb.removeChannel(chMsg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

  async function markAllRead() {
    if (!supabase) return;
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !me) return;
    const body = draft.trim();
    if (!body) return;
    if (!me.advisor_id) return toast(t("student.notAssigned"), "error");
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      student_id: me.id, advisor_id: me.advisor_id, sender_id: me.id, sender_role: "student", body,
    });
    if (error) { toast(error.message, "error"); setDraft(body); }
  }

  if (!me) return <div className="empty" style={{ paddingTop: 80 }}>{t("loading")}</div>;

  const overall = gpaOf(courses);
  const semesters = bySemester(courses);
  const latest = semesters.find((s) => s.gpa !== null);
  const failed = failedCount(courses);
  const cpa = overall.gpa;
  const unread = notifications.filter((n) => !n.is_read).length;

  let banner: { cls: string; title: string; body: string } | null = null;
  if (cpa !== null && (cpa < 2.0 || failed >= 2)) {
    banner = {
      cls: "risk-Critical", title: t("banner.critTitle"),
      body: t("banner.cpaNow", { cpa: cpa.toFixed(2) }) + (failed ? t("banner.failedPart", { n: failed }) : "") + t("banner.contactSoon"),
    };
  } else if (cpa !== null && (cpa < 2.5 || failed >= 1)) {
    banner = { cls: "risk-Medium", title: t("banner.medTitle"), body: t("banner.cpaNow", { cpa: cpa.toFixed(2) }) + t("banner.improve") };
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-logo">SR</div>
          <div><div className="brand-name">{t("brand.studentPortal")}</div><div className="brand-sub">{t("brand.studentSub")}</div></div>
        </div>
        <div className="topbar-spacer" />
        <LangSwitch />
        <div className="bell" title={t("bell.title")} onClick={() => notifRef.current?.scrollIntoView({ behavior: "smooth" })}>
          <Icon name="bell" size={20} />
          <span className={"bell-dot" + (unread > 0 ? " show" : "")}>{unread}</span>
        </div>
        <div className="topbar-user">
          <div className="avatar">{initials(me.full_name)}</div>
          <div className="who"><b>{me.full_name || t("role.student")}</b><small>{(me.student_code || "") + (me.cohort ? " · " + me.cohort : "")}</small></div>
          <button className="btn btn-sm" onClick={async () => { await supabase?.auth.signOut(); router.replace("/"); }}>{t("btn.logout")}</button>
        </div>
      </div>

      <div className="container">
        <div className="page-head">
          <div>
            <div className="page-title">{t("student.hello", { name: me.full_name || t("student.helloDefault") })}</div>
            <div className="page-sub">{[me.student_code, me.program, me.cohort].filter(Boolean).join(" · ")}</div>
          </div>
        </div>

        {banner && (
          <div className={"alert-banner " + banner.cls}>
            <div className="ab-ic"><Icon name="alert" size={20} /></div>
            <div><div className="ab-title">{banner.title}</div><div>{banner.body}</div></div>
          </div>
        )}

        <div className="kpi-grid">
          <div className="kpi accent"><div className="kpi-label">{t("kpi.cpa")}</div><div className="kpi-value">{cpa === null ? "—" : cpa.toFixed(2)}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.gpaLatest")}</div><div className="kpi-value">{latest ? <>{latest.gpa!.toFixed(2)} <small>{latest.semester}</small></> : "—"}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.creditsAccum")}</div><div className="kpi-value">{overall.credits || 0}</div></div>
          <div className="kpi"><div className="kpi-label">{t("kpi.failedF")}</div><div className="kpi-value">{failed > 0 ? <span className="tone-Critical">{failed}</span> : "0"}</div></div>
        </div>

        <div className="grid-2">
          <div>
            <div className="card">
              <div className="card-head">
                <div className="card-title"><Icon name="book" /> {t("card.transcript")}</div>
                <div className="card-sub">{t("card.transcriptSub")}</div>
              </div>
              {semesters.length === 0 ? (
                <div className="empty"><Icon name="inbox" size={30} />{t("empty.noGrades")}</div>
              ) : (
                semesters.map((s) => (
                  <div key={s.semester} style={{ marginBottom: 18 }}>
                    <div className="spread" style={{ marginBottom: 6 }}>
                      <b>{t("sem.label", { sem: s.semester })}</b>
                      <span className="pill">{t("sem.gpa")} <b style={{ marginLeft: 4 }}>{s.gpa === null ? "—" : s.gpa.toFixed(2)}</b> · {s.credits} {t("sem.credits")}</span>
                    </div>
                    <table>
                      <thead><tr>
                        <th>{t("th.course")}</th><th className="text-right">{t("th.cr")}</th><th className="text-right">{t("th.reg")}</th>
                        <th className="text-right">{t("th.mid")}</th><th className="text-right">{t("th.final")}</th><th className="text-right">{t("th.total")}</th><th className="text-right">{t("th.grade")}</th>
                      </tr></thead>
                      <tbody>
                        {s.courses.map((c) => {
                          const graded = c.total_score !== null && c.total_score !== undefined;
                          return (
                            <tr key={c.id}>
                              <td><b>{c.name}</b><div className="muted-note">{c.code || ""}</div></td>
                              <td className="text-right mono">{c.credits || 0}</td>
                              <td className="text-right mono">{numFmt(c.score_regular, 1)}</td>
                              <td className="text-right mono">{numFmt(c.score_midterm, 1)}</td>
                              <td className="text-right mono">{numFmt(c.score_final, 1)}</td>
                              <td className="text-right mono strong">{numFmt(c.total_score, 2)}</td>
                              <td className="text-right"><span className={"grade-chip " + gradeClass(c.letter_grade)}>{graded ? `${c.letter_grade} (${Number(c.grade_point).toFixed(1)})` : "—"}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="card" ref={notifRef}>
              <div className="card-head">
                <div className="card-title"><Icon name="bell" /> {t("card.notifications")}</div>
                <button className="btn btn-sm" onClick={markAllRead}>{t("btn.markAllRead")}</button>
              </div>
              {notifications.length === 0 ? (
                <div className="empty"><Icon name="bell" size={30} />{t("empty.noNotif")}</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={"notif" + (n.is_read ? "" : " unread")}>
                    <div className="ni"><Icon name={NOTIF_IC[n.type] || "bell"} size={16} /></div>
                    <div style={{ flex: 1 }}>
                      <div className="nt">{n.title}</div>
                      <div className="nb">{n.body}</div>
                      <div className="nd">{fmtDate(n.created_at, locale, true)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <div className="card-title"><Icon name="message" /> {t("card.qa")}</div>
                <div className="card-sub">{me.advisor_id ? (advisor ? advisor.full_name : "—") : t("student.noAdvisor")}</div>
              </div>
              <div className="chat" ref={chatRef}>
                {messages.length === 0 ? (
                  <div className="empty" style={{ padding: 20 }}><Icon name="message" size={28} />{t("empty.noChat")}</div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === me.id;
                    return (
                      <div key={m.id} className={"msg " + (mine ? "msg-me" : "msg-them")}>
                        {m.body}
                        <div className="mm">{(mine ? t("you") : (advisor ? advisor.full_name : t("advisor"))) + " · " + fmtDate(m.created_at, locale, true)}</div>
                      </div>
                    );
                  })
                )}
              </div>
              <form className="msg-input" onSubmit={sendMessage}>
                <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("chat.phStudent")} autoComplete="off" />
                <button className="btn btn-primary" type="submit">{t("btn.send")}</button>
              </form>
              {!me.advisor_id && <div className="muted-note">{t("student.chatNote")}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
