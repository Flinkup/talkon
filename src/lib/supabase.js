import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'חסרים משתני סביבה של Supabase. ודא ש-VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY מוגדרים ב-.env',
  )
}

// A single shared client for the whole app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
