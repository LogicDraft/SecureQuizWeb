import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://qhbolldymcvjqjfneipv.supabase.co";
// 🛡️ SECURITY NOTE: It is 100% safe to expose the SUPABASE_ANON_KEY in your frontend code 
// AS LONG AS your database tables have Row Level Security (RLS) enabled.
// We have properly secured the database with strict RLS policies in `supabase-schema.sql`.
const SUPABASE_ANON_KEY = "sb_publishable_uMVDzo8aYaUrFXdPjrar2g_Fd1Ln-yD";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function isSupabaseConfigured() {
  const values = [SUPABASE_URL, SUPABASE_ANON_KEY];
  if (values.some((value) => !value || typeof value !== "string")) return false;
  return values.every((value) => !/^YOUR_/i.test(value));
}

export { supabase, isSupabaseConfigured, SUPABASE_URL };
