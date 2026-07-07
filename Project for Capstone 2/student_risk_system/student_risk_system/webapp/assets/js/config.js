// =============================================================================
// Supabase connection config.
//
// 1. Create a free project at https://supabase.com
// 2. Project Settings → API → copy "Project URL" and the "anon public" key
// 3. Paste them below and save.
//
// The anon key is SAFE to expose in the browser — Row Level Security in
// schema.sql protects your data. NEVER paste the service_role key here.
// =============================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-ref.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
};
