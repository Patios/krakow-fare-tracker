import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Same public project as Copy Paster. This is the publishable key: row access
// still requires a signed-in user and the policies in supabase/schema.sql.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bdzlbaaxvihopilipldx.supabase.co";
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_dgoHH0uf80Io6p6LgrofYQ_kvUly0ng";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !url || !publishableKey) return null;
  if (!client) {
    client = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export function authRedirectTo(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${base}/`;
}
