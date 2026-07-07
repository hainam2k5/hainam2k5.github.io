// =============================================================================
// Supabase client + auth helpers + page guards. Loaded on every page.
// Depends on: the supabase-js UMD bundle (window.supabase) and config.js.
// =============================================================================
window.App = (function () {
  const configured =
    window.APP_CONFIG &&
    APP_CONFIG.SUPABASE_URL &&
    APP_CONFIG.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
    APP_CONFIG.SUPABASE_ANON_KEY.indexOf("YOUR-ANON") === -1;

  let sb = null;
  if (window.supabase && configured) {
    sb = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function signUp(payload) {
    return sb.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.full_name || "",
          role: payload.role || "student",
          student_code: payload.student_code || "",
          program: payload.program || "",
          cohort: payload.cohort || "",
        },
      },
    });
  }

  async function signIn(email, password) {
    return sb.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    if (sb) await sb.auth.signOut();
    location.href = "index.html";
  }

  async function getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function getMyProfile() {
    if (!sb) return null;
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return null;
    const { data, error } = await sb.from("profiles").select("*").eq("user_id", u.user.id).maybeSingle();
    if (error) { console.error("getMyProfile", error); return null; }
    return data;
  }

  // Redirect to login if not configured / not signed in; redirect to the right
  // home if role mismatches. Returns the caller's profile on success.
  async function requireRole(role) {
    if (!configured) { location.href = "index.html"; return null; }
    const session = await getSession();
    if (!session) { location.href = "index.html"; return null; }

    const profile = await getMyProfile();
    if (!profile) {
      alert("Tài khoản chưa gắn hồ sơ trong hệ thống. Vui lòng liên hệ cố vấn/quản trị.");
      await sb.auth.signOut();
      location.href = "index.html";
      return null;
    }

    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(profile.role)) {
      location.href = profile.role === "student" ? "student.html" : "advisor.html";
      return null;
    }
    return profile;
  }

  function homeFor(role) { return role === "student" ? "student.html" : "advisor.html"; }

  return { get sb() { return sb; }, configured, signUp, signIn, signOut, getSession, getMyProfile, requireRole, homeFor };
})();
