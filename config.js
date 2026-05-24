/* ============================================================
   CTG BEP Calculator — Public config
   Pre-filled for project: CTG Group_Break-Even Calculator
   (Supabase ref: msdfzzvdmmqzwcnxtrfn, region ap-southeast-2)

   This file is in .gitignore by default. If you want everyone using
   this repo to share the same Supabase project, delete `config.js`
   from .gitignore — the publishable key below is safe to publish.
   ============================================================ */
window.CTG_CONFIG = {
  SUPABASE_URL:      'https://msdfzzvdmmqzwcnxtrfn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_me0hUg0CqBfg12-Fpx4rzg_EL05d0Lx',

  /* ============================================================
     Sentry — error tracking + perf monitoring (optional)
     ────────────────────────────────────────────────────────────
     Leave blank to disable. To enable:
       1. Sign up at https://sentry.io (free tier: 5k errors/mo)
       2. Create a project (platform: "JavaScript / Browser")
       3. Copy the DSN from Project Settings → Client Keys
       4. Paste below + commit + push.
     See MONITORING.md for full setup walkthrough.
     ============================================================ */
  SENTRY_DSN:         '',                  // e.g. 'https://abc123@o4506...ingest.sentry.io/4506...'
  SENTRY_ENVIRONMENT: 'production',        // 'staging' / 'production'
  SENTRY_TRACES_RATE: 0.1                  // 0.0–1.0 — fraction of requests sampled for perf monitoring
};
