// =============================================================================
// Advisor console (SPA). Views: dashboard, students, student detail (grade
// entry + risk dashboard), alerts, interventions, messages. Hash-routed.
// UI text goes through I18N.t() so the console can switch VI / EN.
// =============================================================================
(async function () {
  const $ = (id) => document.getElementById(id);
  const sb = App.sb;
  const view = $("view");
  const t = I18N.t;

  const me = await App.requireRole(["advisor", "manager"]);
  if (!me) return;

  I18N.apply();
  I18N.mount($("langMount"));
  document.querySelectorAll("[data-ic]").forEach((el) => el.insertAdjacentHTML("afterbegin", UI.icon(el.dataset.ic, 18)));

  $("userAvatar").textContent = UI.initials(me.full_name);
  $("userName").textContent = me.full_name || t("role.advisor");
  $("userMeta").textContent = me.role === "manager" ? t("role.manager") : t("meta.advisor");
  $("logoutBtn").onclick = () => App.signOut();

  const db = { students: [], coursesBy: {}, riskBy: {}, alerts: [], msgUnread: 0 };
  let selectedThread = null;
  const studentFilter = { q: "", level: "" };

  // -------------------------------------------------------- small helpers
  const FACTOR_MAX = { gpa: 40, att: 30, lms: 15, fail: 15 };
  const IV_TYPES = ["advising", "callEmail", "studyPlan", "referral", "followup"];
  const gradeClass = (l) => ({ "A": "grade-A", "B+": "grade-Bp", "B": "grade-B", "C+": "grade-Cp", "C": "grade-C", "D+": "grade-Dp", "D": "grade-D", "F": "grade-F" }[l] || "");
  const statusVi = (s) => t("status." + s);
  const ivStatusVi = (s) => t("iv." + s);
  const ivTypeLabel = (k) => { const v = t("ivtype." + k); return v === "ivtype." + k ? k : v; };
  const studentById = (id) => db.students.find((s) => s.id === id);
  const openAlertFor = (id) => db.alerts.find((a) => a.student_id === id && a.status === "Open") || null;
  const valOrNull = (v) => { const n = GPA.num(v); return n; };

  // ------------------------------------------------------------- data load
  async function loadCore() {
    const [stu, crs, rsk, alr, unread] = await Promise.all([
      sb.from("profiles").select("*").eq("role", "student").order("full_name"),
      sb.from("courses").select("*"),
      sb.from("risk_scores").select("*").order("computed_at", { ascending: false }),
      sb.from("alerts").select("*").order("created_at", { ascending: false }),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("is_read", false).eq("sender_role", "student"),
    ]);
    db.students = stu.data || [];
    db.coursesBy = {};
    (crs.data || []).forEach((c) => { (db.coursesBy[c.student_id] = db.coursesBy[c.student_id] || []).push(c); });
    db.riskBy = {};
    (rsk.data || []).forEach((r) => { if (!db.riskBy[r.student_id]) db.riskBy[r.student_id] = r; }); // desc → first is latest
    db.alerts = alr.data || [];
    db.msgUnread = unread.count || 0;
    updateNavCounts();
  }

  function agg(student) {
    const courses = (db.coursesBy[student.id] || []).slice();
    const overall = GPA.gpaOf(courses);
    return { courses, cpa: overall.gpa, credits: overall.credits, failed: GPA.failedCount(courses), risk: db.riskBy[student.id] || null };
  }

  function updateNavCounts() {
    const openA = db.alerts.filter((a) => a.status === "Open").length;
    const nA = $("navAlerts"); nA.textContent = openA; nA.classList.toggle("show", openA > 0);
    const nM = $("navMsgs"); nM.textContent = db.msgUnread; nM.classList.toggle("show", db.msgUnread > 0);
  }

  // -------------------------------------------------------- risk pipeline
  async function recompute(student) {
    const a = agg(student);
    if (a.cpa === null && a.failed === 0) return null; // no graded data yet
    const result = Risk.compute({ cpa: a.cpa, attendance_rate: student.attendance_rate, lms_activity_score: student.lms_activity_score, failed_count: a.failed });
    const { data: snap } = await sb.from("risk_scores").insert({
      student_id: student.id, score: result.score, risk_level: result.level,
      factor_gpa: result.factor_gpa, factor_attendance: result.factor_attendance,
      factor_lms: result.factor_lms, factor_failed_credits: result.factor_failed_credits,
    }).select().single();
    if (snap) db.riskBy[student.id] = snap;

    if (Risk.alertWorthy(result.level) && !openAlertFor(student.id)) {
      const { data: al } = await sb.from("alerts").insert({
        student_id: student.id, advisor_id: student.advisor_id || me.id,
        risk_level: result.level, score_at_alert: result.score, status: "Open",
      }).select().single();
      if (al) db.alerts.unshift(al);
      await sb.from("notifications").insert({
        student_id: student.id, sender_id: me.id, type: "alert",
        title: t("alert.autoTitle"),
        body: t("alert.autoBody", { level: UI.riskLabel(result.level) }),
      });
    }
    updateNavCounts();
    return result;
  }
  async function autoScoreMissing() {
    for (const s of db.students) if (!db.riskBy[s.id]) await recompute(s);
  }
  async function recomputeAll() { for (const s of db.students) await recompute(s); }

  // ----------------------------------------------------- shared renderers
  function riskBar(risk) {
    if (!risk) return '<div class="riskbar"></div>';
    const seg = (cls, v) => (v > 0 ? `<span class="${cls}" style="width:${v}%"></span>` : "");
    return `<div class="riskbar">${seg("f-gpa", risk.factor_gpa)}${seg("f-att", risk.factor_attendance)}${seg("f-lms", risk.factor_lms)}${seg("f-fail", risk.factor_failed_credits)}</div>`;
  }
  function riskTable(rows) {
    if (!rows.length) return '<div class="empty">' + UI.icon("check", 30) + UI.esc(t("empty.noStudents")) + "</div>";
    return `<table><thead><tr><th>${UI.esc(t("th.student"))}</th><th>${UI.esc(t("th.studentId"))}</th><th class="text-right">CPA</th><th>${UI.esc(t("th.riskScore"))}</th><th>${UI.esc(t("th.level"))}</th><th>${UI.esc(t("th.alert"))}</th></tr></thead><tbody>
      ${rows.map(({ s, a }) => `<tr class="row-link" data-id="${s.id}">
        <td><b>${UI.esc(s.full_name)}</b><div class="muted-note">${UI.esc(s.program || "")}</div></td>
        <td class="mono">${UI.esc(s.student_code || "—")}</td>
        <td class="text-right mono strong">${a.cpa === null ? "—" : a.cpa.toFixed(2)}</td>
        <td><div class="score-cell"><span class="score-num">${a.risk ? a.risk.score : "—"}</span>${riskBar(a.risk)}</div></td>
        <td>${UI.riskBadge(a.risk ? a.risk.risk_level : "Unscored")}</td>
        <td>${openAlertFor(s.id) ? `<span class="pill Open">${UI.esc(t("status.Open"))}</span>` : '<span class="text-muted">—</span>'}</td>
      </tr>`).join("")}</tbody></table>`;
  }
  function wireRows() { view.querySelectorAll("tr.row-link[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = "student/" + tr.dataset.id))); }

  // ============================================================ DASHBOARD
  async function renderDashboard() {
    await autoScoreMissing();
    const rows = db.students.map((s) => ({ s, a: agg(s) }));
    const counts = { Low: 0, Medium: 0, High: 0, Critical: 0, Unscored: 0 };
    rows.forEach((r) => counts[r.a.risk ? r.a.risk.risk_level : "Unscored"]++);
    const openAlerts = db.alerts.filter((a) => a.status === "Open").length;
    const cpaVals = rows.map((r) => r.a.cpa).filter((v) => v !== null);
    const avgCpa = cpaVals.length ? cpaVals.reduce((x, y) => x + y, 0) / cpaVals.length : null;
    const topRisk = rows.filter((r) => r.a.risk).sort((x, y) => y.a.risk.score - x.a.risk.score).slice(0, 8);

    view.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">${UI.esc(t("adv.dashTitle"))}</div><div class="page-sub">${UI.esc(t("adv.dashSub"))}</div></div>
        <button class="btn btn-primary" id="btnRecalc">${UI.icon("refresh", 16)} ${UI.esc(t("btn.recalc"))}</button>
      </div>
      <div class="kpi-grid">
        <div class="kpi accent"><div class="kpi-label">${UI.esc(t("kpi.totalStudents"))}</div><div class="kpi-value">${db.students.length}</div></div>
        <div class="kpi"><div class="kpi-label">${UI.esc(t("kpi.openAlerts"))}</div><div class="kpi-value tone-Critical">${openAlerts}</div></div>
        <div class="kpi"><div class="kpi-label">${UI.esc(t("kpi.highCrit"))}</div><div class="kpi-value tone-High">${counts.High + counts.Critical}</div></div>
        <div class="kpi"><div class="kpi-label">${UI.esc(t("kpi.avgCpa"))}</div><div class="kpi-value">${avgCpa === null ? "—" : avgCpa.toFixed(2)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">${UI.icon("alert")} ${UI.esc(t("card.topRisk"))}</div><a class="back-link" id="seeAll">${UI.esc(t("link.seeAll"))}</a></div>
        ${riskTable(topRisk)}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">${UI.icon("alert")} ${UI.esc(t("card.recentAlerts"))}</div></div>
        ${db.alerts.length ? `<table><thead><tr><th>${UI.esc(t("th.student"))}</th><th>${UI.esc(t("th.level"))}</th><th class="text-right">${UI.esc(t("th.score"))}</th><th>${UI.esc(t("th.status"))}</th><th>${UI.esc(t("th.time"))}</th></tr></thead><tbody>
          ${db.alerts.slice(0, 8).map((al) => { const s = studentById(al.student_id); return `<tr class="row-link" data-id="${al.student_id}">
            <td>${s ? UI.esc(s.full_name) : "—"}</td><td>${UI.riskBadge(al.risk_level)}</td>
            <td class="text-right mono">${al.score_at_alert}</td><td><span class="pill ${al.status}">${UI.esc(statusVi(al.status))}</span></td>
            <td class="text-muted">${UI.fmtDate(al.created_at, true)}</td></tr>`; }).join("")}</tbody></table>`
          : '<div class="empty">' + UI.icon("bell", 30) + UI.esc(t("empty.noAlerts")) + "</div>"}
      </div>`;
    $("btnRecalc").onclick = async () => { $("btnRecalc").disabled = true; await recomputeAll(); UI.toast(t("toast.recalcAll"), "success"); router(); };
    $("seeAll").onclick = () => (location.hash = "students");
    wireRows();
  }

  // ============================================================= STUDENTS
  function renderStudents() {
    const levels = ["", "Critical", "High", "Medium", "Low"];
    view.innerHTML = `
      <div class="page-head"><div><div class="page-title">${UI.esc(t("adv.studentsTitle"))}</div><div class="page-sub">${UI.esc(t("adv.studentsSub", { n: db.students.length }))}</div></div></div>
      <div class="toolbar">
        <div class="search">${UI.icon("search", 16)}<input type="text" id="q" placeholder="${UI.esc(t("ph.search"))}" value="${UI.esc(studentFilter.q)}" /></div>
        <div class="chips">${levels.map((lv) => `<span class="chip ${studentFilter.level === lv ? "active" : ""}" data-lv="${lv}">${lv === "" ? UI.esc(t("status.All")) : UI.esc(UI.riskLabel(lv))}</span>`).join("")}</div>
      </div>
      <div class="card" id="studentsCard"></div>`;
    const draw = () => {
      let rows = db.students.map((s) => ({ s, a: agg(s) }));
      if (studentFilter.q) { const q = studentFilter.q.toLowerCase(); rows = rows.filter(({ s }) => (s.full_name || "").toLowerCase().includes(q) || (s.student_code || "").toLowerCase().includes(q)); }
      if (studentFilter.level) rows = rows.filter(({ a }) => (a.risk ? a.risk.risk_level : "Unscored") === studentFilter.level);
      rows.sort((x, y) => (y.a.risk ? y.a.risk.score : -1) - (x.a.risk ? x.a.risk.score : -1));
      $("studentsCard").innerHTML = riskTable(rows);
      wireRows();
    };
    $("q").oninput = (e) => { studentFilter.q = e.target.value; draw(); };
    view.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { studentFilter.level = c.dataset.lv; renderStudents(); }));
    draw();
  }

  // ======================================================= STUDENT DETAIL
  async function renderStudentDetail(id) {
    const student = studentById(id);
    if (!student) { view.innerHTML = '<div class="empty">' + UI.esc(t("adv.notFound")) + "</div>"; return; }
    const a = agg(student);
    const semesters = GPA.bySemester(a.courses);
    const risk = a.risk;
    const open = openAlertFor(student.id);
    const studentAlerts = db.alerts.filter((al) => al.student_id === student.id);
    let interventions = [];
    if (studentAlerts.length) {
      const { data } = await sb.from("interventions").select("*").in("alert_id", studentAlerts.map((x) => x.id)).order("created_at", { ascending: false });
      interventions = data || [];
    }
    const latestSem = semesters.find((s) => s.gpa !== null);
    const attachAlert = open || studentAlerts[0];

    view.innerHTML = `
      <a class="back-link" id="back">${UI.esc(t("adv.back"))}</a>
      <div class="page-head" style="margin-top:10px">
        <div><div class="page-title">${UI.esc(student.full_name)}</div>
          <div class="page-sub">${[student.student_code, student.program, student.cohort].filter(Boolean).map(UI.esc).join(" · ")}</div></div>
        <div style="text-align:right">${UI.riskBadge(risk ? risk.risk_level : "Unscored")}
          <div class="page-sub">${UI.esc(t("adv.riskScoreLabel"))} <b>${risk ? risk.score : "—"}</b></div></div>
      </div>
      ${open ? `<div class="alert-banner risk-${open.risk_level}"><div class="ab-ic">${UI.icon("alert", 20)}</div><div>
          <div class="ab-title">${UI.esc(t("banner.openTitle", { level: UI.riskLabel(open.risk_level) }))}</div>
          <div>${UI.esc(t("banner.openBody", { time: UI.fmtDate(open.created_at, true) }))}</div></div></div>` : ""}

      <div class="kpi-grid">
        <div class="kpi accent"><div class="kpi-label">CPA</div><div class="kpi-value">${a.cpa === null ? "—" : a.cpa.toFixed(2)}</div></div>
        <div class="kpi"><div class="kpi-label">${UI.esc(t("kpi.gpaLatestShort"))}</div><div class="kpi-value">${latestSem ? latestSem.gpa.toFixed(2) + ` <small>${UI.esc(latestSem.semester)}</small>` : "—"}</div></div>
        <div class="kpi"><div class="kpi-label">${UI.esc(t("kpi.creditsShort"))}</div><div class="kpi-value">${a.credits}</div></div>
        <div class="kpi"><div class="kpi-label">${UI.esc(t("kpi.failedF"))}</div><div class="kpi-value ${a.failed ? "tone-Critical" : ""}">${a.failed}</div></div>
      </div>

      <div class="grid-2">
        <div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("edit")} ${UI.esc(t("card.gradeEntry"))}</div><div class="card-sub">${UI.esc(t("card.gradeEntrySub"))}</div></div>
            <div id="gradeEditor">${gradeEditor(semesters)}</div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("plus")} ${UI.esc(t("card.addCourse"))}</div></div>
            ${addCourseForm()}
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("target")} ${UI.esc(t("card.riskFactors"))}</div></div>
            ${factorList(risk)}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("chart")} ${UI.esc(t("card.indicators"))}</div></div>
            <div class="field-grid-2">
              <div class="field"><label>${UI.esc(t("label.attendance"))}</label><input type="number" id="attRate" min="0" max="100" value="${student.attendance_rate}"></div>
              <div class="field"><label>${UI.esc(t("label.lms"))}</label><input type="number" id="lmsScore" min="0" max="100" value="${student.lms_activity_score}"></div>
            </div>
            <button class="btn btn-primary btn-sm" id="saveIndicators">${UI.esc(t("btn.saveRecalc"))}</button>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("alert")} ${UI.esc(t("card.alert"))}</div></div>
            ${alertsBlock(studentAlerts)}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("notes")} ${UI.esc(t("card.intervention"))}</div></div>
            ${interventionsBlock(interventions, attachAlert)}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${UI.icon("send")} ${UI.esc(t("card.sendNotif"))}</div></div>
            <div class="field"><input type="text" id="notifTitle" placeholder="${UI.esc(t("ph.notifTitle"))}"></div>
            <div class="field"><textarea id="notifBody" placeholder="${UI.esc(t("ph.notifBody"))}"></textarea></div>
            <button class="btn btn-primary btn-sm" id="sendNotif">${UI.esc(t("btn.sendNotif"))}</button>
          </div>
        </div>
      </div>`;

    // wiring
    $("back").onclick = () => (location.hash = "students");
    view.querySelectorAll("button[data-save]").forEach((b) => (b.onclick = () => saveCourseInline(b.dataset.save, student)));
    $("addCourseBtn").onclick = () => addCourse(student);
    $("saveIndicators").onclick = () => saveIndicators(student);
    $("sendNotif").onclick = () => sendNotification(student);
    view.querySelectorAll("[data-alert-status]").forEach((sel) => (sel.onchange = () => setAlertStatus(sel.dataset.alertStatus, sel.value, student)));
    view.querySelectorAll("[data-assign]").forEach((b) => (b.onclick = () => assignAlert(b.dataset.assign, student)));
    const ivBtn = $("addIvBtn"); if (ivBtn) ivBtn.onclick = () => addIntervention(attachAlert, student);
  }

  function gradeEditor(semesters) {
    if (!semesters.length) return '<div class="empty" style="padding:18px">' + UI.icon("edit", 28) + UI.esc(t("empty.noCourses")) + "</div>";
    return semesters.map((s) => `
      <div style="margin-bottom:16px">
        <div class="spread" style="margin-bottom:6px"><b>${UI.esc(t("sem.label", { sem: s.semester }))}</b>
          <span class="pill">GPA: ${s.gpa === null ? "—" : s.gpa.toFixed(2)} · ${s.credits} ${UI.esc(t("th.cr"))}</span></div>
        <table><thead><tr><th>${UI.esc(t("th.courseShort"))}</th><th>${UI.esc(t("th.cr"))}</th><th>${UI.esc(t("th.reg"))}</th><th>${UI.esc(t("th.mid"))}</th><th>${UI.esc(t("th.final"))}</th><th>${UI.esc(t("th.total"))}</th><th>${UI.esc(t("th.gradeShort"))}</th><th></th></tr></thead><tbody>
        ${s.courses.map((c) => `<tr>
          <td><b>${UI.esc(c.name)}</b><div class="muted-note">${UI.esc(c.code || "")}</div></td>
          <td class="mono">${c.credits || 0}</td>
          <td><input class="cell-in" type="number" step="0.1" min="0" max="10" id="sr_${c.id}" value="${c.score_regular ?? ""}"></td>
          <td><input class="cell-in" type="number" step="0.1" min="0" max="10" id="sm_${c.id}" value="${c.score_midterm ?? ""}"></td>
          <td><input class="cell-in" type="number" step="0.1" min="0" max="10" id="sf_${c.id}" value="${c.score_final ?? ""}"></td>
          <td class="mono strong">${UI.num(c.total_score, 2)}</td>
          <td><span class="grade-chip ${gradeClass(c.letter_grade)}">${c.letter_grade ? c.letter_grade : "—"}</span></td>
          <td><button class="btn btn-sm" data-save="${c.id}">${UI.esc(t("btn.save"))}</button></td>
        </tr>`).join("")}
        </tbody></table>
      </div>`).join("");
  }

  function addCourseForm() {
    return `<div class="field-grid-2">
        <div class="field"><label>${UI.esc(t("label.courseCode"))}</label><input type="text" id="ncCode" placeholder="INT2202"></div>
        <div class="field"><label>${UI.esc(t("label.courseName"))}</label><input type="text" id="ncName" placeholder="Data Structures"></div>
      </div>
      <div class="field-grid">
        <div class="field"><label>${UI.esc(t("label.credits"))}</label><input type="number" id="ncCredits" value="3" min="1"></div>
        <div class="field"><label>${UI.esc(t("label.semester"))}</label><input type="text" id="ncSemester" placeholder="2025-1"></div>
        <div class="field"><label>${UI.esc(t("label.year"))}</label><input type="text" id="ncYear" placeholder="2024-2025"></div>
      </div>
      <div class="field-grid">
        <div class="field"><label>${UI.esc(t("label.wReg"))}</label><input type="number" id="ncWr" value="0.2" step="0.05" min="0" max="1"></div>
        <div class="field"><label>${UI.esc(t("label.wMid"))}</label><input type="number" id="ncWm" value="0.3" step="0.05" min="0" max="1"></div>
        <div class="field"><label>${UI.esc(t("label.wFin"))}</label><input type="number" id="ncWf" value="0.5" step="0.05" min="0" max="1"></div>
      </div>
      <div class="field-grid">
        <div class="field"><label>${UI.esc(t("label.sReg"))}</label><input type="number" id="ncSr" step="0.1" min="0" max="10"></div>
        <div class="field"><label>${UI.esc(t("label.sMid"))}</label><input type="number" id="ncSm" step="0.1" min="0" max="10"></div>
        <div class="field"><label>${UI.esc(t("label.sFin"))}</label><input type="number" id="ncSf" step="0.1" min="0" max="10"></div>
      </div>
      <button class="btn btn-primary btn-sm" id="addCourseBtn">${UI.esc(t("btn.addCourse"))}</button>
      <div class="muted-note" style="margin-top:8px">${UI.esc(t("note.weights"))}</div>`;
  }

  function factorList(risk) {
    if (!risk) return '<div class="muted-note">' + UI.esc(t("factor.noData")) + "</div>";
    const items = [
      [t("factor.gpa"), risk.factor_gpa, FACTOR_MAX.gpa, "#6366f1"],
      [t("factor.att"), risk.factor_attendance, FACTOR_MAX.att, "#0ea5e9"],
      [t("factor.lms"), risk.factor_lms, FACTOR_MAX.lms, "#f59e0b"],
      [t("factor.fail"), risk.factor_failed_credits, FACTOR_MAX.fail, "#ef4444"],
    ];
    return '<div class="factor-list">' + items.map(([name, val, max, color]) =>
      `<div class="factor-item"><div class="factor-name">${UI.esc(name)}</div>
        <div class="factor-track"><div class="factor-fill" style="width:${Math.min(100, (val / max) * 100)}%;background:${color}"></div></div>
        <div class="factor-val">${val}</div></div>`).join("") +
      `</div><div class="muted-note" style="margin-top:10px">${t("factor.summary", { score: "<b>" + risk.score + "</b>", time: UI.fmtDate(risk.computed_at, true) })}</div>`;
  }

  function alertsBlock(alerts) {
    if (!alerts.length) return '<div class="muted-note">' + UI.esc(t("alerts.none")) + "</div>";
    return alerts.map((al) => `<div class="spread" style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div>${UI.riskBadge(al.risk_level)} <span class="muted-note">· ${UI.fmtDate(al.created_at)}</span></div>
      <div style="display:flex;gap:8px;align-items:center">
        ${al.advisor_id === me.id ? `<span class="muted-note">${UI.esc(t("adv.youHandle"))}</span>` : `<button class="btn btn-sm" data-assign="${al.id}">${UI.esc(t("btn.take"))}</button>`}
        <select data-alert-status="${al.id}" style="width:auto;padding:6px 8px;margin:0">
          ${["Open", "Acknowledged", "Resolved", "Dismissed"].map((st) => `<option value="${st}" ${al.status === st ? "selected" : ""}>${UI.esc(statusVi(st))}</option>`).join("")}
        </select>
      </div></div>`).join("");
  }

  function interventionsBlock(list, attachAlert) {
    const form = attachAlert ? `
      <div class="divider"></div>
      <div class="field"><label>${UI.esc(t("label.ivType"))}</label>
        <select id="ivType">${IV_TYPES.map((k) => `<option value="${k}">${UI.esc(t("ivtype." + k))}</option>`).join("")}</select></div>
      <div class="field"><textarea id="ivNotes" placeholder="${UI.esc(t("ph.ivNotes"))}"></textarea></div>
      <div class="field"><label>${UI.esc(t("label.ivStatus"))}</label>
        <select id="ivStatus">${["Planned", "Completed", "Follow-up needed"].map((s) => `<option value="${s}">${UI.esc(ivStatusVi(s))}</option>`).join("")}</select></div>
      <button class="btn btn-primary btn-sm" id="addIvBtn">${UI.esc(t("btn.logIv"))}</button>`
      : '<div class="muted-note">' + UI.esc(t("iv.needAlert")) + "</div>";
    const items = list.length ? `<div class="timeline" style="margin-bottom:6px">${list.map((iv) => `<div class="timeline-item">
        <div class="timeline-meta">${UI.fmtDate(iv.created_at, true)} · <span class="pill">${UI.esc(ivStatusVi(iv.status))}</span></div>
        <div><b>${UI.esc(ivTypeLabel(iv.action_type))}</b>${iv.notes ? " — " + UI.esc(iv.notes) : ""}</div></div>`).join("")}</div>` : "";
    return items + form;
  }

  // -------------------------------------------------- detail mutations
  async function saveCourseInline(courseId, student) {
    const course = (db.coursesBy[student.id] || []).find((c) => c.id === courseId);
    if (!course) return;
    const r = valOrNull($("sr_" + courseId).value), m = valOrNull($("sm_" + courseId).value), f = valOrNull($("sf_" + courseId).value);
    const g = GPA.computeCourse({ score_regular: r, score_midterm: m, score_final: f, weight_regular: course.weight_regular, weight_midterm: course.weight_midterm, weight_final: course.weight_final });
    const { error } = await sb.from("courses").update({ score_regular: r, score_midterm: m, score_final: f, total_score: g.total, letter_grade: g.letter, grade_point: g.point, updated_at: new Date().toISOString() }).eq("id", courseId);
    if (error) return UI.toast(error.message, "error");
    await sb.from("notifications").insert({ student_id: student.id, sender_id: me.id, type: "grade", title: t("notif.gradeTitle"), body: t("notif.gradeBody", { course: course.name }) });
    UI.toast(t("toast.gradeSaved"), "success");
    await loadCore(); await recompute(studentById(student.id)); renderStudentDetail(student.id);
  }

  async function addCourse(student) {
    const name = $("ncName").value.trim();
    if (!name) return UI.toast(t("toast.enterCourse"), "error");
    const r = valOrNull($("ncSr").value), m = valOrNull($("ncSm").value), f = valOrNull($("ncSf").value);
    const wr = GPA.numOr($("ncWr").value, 0.2), wm = GPA.numOr($("ncWm").value, 0.3), wf = GPA.numOr($("ncWf").value, 0.5);
    const g = GPA.computeCourse({ score_regular: r, score_midterm: m, score_final: f, weight_regular: wr, weight_midterm: wm, weight_final: wf });
    const { error } = await sb.from("courses").insert({
      student_id: student.id, code: $("ncCode").value.trim(), name, credits: parseInt($("ncCredits").value) || 3,
      semester: $("ncSemester").value.trim() || "—", academic_year: $("ncYear").value.trim(),
      weight_regular: wr, weight_midterm: wm, weight_final: wf,
      score_regular: r, score_midterm: m, score_final: f, total_score: g.total, letter_grade: g.letter, grade_point: g.point,
    });
    if (error) return UI.toast(error.message, "error");
    UI.toast(t("toast.courseAdded"), "success");
    await loadCore(); await recompute(studentById(student.id)); renderStudentDetail(student.id);
  }

  async function saveIndicators(student) {
    const att = GPA.numOr($("attRate").value, student.attendance_rate);
    const lms = GPA.numOr($("lmsScore").value, student.lms_activity_score);
    const { error } = await sb.from("profiles").update({ attendance_rate: att, lms_activity_score: lms }).eq("id", student.id);
    if (error) return UI.toast(error.message, "error");
    UI.toast(t("toast.indicators"), "success");
    await loadCore(); await recompute(studentById(student.id)); renderStudentDetail(student.id);
  }

  async function sendNotification(student) {
    const title = $("notifTitle").value.trim(), body = $("notifBody").value.trim();
    if (!title && !body) return UI.toast(t("toast.enterNotif"), "error");
    const { error } = await sb.from("notifications").insert({ student_id: student.id, sender_id: me.id, type: "message", title: title || t("notif.fromAdvisor"), body });
    if (error) return UI.toast(error.message, "error");
    UI.toast(t("toast.notifSent"), "success");
    $("notifTitle").value = ""; $("notifBody").value = "";
  }

  async function assignAlert(alertId, student) {
    const al = db.alerts.find((x) => x.id === alertId);
    const patch = { advisor_id: me.id };
    if (al && al.status === "Open") patch.status = "Acknowledged";
    const { error } = await sb.from("alerts").update(patch).eq("id", alertId);
    if (error) return UI.toast(error.message, "error");
    await loadCore(); renderStudentDetail(student.id);
  }

  async function setAlertStatus(alertId, status, student) {
    const patch = { status };
    if (status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await sb.from("alerts").update(patch).eq("id", alertId);
    if (error) return UI.toast(error.message, "error");
    UI.toast(t("toast.alertStatus"), "success");
    await loadCore(); renderStudentDetail(student.id);
  }

  async function addIntervention(attachAlert, student) {
    if (!attachAlert) return;
    const { error } = await sb.from("interventions").insert({
      alert_id: attachAlert.id, advisor_id: me.id,
      action_type: $("ivType").value, notes: $("ivNotes").value.trim(), status: $("ivStatus").value,
    });
    if (error) return UI.toast(error.message, "error");
    if (attachAlert.status === "Open") await sb.from("alerts").update({ status: "Acknowledged" }).eq("id", attachAlert.id);
    UI.toast(t("toast.ivLogged"), "success");
    await loadCore(); renderStudentDetail(student.id);
  }

  // =============================================================== ALERTS
  let alertStatusFilter = "Open";
  async function renderAlerts() {
    const opts = ["Open", "Acknowledged", "Resolved", "Dismissed", "All"];
    const list = db.alerts.filter((a) => alertStatusFilter === "All" || a.status === alertStatusFilter);
    view.innerHTML = `
      <div class="page-head"><div><div class="page-title">${UI.esc(t("adv.alertsTitle"))}</div><div class="page-sub">${UI.esc(t("adv.alertsSub"))}</div></div></div>
      <div class="toolbar"><div class="chips">${opts.map((o) => `<span class="chip ${alertStatusFilter === o ? "active" : ""}" data-st="${o}">${o === "All" ? UI.esc(t("status.All")) : UI.esc(statusVi(o))}</span>`).join("")}</div></div>
      <div class="card">${list.length ? `<table><thead><tr><th>${UI.esc(t("th.student"))}</th><th>${UI.esc(t("th.level"))}</th><th class="text-right">${UI.esc(t("th.score"))}</th><th>${UI.esc(t("th.status"))}</th><th>${UI.esc(t("th.handler"))}</th><th>${UI.esc(t("th.time"))}</th></tr></thead><tbody>
        ${list.map((al) => { const s = studentById(al.student_id); const adv = al.advisor_id === me.id ? t("you") : (al.advisor_id ? t("adv.otherAdvisor") : "—"); return `<tr class="row-link" data-id="${al.student_id}">
          <td><b>${s ? UI.esc(s.full_name) : "—"}</b><div class="muted-note">${s ? UI.esc(s.student_code || "") : ""}</div></td>
          <td>${UI.riskBadge(al.risk_level)}</td><td class="text-right mono">${al.score_at_alert}</td>
          <td><span class="pill ${al.status}">${UI.esc(statusVi(al.status))}</span></td><td>${UI.esc(adv)}</td>
          <td class="text-muted">${UI.fmtDate(al.created_at, true)}</td></tr>`; }).join("")}</tbody></table>`
        : '<div class="empty">' + UI.icon("bell", 30) + UI.esc(t("empty.noAlertsStatus")) + "</div>"}</div>`;
    view.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { alertStatusFilter = c.dataset.st; renderAlerts(); }));
    wireRows();
  }

  // ======================================================== INTERVENTIONS
  async function renderInterventions() {
    const { data } = await sb.from("interventions").select("*").order("created_at", { ascending: false });
    const list = data || [];
    const alertMap = {}; db.alerts.forEach((a) => (alertMap[a.id] = a));
    view.innerHTML = `
      <div class="page-head"><div><div class="page-title">${UI.esc(t("adv.ivTitle"))}</div><div class="page-sub">${UI.esc(t("adv.ivSub", { n: list.length }))}</div></div></div>
      <div class="card">${list.length ? `<table><thead><tr><th>${UI.esc(t("th.time"))}</th><th>${UI.esc(t("th.student"))}</th><th>${UI.esc(t("th.type"))}</th><th>${UI.esc(t("th.notes"))}</th><th>${UI.esc(t("th.status"))}</th></tr></thead><tbody>
        ${list.map((iv) => { const al = alertMap[iv.alert_id]; const s = al ? studentById(al.student_id) : null; return `<tr ${s ? `class="row-link" data-id="${s.id}"` : ""}>
          <td class="text-muted">${UI.fmtDate(iv.created_at, true)}</td><td>${s ? UI.esc(s.full_name) : "—"}</td>
          <td>${UI.esc(ivTypeLabel(iv.action_type))}</td><td class="text-muted">${UI.esc(iv.notes || "—")}</td>
          <td><span class="pill">${UI.esc(ivStatusVi(iv.status))}</span></td></tr>`; }).join("")}</tbody></table>`
        : '<div class="empty">' + UI.icon("notes", 30) + UI.esc(t("empty.noIv")) + "</div>"}</div>`;
    wireRows();
  }

  // ============================================================= MESSAGES
  async function renderMessages() {
    const { data } = await sb.from("messages").select("*").order("created_at", { ascending: true });
    const all = data || [];
    const threads = {};
    all.forEach((m) => { (threads[m.student_id] = threads[m.student_id] || []).push(m); });
    const threadIds = Object.keys(threads).sort((a, b) => {
      const la = threads[a][threads[a].length - 1].created_at, lb = threads[b][threads[b].length - 1].created_at;
      return la < lb ? 1 : -1;
    });
    if (!selectedThread && threadIds.length) selectedThread = threadIds[0];

    const listHtml = threadIds.length ? threadIds.map((sid) => {
      const s = studentById(sid); const msgs = threads[sid]; const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.sender_role === "student" && !m.is_read).length;
      return `<div class="notif ${sid === selectedThread ? "unread" : ""}" data-thread="${sid}" style="cursor:pointer">
        <div class="ni">${s ? UI.initials(s.full_name) : "?"}</div>
        <div style="flex:1"><div class="nt">${s ? UI.esc(s.full_name) : t("role.student")} ${unread ? `<span class="pill Open" style="padding:0 6px">${unread}</span>` : ""}</div>
        <div class="nb" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${UI.esc(last.body)}</div></div></div>`;
    }).join("") : '<div class="empty">' + UI.icon("message", 30) + UI.esc(t("empty.noMessages")) + "</div>";

    const cur = selectedThread ? threads[selectedThread] || [] : [];
    const curStudent = selectedThread ? studentById(selectedThread) : null;
    const chatHtml = selectedThread ? `<div class="chat" id="chat">${cur.map((m) => {
        const mine = m.sender_role !== "student";
        return `<div class="msg ${mine ? "msg-me" : "msg-them"}">${UI.esc(m.body)}<div class="mm">${mine ? UI.esc(t("you")) : (curStudent ? UI.esc(curStudent.full_name) : UI.esc(t("role.student")))} · ${UI.fmtDate(m.created_at, true)}</div></div>`;
      }).join("")}</div>
      <form class="msg-input" id="replyForm"><input type="text" id="replyInput" placeholder="${UI.esc(t("chat.phAdvisor"))}" autocomplete="off"><button class="btn btn-primary" type="submit">${UI.esc(t("btn.send"))}</button></form>`
      : '<div class="empty">' + UI.esc(t("adv.pickThread")) + "</div>";

    view.innerHTML = `
      <div class="page-head"><div><div class="page-title">${UI.esc(t("adv.msgTitle"))}</div><div class="page-sub">${UI.esc(t("adv.msgSub"))}</div></div></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><div class="card-title">${UI.esc(t("adv.conversations"))}</div></div>${listHtml}</div>
        <div class="card"><div class="card-head"><div class="card-title">${curStudent ? UI.esc(curStudent.full_name) : UI.esc(t("adv.conversation"))}</div></div>${chatHtml}</div>
      </div>`;

    view.querySelectorAll("[data-thread]").forEach((el) => (el.onclick = () => { selectedThread = el.dataset.thread; renderMessages(); }));
    if (selectedThread) {
      const unreadIds = cur.filter((m) => m.sender_role === "student" && !m.is_read).map((m) => m.id);
      if (unreadIds.length) { await sb.from("messages").update({ is_read: true }).in("id", unreadIds); db.msgUnread = Math.max(0, db.msgUnread - unreadIds.length); updateNavCounts(); }
    }
    const rf = $("replyForm");
    if (rf) rf.onsubmit = async (e) => {
      e.preventDefault();
      const body = $("replyInput").value.trim(); if (!body) return;
      $("replyInput").value = "";
      const { error } = await sb.from("messages").insert({ student_id: selectedThread, advisor_id: me.id, sender_id: me.id, sender_role: "advisor", body });
      if (error) { UI.toast(error.message, "error"); return; }
      await sb.from("notifications").insert({ student_id: selectedThread, sender_id: me.id, type: "message", title: t("notif.advReplyTitle"), body });
    };
  }

  // -------------------------------------------------------------- routing
  function setActive(route) { document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route)); }
  document.querySelectorAll("#nav a").forEach((a) => (a.onclick = () => (location.hash = a.dataset.route)));

  async function router() {
    const hash = (location.hash || "#dashboard").slice(1);
    const [route, arg] = hash.split("/");
    setActive(route === "student" ? "students" : route);
    view.innerHTML = '<div class="empty">' + UI.esc(t("loading")) + "</div>";
    if (route === "students") return renderStudents();
    if (route === "student") return renderStudentDetail(arg);
    if (route === "alerts") return renderAlerts();
    if (route === "interventions") return renderInterventions();
    if (route === "messages") return renderMessages();
    return renderDashboard();
  }
  window.onhashchange = router;

  // -------------------------------------------------------------- realtime
  function subscribe() {
    sb.channel("rt-adv-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        if (payload.new.sender_role === "student") { db.msgUnread++; updateNavCounts(); UI.toast(t("adv.toastNewMsg")); }
        if ((location.hash || "").indexOf("messages") >= 0) renderMessages();
      })
      .subscribe();
    sb.channel("rt-adv-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, async () => {
        await loadCore();
        const h = location.hash || "#dashboard";
        if (h.indexOf("alerts") >= 0) renderAlerts(); else if (h.indexOf("dashboard") >= 0 || h === "#") renderDashboard();
      })
      .subscribe();
  }

  // ------------------------------------------------------------------ boot
  await loadCore();
  await router();
  subscribe();
})();
