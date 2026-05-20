# CTG Exhibition Break-Even Calculator

A bilingual (EN / 中文) web app for planning exhibition budgets, tracking fixed / variable / product costs, and computing break-even points in real time.

Hosted as a static site on **GitHub Pages**. Optional email + password sign-in with cloud-synced scenarios via **Supabase**. No server code, no third-party OAuth setup.

---

## What's in this folder

```
index.html                  → main app
config.example.js           → template for Supabase URL + anon key
config.js                   → your real keys (gitignored by default)
assets/
  img/ctg_logo.png          → CTG brand logo
  js/supabase-client.js     → auth + scenario CRUD wrapper
supabase/
  schema.sql                → run once in your Supabase project
.nojekyll                   → tells GitHub Pages to serve files as-is
robots.txt                  → SEO
README.md                   → you are here
```

Without `config.js` filled in, the site still works — it falls back to **offline mode** (scenarios stored in your browser's localStorage only).

---

## Setup — 10 minutes

You'll do three things:

1. **Supabase** — create a free project + database (5 min)
2. **Auth config** — verify email auth is on, set URLs (2 min)
3. **GitHub Pages** — push this folder + enable Pages (3 min)

### 1. Create your Supabase project

1. Go to **<https://supabase.com>** and sign up (free tier).
2. Click **New Project**. Pick a name (e.g. `ctg-bep`), a database password (save it somewhere), and a region close to your users (Singapore for Malaysia/SEA).
3. Wait ~2 minutes for the project to provision.
4. In the left sidebar, open **SQL Editor → New query**.
5. Paste the entire contents of `supabase/schema.sql` and click **Run**. You should see `Success. No rows returned`.
6. Verify in **Table Editor** that a `scenarios` table now exists.

> **Note:** The `scenarios` table is the calculator's own storage — it holds each saved scenario as a JSONB snapshot of the calculator state, with one row per (user, scenario). It's intentionally separate from any other tables you may have in this project (e.g. multi-tenant `tenants` / `events` / `products` schemas). The calculator only reads and writes `public.scenarios`; nothing else is touched.

### 2. Configure email + password auth

Good news: **email auth is enabled by default** in every new Supabase project. There's no Google Cloud Console, no OAuth app — just check the settings.

1. In Supabase, go to **Authentication → Providers → Email**.
   - Confirm that **Enable Email provider** is **on** (it is, by default).
   - **Confirm email**: leave **on** (default). New users will receive a confirmation link they must click before signing in. *(If you'd rather skip this for an internal tool, toggle it off — but for a public site, leave it on.)*
2. Go to **Authentication → URL Configuration** (you'll come back to set the real URL after step 3).
   - **Site URL** and **Redirect URLs** — for now leave the defaults; you'll add your GitHub Pages URL once it exists.
   - For local development, add `http://localhost:8000` (or whichever port you use) to **Redirect URLs**.

#### ⚠ A note on email delivery in production

By default Supabase uses its own SMTP for confirmation and password-reset emails. It's **rate-limited to ~3 emails per hour per project** and the "From" address is `noreply@mail.supabase.io` — fine for testing, not fine for real users.

Before launching to actual users, go to **Project Settings → Authentication → SMTP Settings** and plug in your own SMTP provider (Resend, Postmark, SendGrid, Amazon SES, your Gmail with an app password, etc.). Otherwise users will hit the rate limit and confirmation/reset emails will silently fail.

### 3. Wire your keys into `config.js`

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL** (e.g. `https://abcdefghijklmnop.supabase.co`).
3. Copy the **anon public** key (long JWT, starts with `eyJ…`). **This key is safe to commit publicly** — Row Level Security in `schema.sql` controls who can read/write what.
4. Open `config.js` in this folder and fill in both values:
   ```js
   window.CTG_CONFIG = {
     SUPABASE_URL:      'https://abcdefghijklmnop.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi…'
   };
   ```

### 4. Deploy to GitHub Pages

1. Create a new repo on GitHub (public or private — Pages works on both for free).
2. From this folder:
   ```sh
   git init
   git add .
   git commit -m "Initial CTG BEP site"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```
   By default `.gitignore` keeps your `config.js` local. If you want everyone using the repo to share the same Supabase project, delete the `config.js` line from `.gitignore` and commit it (the anon key is safe to publish).
3. On GitHub → repo → **Settings → Pages**.
4. Under **Source**, pick **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
5. Wait 1–2 minutes. GitHub will show you the live URL, e.g. `https://<your-user>.github.io/<your-repo>/`.
6. Go back to **Supabase → Authentication → URL Configuration** and set **Site URL** + **Redirect URLs** to this URL. Save.

### 5. Test

1. Open your GitHub Pages URL.
2. Click **Sign in** in the top-right → switch to the **Sign Up** tab → enter an email + password → submit.
3. Check your inbox (and spam folder) for the confirmation email. Click the link to activate.
4. Come back to the site → **Sign in** with your email and password.
5. Type a scenario name and click **Save as Scenario**.
6. Open the **Compare Scenarios** tab — your saved scenario appears.
7. Open the same site in another browser, sign in with the same account — the scenario should be there.

To test the password-reset flow: sign out → **Sign in** → **Forgot password?** → enter your email → click the link in the email → you'll land back on the site and see "Set a new password".

---

## How storage works

| State | Anonymous | Signed in |
|---|---|---|
| Calculator inputs (sales target, products, costs) | `localStorage` | `localStorage` (we don't sync keystrokes — too noisy) |
| Saved scenarios | `localStorage` | Supabase `scenarios` table |
| Language preference | `localStorage` | `localStorage` |
| Migration of local → cloud | Banner appears after first sign-in if local scenarios exist | One-click "Upload" |

Row Level Security (RLS) policies in `schema.sql` mean each user can only `SELECT / INSERT / UPDATE / DELETE` rows where `user_id = auth.uid()`. Even with the public anon key, a user cannot see anyone else's scenarios.

---

## Local development

GitHub Pages serves over HTTPS, but you can run locally over plain `http://`:

```sh
# from this folder, with Python 3 installed:
python -m http.server 8000
# then open http://localhost:8000
```

Add `http://localhost:8000` to Supabase → Authentication → Redirect URLs so Google sign-in works during dev.

---

## Common issues

**"Invalid email or password"**
Either the credentials are wrong, or — most often — the user hasn't clicked the email confirmation link yet. Check the inbox + spam folder.

**Confirmation / reset emails never arrive**
You've hit Supabase's default SMTP rate limit (~3 emails/hour/project). Set up custom SMTP in **Project Settings → Authentication → SMTP Settings**. See the warning in step 2 above.

**"Redirect URL not allowed" after clicking a reset / confirmation link**
The URL the email links back to isn't in Supabase's allowed Redirect URLs. Go to **Authentication → URL Configuration** and add your GitHub Pages URL (and `http://localhost:8000` for dev).

**Site loads but Sign-in button is missing, shows "Offline mode"**
`config.js` is empty or has placeholders. Fill in your real Supabase URL + anon key and reload.

**Scenarios don't appear after sign-in**
Open browser DevTools → Console. If you see `permission denied for table scenarios`, you didn't run `schema.sql`. Re-run it in Supabase SQL Editor.

**Want a custom domain?**
GitHub Pages → Settings → Pages → Custom domain. After it's live, add the new URL to Supabase's allowed Redirect URLs too.

---

## Tech stack

- Plain HTML / CSS / JS — no build step
- [Chart.js 4](https://www.chartjs.org/) (CDN) for sensitivity charts
- [Supabase JS SDK 2](https://supabase.com/docs/reference/javascript) (CDN) for auth + database
- Hosted on GitHub Pages, database on Supabase

No npm, no bundler, no framework. Edit a file → push to GitHub → live in 60 seconds.

---

**CTG · Changing the Game · BEP Calculator VER 4.0**
