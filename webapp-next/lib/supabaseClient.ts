import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// True when real Supabase credentials are provided via env vars.
export const configured =
  !!url && !!anon && !url.includes("YOUR-PROJECT") && !anon.includes("YOUR-ANON");

// The browser client. Null when not configured (pages then show a config hint).
export const supabase: SupabaseClient | null = configured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function homeFor(role: string | undefined | null): string {
  if (role === "student") return "/student";
  if (role === "teacher") return "/teacher";
  return "/advisor";
}

export async function getMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u || !u.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (error) {
    console.error("getMyProfile", error);
    return null;
  }
  return (data as Profile) || null;
}
