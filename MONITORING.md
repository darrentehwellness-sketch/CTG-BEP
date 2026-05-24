# CTG Finance Hub — Monitoring (Zero-Setup Version)

You don't need to sign up for anything. The site already monitors itself:

| Layer | Where | Setup needed? |
|---|---|---|
| 1. JS errors | Activity Log tab → filter `⚠ JavaScript error` | ✅ **None — already wired** |
| 2. User actions | Activity Log tab | ✅ **None — already wired** |
| 3. Session timeouts | Activity Log tab → filter `Session timeout` | ✅ **None — already wired** |
| 4. DB performance | Supabase Dashboard → Database → Performance | ✅ **None — built into Supabase** |

That's it. Open the **Activity Log** tab as admin and you'll see:
- ⚠ Every JavaScript error that fired in any user's browser
- 📝 Every save / edit / delete
- 🔐 Every sign-in
- ⏰ Every auto-logout
- 📦 Every migration / data import

---

## How JS error capture works

When any JavaScript error fires in a signed-in user's browser:

1. `window.addEventListener('error', ...)` catches it.
2. `CTG.logActivity('js_error', { metadata: { msg, file, line, stack, ua } })` writes to `activity_log`.
3. You see it in the Activity Log tab (filter action = `⚠ JavaScript error`).

**Built-in safety:**
- Rate-limited: max 1 error logged every 5 seconds.
- Capped at 30 errors per session (prevents flooding if something loops).
- Cross-origin "Script error." messages (no useful info) are filtered out.
- Only signed-in users — anonymous errors aren't logged (can't write to activity_log without auth).

**Privacy:**
- Only stack trace + filename + line number + user-agent are stored.
- **Never** scenario data, supplier names, or anything else from the page.

---

## Daily admin check (60 seconds)

1. Open the site as admin.
2. Sidebar → **Activity Log**.
3. Filter `⚠ JavaScript error` over the last 7 days.
4. If empty → all good 👍.
5. If something shows → click "Details" to see the stack trace, share with me.

---

## Bonus: pre-deploy load test (optional)

If you ever want to test the backend can handle a busy day:

```powershell
PowerShell -ExecutionPolicy Bypass -File scripts\loadtest.ps1
```

Baseline numbers (recorded 2026-05-24):
- 1 user idle: **141ms** ✓
- 10 concurrent: **567ms** ✓
- Your team is 6 people max → comfortably in the green zone.

---

## If you ever decide you want external monitoring later

The Sentry hook is already in `config.js` — just paste a DSN to activate. No code changes needed. But honestly, the in-app Activity Log is sufficient for a 6-user team — Sentry's main value is for apps with thousands of users where errors slip past testing.

The same applies to Better Uptime / Pingdom: useful if customers complain "the site is down", but with 6 internal users, **they'll tell you directly** the moment something breaks. External uptime alerts are overkill at this scale.

---

## TL;DR

You already have monitoring. It's the **Activity Log** tab. Filter `⚠ JavaScript error` to see if anything's broken. No external accounts, no DSNs, no SaaS to manage.
