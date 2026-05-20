/* ============================================================
   CTG BEP Calculator — Public config
   1. Copy this file to config.js
   2. Fill in your Supabase project URL and ANON (public) key
   3. The anon key is safe to expose publicly; Row Level Security
      in supabase/schema.sql controls who can read/write what.
   Get these from: Supabase Dashboard → Project Settings → API
   ============================================================ */
window.CTG_CONFIG = {
  SUPABASE_URL:      'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-PUBLIC-ANON-KEY'
};
