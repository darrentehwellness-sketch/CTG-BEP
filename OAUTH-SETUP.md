# AI Bookkeeper — OAuth Setup Guide

The 4 Supabase Edge Functions are **deployed and active**:

| Function | URL | Auth |
|---|---|---|
| `bk-xero-connect`   | `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-xero-connect`   | JWT required |
| `bk-xero-callback`  | `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-xero-callback`  | Public (verified via state token) |
| `bk-gdrive-connect` | `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-gdrive-connect` | JWT required |
| `bk-gdrive-callback`| `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-gdrive-callback`| Public (verified via state token) |

But they can't actually OAuth into Xero or Google until **you do two things**:

1. Register OAuth apps at Xero + Google
2. Set 7 Supabase Edge Function secrets

Takes about 10 minutes total. Step by step:

---

## Part 1 — Register a Xero developer app (5 min)

1. Go to <https://developer.xero.com/app/manage>
2. Click **New app**
3. Fill in:
   - **App name**: `CTG Finance Hub — AI Bookkeeper`
   - **Integration type**: **Web app**
   - **Company or application URL**: `https://ctg-financehub.com/` (or your GitHub Pages URL)
   - **OAuth 2.0 redirect URI**:
     ```
     https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-xero-callback
     ```
4. Click **Create app**
5. Open the new app → **Configuration** tab
6. Copy the **Client id**
7. Click **Generate a secret** → copy the **Client secret** (you'll only see it once)

> Xero apps are immediately usable in production — there's no review step for basic accounting scopes.

---

## Part 2 — Register a Google Cloud OAuth client (5 min)

1. Go to <https://console.cloud.google.com/>
2. Create a new project (or pick an existing one) called e.g. `ctg-bookkeeper`
3. In the left menu: **APIs & Services → Library**
   - Search **Google Drive API** → click **Enable**
4. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: `CTG Finance Hub`
   - User support email: your email
   - Authorised domains: `supabase.co`, `ctg-financehub.com`
   - Add scopes:
     - `.../auth/drive.file`
     - `.../auth/drive.readonly`
     - `openid`, `email`, `profile`
   - Save (status: **Testing** is fine for internal use; add your JV emails as test users)
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `CTG Bookkeeper`
   - **Authorised redirect URIs**:
     ```
     https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-gdrive-callback
     ```
   - Click **Create**
6. Copy the **Client ID** and **Client secret**

---

## Part 3 — Add 7 Supabase Edge Function secrets (2 min)

Go to <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/settings/functions>

Scroll to **Edge Function Secrets**, click **Add new secret**. Add these one by one:

| Secret name | Value |
|---|---|
| `XERO_CLIENT_ID` | (paste from Xero, step Part 1.6) |
| `XERO_CLIENT_SECRET` | (paste from Xero, step Part 1.7) |
| `XERO_REDIRECT_URI` | `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-xero-callback` |
| `GDRIVE_CLIENT_ID` | (paste from Google, step Part 2.6) |
| `GDRIVE_CLIENT_SECRET` | (paste from Google, step Part 2.6) |
| `GDRIVE_REDIRECT_URI` | `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-gdrive-callback` |
| `BK_OAUTH_STATE_SECRET` | Any random 32-byte string. Generate one with: `openssl rand -hex 32` |
| `BK_POST_AUTH_REDIRECT` | `https://ctg-financehub.com/` (or your custom domain — the URL the user lands on after auth) |

> No Edge Function redeploy needed — secrets are picked up on the next invocation.

---

## Part 4 — Test it (1 min)

1. Hard-refresh the CTG Finance Hub website (Ctrl+F5)
2. Sidebar → **AI Bookkeeper**
3. Pick an entity from the dropdown
4. Click **Connect Xero**
   - You'll be redirected to login.xero.com
   - Authorise the app + pick which Xero organisation to link
   - You'll be redirected back with a green "✅ Xero connected" toast
5. Click **Connect Drive**
   - You'll be redirected to accounts.google.com
   - Pick your Google account + grant Drive access
   - You'll be redirected back with a green "✅ Google Drive connected" toast

If anything fails, the toast tells you exactly which step (token exchange, state validation, DB save, etc.) so it's clear what to fix.

---

## Troubleshooting

**Toast says "Xero Edge Function is missing Supabase secrets"**
→ One of `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `BK_OAUTH_STATE_SECRET`, `BK_POST_AUTH_REDIRECT` isn't set. Double-check at the Supabase dashboard.

**Toast says "OAuth state token was invalid or expired"**
→ More than 10 minutes elapsed between clicking Connect and finishing the OAuth flow. Try again — it takes <30 sec normally.

**Toast says "Google didn't return a refresh token"**
→ You've already authorised this app before. Go to <https://myaccount.google.com/permissions>, remove "CTG Finance Hub" from the list, then retry Connect Drive.

**Toast says "redirect_uri_mismatch"**
→ The URI in the OAuth app config doesn't exactly match `https://msdfzzvdmmqzwcnxtrfn.supabase.co/functions/v1/bk-xero-callback`. URIs are case-sensitive and must include the protocol + trailing path with no trailing slash.

**Nothing happens when I click Connect Xero**
→ Open browser DevTools → Network tab → click Connect Xero → look for the `bk-xero-connect` request. The response body shows the exact error.

---

## What's next after these connections are live

The remaining 3 Edge Functions complete the "magic":

| Function | Purpose |
|---|---|
| `bk-ocr-extract` | Claude Vision reads uploaded PDFs/images → structured invoice data |
| `bk-categorise` | Claude assigns the right COA code per the entity's chart + past corrections |
| `bk-build-journal` | Claude builds the balanced double-entry record |
| `bk-xero-sync` | Pushes the journal entry to Xero |
| `bk-gdrive-import` | Pulls new files from your picked Drive folder + queues for OCR |

Once you confirm the Xero + Drive connections work, I'll deploy these next. Each is ~150 lines of Deno + Claude API code.

---

**CTG · Changing the Game · AI Bookkeeper OAuth Setup v1.0**
