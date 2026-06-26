import { createClient } from '@supabase/supabase-js';

// Anon key is safe on the client; RLS is the real security boundary.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // Fail loud in dev so a missing .env is obvious, not a mystery blank screen.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See .env.example.');
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: { persistSession: true, autoRefreshToken: true }
});
