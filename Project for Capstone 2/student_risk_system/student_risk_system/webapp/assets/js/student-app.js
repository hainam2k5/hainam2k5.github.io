// =============================================================================
// Student portal: view-only grades + GPA/CPA, notifications, Q&A with advisor.
// Everything is realtime — grades / notices / replies appear without refresh.
// UI text goes through I18N.t() so the page can switch VI / EN.
// =============================================================================
(async function () {
  const $ = (id) => document.getElementById(id);
  const sb = App.sb;
  const t = I18N.t;

  const me = await App.requireRole("student");
  if (!me) return;

  const state = { courses: [], notifications: [], messages: [], advisor: null };

  // Static text + language switch, then icons (icons must come after apply()).
  I18N.apply();
  I18N.mount($("langMount"));
  document.querySelectorAll("[data-ic]").forEach((el) => el.insertAdjacentHTML("afterbegin", UI.icon(el.dataset.ic, el.classList.contains("bell") ? 20 : 16)));

  // Header / user chip
  $("userAvatar").textContent = UI.initials(me.full_name);
  $("userName").textContent = me.full_name || t("role.student");
  $("userMeta").textContent = (me.student_code || "") + (me.cohort ? " · " + me.cohort : "");
  $("hello").textContent = t("student.hello", { name: me.full_name || t("student.helloDefault") });
  $("helloSub").textContent = [me.student_code, me.program, me.cohort].filter(Boolean).join(" · ");
  $("logoutBtn").onclick = () => App.signOut();

  // ---------------------------------------------------------------- grades
  function gradeClass(letter) {
    return { "A": "grade-A", "B+": "grade-Bp", "B": "grade-B", "C+": "grade-Cp",
             "C": "grade-C", "D+": "grade-Dp", "D": "grade-D", "F": "grade-F" }[letter] || "";
  }

  function renderKpis() {
    const overall = GPA.gpaOf(state.courses);
    const semesters = GPA.bySemester(state.courses);
    const latest = semesters.find((s) => s.gpa !== null);
    $("kpiCpa").textContent = overall.gpa === null ? "—" : overall.gpa.toFixed(2);
    $("kpiGpa").innerHTML = latest ? latest.gpa.toFixed(2) + ' <small>' + UI.esc(latest.semester) + "</small>" : "—";
    $("kpiCredits").textContent = overall.credits || 0;
    const failed = GPA.failedCount(state.courses);
    $("kpiFailed").innerHTML = failed > 0 ? '<span class="tone-Critical">' + failed + "</span>" : "0";
  }

  function renderAlertBanner() {
    const cpa = GPA.gpaOf(state.courses).gpa;
    const failed = GPA.failedCount(state.courses);
    let html = "";
    if (cpa !== null && (cpa < 2.0 || failed >= 2)) {
      html = banner("risk-Critical", UI.icon("alert", 20), t("banner.critTitle"),
        t("banner.cpaNow", { cpa: cpa.toFixed(2) }) + (failed ? t("banner.failedPart", { n: failed }) : "") + t("banner.contactSoon"));
    } else if (cpa !== null && (cpa < 2.5 || failed >= 1)) {
      html = banner("risk-Medium", UI.icon("alert", 20), t("banner.medTitle"),
        t("banner.cpaNow", { cpa: cpa.toFixed(2) }) + t("banner.improve"));
    }
    $("alertBanner").innerHTML = html;
  }
  function banner(cls, ic, title, body) {
    return '<div class="alert-banner ' + cls + '"><div class="ab-ic">' + ic + "</div><div><div class=\"ab-title\">" +
      UI.esc(title) + "</div><div>" + UI.esc(body) + "</div></div></div>";
  }

  function renderSemesters() {
    const semesters = GPA.bySemester(state.courses);
    if (!semesters.length) { $("semesters").innerHTML = '<div class="empty">' + UI.icon("inbox", 30) + UI.esc(t("empty.noGrades")) + "</div>"; return; }
    $("semesters").innerHTML = semesters.map((s) => {
      const rows = s.courses.map((c) => {
        const graded = c.total_score !== null && c.total_score !== undefined;
        return "<tr><td><b>" + UI.esc(c.name) + "</b><div class=\"muted-note\">" + UI.esc(c.code || "") + "</div></td>" +
          '<td class="text-right mono">' + (c.credits || 0) + "</td>" +
          '<td class="text-right mono">' + UI.num(c.score_regular, 1) + "</td>" +
          '<td class="text-right mono">' + UI.num(c.score_midterm, 1) + "</td>" +
          '<td class="text-right mono">' + UI.num(c.score_final, 1) + "</td>" +
          '<td class="text-right mono strong">' + UI.num(c.total_score, 2) + "</td>" +
          '<td class="text-right"><span class="grade-chip ' + gradeClass(c.letter_grade) + '">' +
            (graded ? UI.esc(c.letter_grade) + " (" + Number(c.grade_point).toFixed(1) + ")" : "—") + "</span></td></tr>";
      }).join("");
      return '<div style="margin-bottom:18px">' +
        '<div class="spread" style="margin-bottom:6px"><b>' + UI.esc(t("sem.label", { sem: s.semester })) + "</b>" +
        '<span class="pill">' + UI.esc(t("sem.gpa")) + ' <b style="margin-left:4px">' + (s.gpa === null ? "—" : s.gpa.toFixed(2)) + "</b> · " + s.credits + " " + UI.esc(t("sem.credits")) + "</span></div>" +
        '<table><thead><tr><th>' + UI.esc(t("th.course")) + '</th><th class="text-right">' + UI.esc(t("th.cr")) + '</th><th class="text-right">' + UI.esc(t("th.reg")) + '</th>' +
        '<th class="text-right">' + UI.esc(t("th.mid")) + '</th><th class="text-right">' + UI.esc(t("th.final")) + '</th><th class="text-right">' + UI.esc(t("th.total")) + '</th><th class="text-right">' + UI.esc(t("th.grade")) + "</th></tr></thead><tbody>" +
        rows + "</tbody></table></div>";
    }).join("");
  }

  async function loadCourses() {
    const { data, error } = await sb.from("courses").select("*").eq("student_id", me.id).order("semester", { ascending: false });
    if (error) { console.error(error); return; }
    state.courses = data || [];
    renderKpis(); renderAlertBanner(); renderSemesters();
  }

  // --------------------------------------------------------- notifications
  const NOTIF_IC = { grade: "notes", alert: "alert", message: "message", system: "bell" };
  function renderNotifications() {
    const list = state.notifications;
    const unread = list.filter((n) => !n.is_read).length;
    $("bellDot").textContent = unread;
    $("bellDot").classList.toggle("show", unread > 0);
    if (!list.length) { $("notifList").innerHTML = '<div class="empty">' + UI.icon("bell", 30) + UI.esc(t("empty.noNotif")) + "</div>"; return; }
    $("notifList").innerHTML = list.map((n) =>
      '<div class="notif ' + (n.is_read ? "" : "unread") + '"><div class="ni">' + UI.icon(NOTIF_IC[n.type] || "bell", 16) + "</div>" +
      '<div style="flex:1"><div class="nt">' + UI.esc(n.title) + "</div>" +
      '<div class="nb">' + UI.esc(n.body) + "</div>" +
      '<div class="nd">' + UI.fmtDate(n.created_at, true) + "</div></div></div>").join("");
  }
  async function loadNotifications() {
    const { data, error } = await sb.from("notifications").select("*").eq("student_id", me.id).order("created_at", { ascending: false });
    if (error) { console.error(error); return; }
    state.notifications = data || [];
    renderNotifications();
  }
  async function markAllRead() {
    const ids = state.notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!ids.length) return;
    await sb.from("notifications").update({ is_read: true }).in("id", ids);
    state.notifications.forEach((n) => (n.is_read = true));
    renderNotifications();
  }
  $("markAllRead").onclick = markAllRead;
  $("bell").onclick = () => { document.getElementById("notifList").scrollIntoView({ behavior: "smooth" }); };

  // ------------------------------------------------------------------ chat
  async function loadAdvisor() {
    if (!me.advisor_id) { $("advisorName").textContent = t("student.noAdvisor"); return; }
    const { data } = await sb.from("profiles").select("id, full_name, email").eq("id", me.advisor_id).maybeSingle();
    state.advisor = data;
    $("advisorName").textContent = data ? data.full_name : "—";
  }
  function renderChat() {
    const box = $("chat");
    if (!state.messages.length) { box.innerHTML = '<div class="empty" style="padding:20px">' + UI.icon("message", 28) + UI.esc(t("empty.noChat")) + "</div>"; return; }
    box.innerHTML = state.messages.map((m) => {
      const mine = m.sender_id === me.id;
      return '<div class="msg ' + (mine ? "msg-me" : "msg-them") + '">' + UI.esc(m.body) +
        '<div class="mm">' + (mine ? t("you") : (state.advisor ? state.advisor.full_name : t("advisor"))) + " · " + UI.fmtDate(m.created_at, true) + "</div></div>";
    }).join("");
    box.scrollTop = box.scrollHeight;
  }
  async function loadMessages() {
    const { data, error } = await sb.from("messages").select("*").eq("student_id", me.id).order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    state.messages = data || [];
    renderChat();
  }
  $("msgForm").onsubmit = async (e) => {
    e.preventDefault();
    const body = $("msgInput").value.trim();
    if (!body) return;
    if (!me.advisor_id) return UI.toast(t("student.notAssigned"), "error");
    $("msgInput").value = "";
    const { error } = await sb.from("messages").insert({
      student_id: me.id, advisor_id: me.advisor_id, sender_id: me.id, sender_role: "student", body,
    });
    if (error) { UI.toast(error.message, "error"); $("msgInput").value = body; }
  };
  if (!me.advisor_id) { $("chatNote").textContent = t("student.chatNote"); }

  // -------------------------------------------------------------- realtime
  function subscribe() {
    sb.channel("rt-courses-" + me.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "courses", filter: "student_id=eq." + me.id },
        async () => { await loadCourses(); UI.toast(t("toast.gradesUpdated"), "success"); })
      .subscribe();

    sb.channel("rt-notif-" + me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "student_id=eq." + me.id },
        (payload) => { UI.toast(t("toast.newNotif", { title: payload.new.title || "" })); loadNotifications(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: "student_id=eq." + me.id },
        () => loadNotifications())
      .subscribe();

    sb.channel("rt-msg-" + me.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "student_id=eq." + me.id },
        (payload) => { state.messages.push(payload.new); renderChat(); if (payload.new.sender_id !== me.id) UI.toast(t("toast.advisorReplied")); })
      .subscribe();
  }

  // ------------------------------------------------------------------ boot
  await Promise.all([loadCourses(), loadNotifications(), loadAdvisor()]);
  await loadMessages();
  subscribe();
})();
