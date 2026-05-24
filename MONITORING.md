# CTG Finance Hub — Monitoring Setup Guide

This site is hosted on **GitHub Pages** (basically infinite uptime — Microsoft's CDN) with **Supabase** as the backend. The realistic failure modes:

1. Supabase project hits a quota / is paused.
2. A bad deploy ships a JavaScript error.
3. Users hit a slow query path.

This guide wires up three layers of observability:

| Layer | Tool | Cost | What it catches |
|---|---|---|---|
| 1. Frontend error tracking | **Sentry** (free) | $0 / 5k events/mo | Unhandled JS errors, perf slow-downs |
| 2. External uptime ping | **Better Uptime** (free) | $0 / 10 monitors | Site down, SSL cert expired, response > N sec |
| 3. Load testing | `scripts/loadtest.ps1` | $0 | Pre-deploy perf regression check |

---

## 1. Sentry — Frontend Error Tracking (10 min setup)

### Sign up
1. Go to <https://sentry.io/signup/> — free, no credit card.
2. Pick **"JavaScript → Browser"** as the platform.
3. Project name: `ctg-finance-hub`.

### Get the DSN
1. After project creation, you land on the "Get started" page.
2. Copy the **DSN** from the code snippet — it looks like:
   ```
   https://abc123def456@o4506xxx.ingest.us.sentry.io/4506xxx
   ```

### Paste it into config.js
Open `config.js` and fill in:
```js
SENTRY_DSN: 'https://abc123def456@o4506xxx.ingest.us.sentry.io/4506xxx',
SENTRY_ENVIRONMENT: 'production',
SENTRY_TRACES_RATE: 0.1
```

Commit + push:
```bash
git add config.js
git commit -m "Enable Sentry error tracking"
git push
```

### What gets captured
- ✅ Unhandled JS errors (`window.onerror`, unhandled promise rejections)
- ✅ Slow page loads + slow API requests (10% sample by default)
- ✅ Source maps for readable stack traces (Sentry inlines the bundle URL)
- ❌ **Never** user emails or payloads (scrubbed in `beforeSend` hook)

### Verify it works
1. After deploy, open browser DevTools console on the live site.
2. Run: `throw new Error('Sentry test error - safe to ignore')`
3. Within 30 seconds you'll see the error in your Sentry dashboard.

---

## 2. Better Uptime — External Ping (5 min setup)

Better Uptime pings your site from 12 global locations and pages you on Slack / email / SMS when it's down.

### Sign up
1. Go to <https://betteruptime.com/> — free tier: 10 monitors, 3-min check interval.
2. Sign in with Google.

### Create the monitor
1. Click **+ Monitor** → **HTTP / HTTPS**.
2. Configure:
   - **URL**: `https://ctg-financehub.com/` (or your GitHub Pages URL)
   - **Check interval**: 3 minutes (free tier)
   - **Request timeout**: 30 seconds
   - **Verify SSL**: ON
   - **Required status codes**: `200-299`
   - **Required content** (optional): `CTG Finance Hub` (matches page title)

### Create the Supabase API monitor
This catches Supabase-side outages even when GitHub Pages is up:
1. **+ Monitor** → **HTTP / HTTPS**.
2. **URL**: `https://msdfzzvdmmqzwcnxtrfn.supabase.co/auth/v1/health`
3. **Required status codes**: `200`
4. **Check interval**: 5 minutes.

### Alerts
1. Settings → Notifications → **Add channel**.
2. Pick Slack / Email / SMS / Telegram.
3. Free tier includes 50 SMS/month.

### Status page (optional, also free)
Better Uptime auto-creates a public status page (e.g. `ctg.betteruptime.com`) you can link from your footer for transparency with users.

### Alternative: Pingdom
If you prefer Pingdom (better UI, ~$15/mo Starter plan):
- Same setup as above; sign up at <https://www.pingdom.com/>.
- Use the same `/auth/v1/health` URL for the API check.
- The page-content check uses Pingdom's "Transaction monitor" feature.

---

## 3. Load Testing — Pre-Deploy Perf Check

A PowerShell script that hits Supabase with progressive concurrency and reports p50/p95/p99 latency.

### Run it
```powershell
PowerShell -ExecutionPolicy Bypass -File scripts\loadtest.ps1
```

Output looks like:
```
--- Endpoint: Auth health --- (GET /auth/v1/health)
  Concurrency   1 for 4s ... done.    25 req, p50  120ms, p95  141ms, p99  980ms
  Concurrency  10 for 8s ... done.   155 req, p50  531ms, p95  567ms, p99  675ms
  Concurrency  25 for 8s ... done.   172 req, p50 1310ms, p95 1428ms, p99 1434ms
  Concurrency  50 for 8s ... done.   196 req, p50 2691ms, p95 2732ms, p99 2756ms
```

### Interpret the numbers
- **p50** = half of all requests finish faster than this.
- **p95** = 95% of all requests finish faster than this — this is your "real worst case".
- **p99** = the slowest 1% — your tail latency.

### Baseline (recorded 2026-05-24)
| Concurrent users | p95 (Auth) | Status |
|---|---|---|
| 1 (idle) | 141ms | 🟢 Excellent |
| 10 (small team) | 567ms | 🟢 Acceptable |
| 25 (busy day) | 1428ms | 🟡 Slowing (rate limits kicking in) |
| 50 (DDoS scenario) | 2732ms | 🔴 Saturated |

The slowdown at 25+ concurrent is **expected** — Supabase deliberately throttles auth endpoints to prevent brute-force attacks. For a 6-user organization, this is non-issue.

### When to re-run
- After any DB migration that adds/changes RLS policies.
- After Supabase tier upgrade.
- Quarterly as part of routine ops.

---

## Layered alert flow (what to do when X breaks)

```
Better Uptime SMS → site is down
   ├─ GitHub Pages outage  → check https://www.githubstatus.com/
   ├─ Supabase outage      → check https://status.supabase.com/
   └─ DNS / cert            → check the Better Uptime detail panel

Sentry email → JS errors spiking
   ├─ See the stack trace, the release tag, and the URL
   ├─ Rollback via `git revert <commit> && git push`
   └─ Or hotfix forward + push

Load test p95 > 1500ms
   ├─ Run get_advisors via Supabase MCP
   ├─ Check if a new RLS policy is slow
   └─ Re-run after fix
```

---

## Costs at a glance

| Service | Tier you need | $/mo |
|---|---|---|
| GitHub Pages | Free | $0 |
| Supabase (current scale) | Free | $0 |
| Sentry | Developer (free) | $0 |
| Better Uptime | Free | $0 |
| **Total** | | **$0** |

You can run this stack for **zero dollars** until you hit serious scale. The first paid tier you'd hit is Supabase Pro ($25/mo) when you cross 500MB DB or 2GB bandwidth, which based on current usage is years away.

---

**Setup time**: 15 minutes total (10 Sentry + 5 Better Uptime). Once configured, you'll get paged before users notice problems.
