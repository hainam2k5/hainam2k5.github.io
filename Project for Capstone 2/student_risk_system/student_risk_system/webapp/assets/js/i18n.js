// =============================================================================
// Lightweight i18n (Vietnamese / English). No framework.
// - t(key, params) returns the string for the current language.
// - Switching language saves the choice and reloads, so every render picks it up.
// - apply(root) translates static [data-i18n] text and [data-i18n-ph] placeholders.
// =============================================================================
window.I18N = (function () {
  const DICT = {
    vi: {
      // brand / chrome
      "brand.name": "Cảnh báo Rủi ro Học tập", "brand.dss": "Academic Decision Support System",
      "brand.studentPortal": "Cổng sinh viên", "brand.studentSub": "Kết quả học tập & cảnh báo",
      "brand.advisorSub": "Bảng điều khiển cố vấn",
      "nav.section": "Điều hướng", "nav.dashboard": "Tổng quan", "nav.students": "Sinh viên",
      "nav.alerts": "Cảnh báo", "nav.interventions": "Can thiệp", "nav.messages": "Tin nhắn",
      "btn.logout": "Đăng xuất", "bell.title": "Thông báo", "loading": "Đang tải…",
      // roles / meta
      "role.student": "Sinh viên", "role.advisor": "Cố vấn", "role.manager": "Quản lý chương trình",
      "meta.advisor": "Cố vấn học tập", "you": "Bạn", "advisor": "Cố vấn",
      // risk levels
      "risk.Low": "Thấp", "risk.Medium": "Trung bình", "risk.High": "Cao", "risk.Critical": "Nghiêm trọng", "risk.Unscored": "Chưa chấm",
      // statuses
      "status.Open": "Mở", "status.Acknowledged": "Đang xử lý", "status.Resolved": "Đã xử lý", "status.Dismissed": "Bỏ qua", "status.All": "Tất cả",
      "iv.Planned": "Dự kiến", "iv.Completed": "Hoàn thành", "iv.Follow-up needed": "Cần theo dõi",
      "ivtype.advising": "Buổi tư vấn", "ivtype.callEmail": "Gọi điện / Email", "ivtype.studyPlan": "Kế hoạch học tập", "ivtype.referral": "Giới thiệu hỗ trợ", "ivtype.followup": "Theo dõi",
      // login
      "login.pageTitle": "Đăng nhập — Hệ thống Cảnh báo Rủi ro Học tập",
      "login.heroTitle": "Phát hiện sớm sinh viên gặp rủi ro học tập",
      "login.heroDesc": "Theo dõi kết quả học tập, chấm điểm rủi ro minh bạch và phối hợp can thiệp giữa cố vấn và sinh viên — theo thời gian thực.",
      "login.feat1": "Chấm điểm rủi ro minh bạch, giải thích theo từng yếu tố",
      "login.feat2": "Nhập điểm thành phần → tự tính GPA học kỳ & CPA",
      "login.feat3": "Thông báo và hỏi đáp cố vấn theo thời gian thực",
      "login.footer": "INS3282 · Capstone Project II — Academic DSS",
      "login.welcome": "Chào mừng trở lại", "login.welcomeSub": "Đăng nhập để tiếp tục vào hệ thống.",
      "login.configWarn": "Chưa cấu hình Supabase. Mở assets/js/config.js và điền SUPABASE_URL + anon key (xem README).",
      "login.tabLogin": "Đăng nhập", "login.tabRegister": "Đăng ký",
      "login.registerNote": "Đăng ký dành cho sinh viên. Tài khoản cố vấn do nhà trường cấp.",
      "form.email": "Email", "form.password": "Mật khẩu", "form.passwordMin": "Mật khẩu (tối thiểu 6 ký tự)",
      "form.fullName": "Họ và tên", "form.studentCode": "Mã sinh viên", "form.cohort": "Khóa", "form.program": "Ngành",
      "login.btnLogin": "Đăng nhập", "login.btnRegister": "Tạo tài khoản",
      "login.demoHint": "<b>Tài khoản demo</b> (đăng ký bằng đúng email này để nhận dữ liệu mẫu):<br>Cố vấn: <b>advisor@demo.edu.vn</b> · Sinh viên: <b>sv002@demo.edu.vn</b> / <b>sv004@demo.edu.vn</b><br>Mật khẩu gợi ý: <b>Demo@12345</b>",
      "toast.notConfigured": "Chưa cấu hình Supabase", "toast.signupDone": "Đã tạo tài khoản. Nếu bật xác nhận email, hãy kiểm tra hộp thư rồi đăng nhập.",
      // student portal
      "student.hello": "Xin chào, {name}", "student.helloDefault": "bạn",
      "kpi.cpa": "CPA (hệ 4)", "kpi.gpaLatest": "GPA học kỳ gần nhất", "kpi.creditsAccum": "Tín chỉ tích lũy", "kpi.failedF": "Môn chưa đạt (F)",
      "card.transcript": "Bảng điểm theo học kỳ", "card.transcriptSub": "Chỉ xem — điểm do cố vấn nhập",
      "card.notifications": "Thông báo", "btn.markAllRead": "Đọc hết",
      "card.qa": "Hỏi đáp với cố vấn", "chat.phStudent": "Nhập câu hỏi gửi cố vấn…", "btn.send": "Gửi",
      "banner.critTitle": "Kết quả học tập đang ở mức báo động",
      "banner.cpaNow": "CPA hiện tại {cpa}", "banner.failedPart": ", có {n} môn chưa đạt",
      "banner.contactSoon": ". Hãy liên hệ cố vấn học tập sớm để được hỗ trợ.",
      "banner.medTitle": "Kết quả cần lưu ý", "banner.improve": ". Bạn nên trao đổi với cố vấn để cải thiện.",
      "empty.noGrades": "Chưa có điểm nào được nhập.",
      "th.course": "Môn học", "th.cr": "TC", "th.reg": "TX", "th.mid": "GK", "th.final": "CK", "th.total": "Tổng", "th.grade": "Điểm chữ",
      "sem.label": "Học kỳ {sem}", "sem.gpa": "GPA kỳ:", "sem.credits": "tín chỉ",
      "empty.noNotif": "Chưa có thông báo.", "student.noAdvisor": "Chưa có cố vấn phụ trách",
      "empty.noChat": "Chưa có trao đổi nào.", "student.notAssigned": "Bạn chưa được phân công cố vấn.",
      "student.chatNote": "Cố vấn sẽ nhận sinh viên phụ trách trước khi có thể trao đổi.",
      "toast.gradesUpdated": "Bảng điểm vừa được cập nhật", "toast.newNotif": "Thông báo mới: {title}", "toast.advisorReplied": "Cố vấn vừa trả lời",
      // advisor console
      "adv.dashTitle": "Tổng quan", "adv.dashSub": "Giám sát rủi ro học tập & can thiệp", "btn.recalc": "Tính lại rủi ro",
      "kpi.totalStudents": "Tổng sinh viên", "kpi.openAlerts": "Cảnh báo đang mở", "kpi.highCrit": "Rủi ro cao / nghiêm trọng", "kpi.avgCpa": "CPA trung bình",
      "card.topRisk": "Sinh viên rủi ro cao nhất", "link.seeAll": "Xem tất cả →", "card.recentAlerts": "Cảnh báo gần đây",
      "th.student": "Sinh viên", "th.studentId": "Mã SV", "th.riskScore": "Điểm rủi ro", "th.level": "Mức", "th.alert": "Cảnh báo",
      "th.score": "Điểm", "th.status": "Trạng thái", "th.time": "Thời gian", "th.handler": "Phụ trách", "th.type": "Hình thức", "th.notes": "Ghi chú",
      "empty.noStudents": "Không có sinh viên phù hợp.", "empty.noAlerts": "Chưa có cảnh báo nào.",
      "toast.recalcAll": "Đã tính lại rủi ro toàn bộ",
      "adv.studentsTitle": "Sinh viên", "adv.studentsSub": "{n} sinh viên", "ph.search": "Tìm theo tên hoặc mã SV…",
      "adv.addStudent": "Thêm sinh viên", "toast.studentAdded": "Đã thêm sinh viên", "toast.enterName": "Nhập họ tên sinh viên",
      "adv.addStudentHint": "Điền email trùng với email sinh viên sẽ dùng để đăng ký — khi các em đăng nhập sẽ tự nhận đúng hồ sơ này.",
      "adv.notFound": "Không tìm thấy sinh viên.", "adv.back": "← Danh sách sinh viên", "adv.riskScoreLabel": "Điểm rủi ro:",
      "banner.openTitle": "Đang có cảnh báo mở — mức {level}", "banner.openBody": "Mở lúc {time}. Hãy ghi nhận can thiệp và cập nhật trạng thái.",
      "kpi.gpaLatestShort": "GPA kỳ gần nhất", "kpi.creditsShort": "Tín chỉ tích lũy",
      "card.gradeEntry": "Nhập / sửa điểm", "card.gradeEntrySub": "TX·GK·CK (0–10) → tự tính điểm chữ & GPA",
      "card.addCourse": "Thêm môn học", "card.riskFactors": "Yếu tố rủi ro", "card.indicators": "Chỉ số theo dõi",
      "label.attendance": "Tỷ lệ đi học (%)", "label.lms": "Hoạt động LMS (0–100)", "btn.saveRecalc": "Lưu & tính lại rủi ro",
      "card.alert": "Cảnh báo", "card.intervention": "Can thiệp", "card.sendNotif": "Gửi thông báo cho sinh viên",
      "ph.notifTitle": "Tiêu đề", "ph.notifBody": "Nội dung thông báo…", "btn.sendNotif": "Gửi thông báo",
      "empty.noCourses": "Chưa có môn học. Thêm môn bên dưới.",
      "th.courseShort": "Môn", "th.gradeShort": "Chữ", "btn.save": "Lưu",
      "label.courseCode": "Mã môn", "label.courseName": "Tên môn", "label.credits": "Tín chỉ", "label.semester": "Học kỳ", "label.year": "Năm học",
      "label.wReg": "Trọng số TX", "label.wMid": "Trọng số GK", "label.wFin": "Trọng số CK",
      "label.sReg": "Điểm TX", "label.sMid": "Điểm GK", "label.sFin": "Điểm CK",
      "btn.addCourse": "Thêm môn", "note.weights": "Tổng trọng số nên bằng 1.0. Có thể để trống điểm nếu chưa có.",
      "factor.noData": "Chưa đủ dữ liệu để chấm rủi ro.",
      "factor.gpa": "GPA thấp", "factor.att": "Điểm danh", "factor.lms": "Hoạt động LMS", "factor.fail": "Môn trượt",
      "factor.summary": "Điểm rủi ro tổng = {score}/100 · Cập nhật {time}",
      "alerts.none": "Chưa có cảnh báo cho sinh viên này.", "adv.youHandle": "Bạn phụ trách", "btn.take": "Nhận",
      "label.ivType": "Hình thức", "ph.ivNotes": "Ghi chú buổi can thiệp…", "label.ivStatus": "Trạng thái",
      "btn.logIv": "Ghi nhận can thiệp", "iv.needAlert": "Cần có cảnh báo trước khi ghi nhận can thiệp.",
      "toast.gradeSaved": "Đã lưu điểm & thông báo sinh viên", "notif.gradeTitle": "Cập nhật điểm", "notif.gradeBody": "Cố vấn đã cập nhật điểm môn {course}.",
      "toast.enterCourse": "Nhập tên môn học", "toast.courseAdded": "Đã thêm môn học", "toast.indicators": "Đã cập nhật chỉ số",
      "toast.enterNotif": "Nhập nội dung thông báo", "notif.fromAdvisor": "Thông báo từ cố vấn", "toast.notifSent": "Đã gửi thông báo",
      "toast.alertStatus": "Đã cập nhật trạng thái cảnh báo", "toast.ivLogged": "Đã ghi nhận can thiệp",
      "alert.autoTitle": "Cảnh báo kết quả học tập", "alert.autoBody": "Điểm của bạn đang ở mức {level}. Hãy liên hệ cố vấn học tập để được hỗ trợ.",
      "adv.alertsTitle": "Cảnh báo", "adv.alertsSub": "Quản lý & phân công xử lý", "adv.otherAdvisor": "Cố vấn khác", "empty.noAlertsStatus": "Không có cảnh báo ở trạng thái này.",
      "adv.ivTitle": "Can thiệp", "adv.ivSub": "{n} bản ghi", "empty.noIv": "Chưa có can thiệp nào được ghi nhận.",
      "adv.msgTitle": "Tin nhắn", "adv.msgSub": "Hỏi đáp với sinh viên", "adv.conversations": "Hội thoại", "empty.noMessages": "Chưa có tin nhắn.",
      "adv.conversation": "Trao đổi", "chat.phAdvisor": "Trả lời sinh viên…", "adv.pickThread": "Chọn một hội thoại để trả lời.",
      "notif.advReplyTitle": "Cố vấn trả lời", "adv.toastNewMsg": "Sinh viên vừa nhắn tin",
    },
    en: {
      "brand.name": "Academic Risk Alert", "brand.dss": "Academic Decision Support System",
      "brand.studentPortal": "Student Portal", "brand.studentSub": "Grades & alerts",
      "brand.advisorSub": "Advisor console",
      "nav.section": "Navigation", "nav.dashboard": "Overview", "nav.students": "Students",
      "nav.alerts": "Alerts", "nav.interventions": "Interventions", "nav.messages": "Messages",
      "btn.logout": "Sign out", "bell.title": "Notifications", "loading": "Loading…",
      "role.student": "Student", "role.advisor": "Advisor", "role.manager": "Programme manager",
      "meta.advisor": "Academic advisor", "you": "You", "advisor": "Advisor",
      "risk.Low": "Low", "risk.Medium": "Medium", "risk.High": "High", "risk.Critical": "Critical", "risk.Unscored": "Unscored",
      "status.Open": "Open", "status.Acknowledged": "In progress", "status.Resolved": "Resolved", "status.Dismissed": "Dismissed", "status.All": "All",
      "iv.Planned": "Planned", "iv.Completed": "Completed", "iv.Follow-up needed": "Follow-up needed",
      "ivtype.advising": "Advising meeting", "ivtype.callEmail": "Call / Email", "ivtype.studyPlan": "Study plan", "ivtype.referral": "Support referral", "ivtype.followup": "Follow-up",
      "login.pageTitle": "Sign in — Academic Risk Alert System",
      "login.heroTitle": "Spot at-risk students early",
      "login.heroDesc": "Track academic performance, score risk transparently, and coordinate interventions between advisors and students — in real time.",
      "login.feat1": "Transparent risk scoring, explained factor by factor",
      "login.feat2": "Enter component scores → auto semester GPA & CPA",
      "login.feat3": "Real-time notifications and advisor Q&A",
      "login.footer": "INS3282 · Capstone Project II — Academic DSS",
      "login.welcome": "Welcome back", "login.welcomeSub": "Sign in to continue.",
      "login.configWarn": "Supabase is not configured. Open assets/js/config.js and fill in SUPABASE_URL + anon key (see README).",
      "login.tabLogin": "Sign in", "login.tabRegister": "Register",
      "login.registerNote": "Registration is for students. Advisor accounts are provisioned by the school.",
      "form.email": "Email", "form.password": "Password", "form.passwordMin": "Password (at least 6 characters)",
      "form.fullName": "Full name", "form.studentCode": "Student ID", "form.cohort": "Cohort", "form.program": "Programme",
      "login.btnLogin": "Sign in", "login.btnRegister": "Create account",
      "login.demoHint": "<b>Demo accounts</b> (register with the exact email to inherit sample data):<br>Advisor: <b>advisor@demo.edu.vn</b> · Students: <b>sv002@demo.edu.vn</b> / <b>sv004@demo.edu.vn</b><br>Suggested password: <b>Demo@12345</b>",
      "toast.notConfigured": "Supabase is not configured", "toast.signupDone": "Account created. If email confirmation is on, check your inbox then sign in.",
      "student.hello": "Hello, {name}", "student.helloDefault": "there",
      "kpi.cpa": "CPA (4.0)", "kpi.gpaLatest": "Latest semester GPA", "kpi.creditsAccum": "Cumulative credits", "kpi.failedF": "Failed courses (F)",
      "card.transcript": "Transcript by semester", "card.transcriptSub": "View only — entered by advisor",
      "card.notifications": "Notifications", "btn.markAllRead": "Mark all read",
      "card.qa": "Q&A with advisor", "chat.phStudent": "Type a question to your advisor…", "btn.send": "Send",
      "banner.critTitle": "Your academic results are at an alarming level",
      "banner.cpaNow": "Current CPA {cpa}", "banner.failedPart": ", {n} failed course(s)",
      "banner.contactSoon": ". Please contact your academic advisor soon for support.",
      "banner.medTitle": "Results need attention", "banner.improve": ". You should talk with your advisor to improve.",
      "empty.noGrades": "No grades entered yet.",
      "th.course": "Course", "th.cr": "Cr", "th.reg": "Reg", "th.mid": "Mid", "th.final": "Final", "th.total": "Total", "th.grade": "Grade",
      "sem.label": "Semester {sem}", "sem.gpa": "Semester GPA:", "sem.credits": "credits",
      "empty.noNotif": "No notifications.", "student.noAdvisor": "No advisor assigned",
      "empty.noChat": "No conversation yet.", "student.notAssigned": "You have no advisor assigned yet.",
      "student.chatNote": "An advisor must take you on before you can chat.",
      "toast.gradesUpdated": "Your grades were updated", "toast.newNotif": "New notification: {title}", "toast.advisorReplied": "Your advisor replied",
      "adv.dashTitle": "Overview", "adv.dashSub": "Monitor academic risk & interventions", "btn.recalc": "Recompute risk",
      "kpi.totalStudents": "Total students", "kpi.openAlerts": "Open alerts", "kpi.highCrit": "High / critical risk", "kpi.avgCpa": "Average CPA",
      "card.topRisk": "Highest-risk students", "link.seeAll": "See all →", "card.recentAlerts": "Recent alerts",
      "th.student": "Student", "th.studentId": "ID", "th.riskScore": "Risk score", "th.level": "Level", "th.alert": "Alert",
      "th.score": "Score", "th.status": "Status", "th.time": "Time", "th.handler": "Handler", "th.type": "Type", "th.notes": "Notes",
      "empty.noStudents": "No matching students.", "empty.noAlerts": "No alerts yet.",
      "toast.recalcAll": "Recomputed risk for all students",
      "adv.studentsTitle": "Students", "adv.studentsSub": "{n} students", "ph.search": "Search by name or ID…",
      "adv.addStudent": "Add student", "toast.studentAdded": "Student added", "toast.enterName": "Enter the student's name",
      "adv.addStudentHint": "Use the same email the student will register with — signing up with that email links them to this profile.",
      "adv.notFound": "Student not found.", "adv.back": "← Back to students", "adv.riskScoreLabel": "Risk score:",
      "banner.openTitle": "Open alert — {level} level", "banner.openBody": "Opened {time}. Log an intervention and update the status.",
      "kpi.gpaLatestShort": "Latest semester GPA", "kpi.creditsShort": "Cumulative credits",
      "card.gradeEntry": "Enter / edit grades", "card.gradeEntrySub": "Reg·Mid·Final (0–10) → auto letter & GPA",
      "card.addCourse": "Add course", "card.riskFactors": "Risk factors", "card.indicators": "Monitoring indicators",
      "label.attendance": "Attendance (%)", "label.lms": "LMS activity (0–100)", "btn.saveRecalc": "Save & recompute risk",
      "card.alert": "Alert", "card.intervention": "Intervention", "card.sendNotif": "Send notification to student",
      "ph.notifTitle": "Title", "ph.notifBody": "Notification content…", "btn.sendNotif": "Send notification",
      "empty.noCourses": "No courses yet. Add one below.",
      "th.courseShort": "Course", "th.gradeShort": "Grade", "btn.save": "Save",
      "label.courseCode": "Course code", "label.courseName": "Course name", "label.credits": "Credits", "label.semester": "Semester", "label.year": "Academic year",
      "label.wReg": "Weight Reg", "label.wMid": "Weight Mid", "label.wFin": "Weight Final",
      "label.sReg": "Reg score", "label.sMid": "Mid score", "label.sFin": "Final score",
      "btn.addCourse": "Add course", "note.weights": "Weights should sum to 1.0. Scores may be left blank.",
      "factor.noData": "Not enough data to score risk.",
      "factor.gpa": "Low GPA", "factor.att": "Attendance", "factor.lms": "LMS activity", "factor.fail": "Failed courses",
      "factor.summary": "Total risk score = {score}/100 · Updated {time}",
      "alerts.none": "No alerts for this student.", "adv.youHandle": "You handle this", "btn.take": "Take",
      "label.ivType": "Type", "ph.ivNotes": "Intervention notes…", "label.ivStatus": "Status",
      "btn.logIv": "Log intervention", "iv.needAlert": "An alert is required before logging an intervention.",
      "toast.gradeSaved": "Grade saved & student notified", "notif.gradeTitle": "Grade updated", "notif.gradeBody": "Your advisor updated the grade for {course}.",
      "toast.enterCourse": "Enter a course name", "toast.courseAdded": "Course added", "toast.indicators": "Indicators updated",
      "toast.enterNotif": "Enter notification content", "notif.fromAdvisor": "Message from advisor", "toast.notifSent": "Notification sent",
      "toast.alertStatus": "Alert status updated", "toast.ivLogged": "Intervention logged",
      "alert.autoTitle": "Academic performance alert", "alert.autoBody": "Your results are at {level} level. Please contact your academic advisor for support.",
      "adv.alertsTitle": "Alerts", "adv.alertsSub": "Manage & assign handling", "adv.otherAdvisor": "Another advisor", "empty.noAlertsStatus": "No alerts in this status.",
      "adv.ivTitle": "Interventions", "adv.ivSub": "{n} records", "empty.noIv": "No interventions logged yet.",
      "adv.msgTitle": "Messages", "adv.msgSub": "Q&A with students", "adv.conversations": "Conversations", "empty.noMessages": "No messages.",
      "adv.conversation": "Conversation", "chat.phAdvisor": "Reply to the student…", "adv.pickThread": "Select a conversation to reply.",
      "notif.advReplyTitle": "Advisor replied", "adv.toastNewMsg": "A student sent a message",
    },
  };

  let lang = localStorage.getItem("lang") || "vi";
  if (lang !== "vi" && lang !== "en") lang = "vi";

  function t(key, params) {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.vi[key] || key;
    if (params) for (const k in params) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), params[k]);
    return s;
  }
  function set(newLang) {
    if (newLang === lang) return;
    localStorage.setItem("lang", newLang);
    location.reload();
  }
  function locale() { return lang === "en" ? "en-GB" : "vi-VN"; }

  // Translate static markup. Preserves any leading icon (svg) already present.
  function apply(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
      const svg = el.querySelector(":scope > svg");
      el.textContent = t(el.getAttribute("data-i18n"));
      if (svg) el.insertBefore(svg, el.firstChild);
    });
    (root || document).querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    (root || document).querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
    if (document.documentElement) document.documentElement.lang = lang;
  }

  // A small VI | EN segmented switch. Call mount(el) with a container.
  function mount(container) {
    if (!container) return;
    container.className = "lang-switch";
    container.innerHTML =
      '<button type="button" data-l="vi"' + (lang === "vi" ? ' class="active"' : "") + ">VI</button>" +
      '<button type="button" data-l="en"' + (lang === "en" ? ' class="active"' : "") + ">EN</button>";
    container.querySelectorAll("button").forEach((b) => (b.onclick = () => set(b.dataset.l)));
  }

  return { get lang() { return lang; }, t, set, locale, apply, mount };
})();
