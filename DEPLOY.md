# Deploying CTG BEP Calculator as a Live Website

A step-by-step guide for getting `C:\Users\User\Downloads\ctg-bep-website\` from your laptop to a public URL that anyone can use.

**Estimated time**: 15 minutes. **Cost**: free.

---

## What you'll end up with

- A public URL like `https://your-github-username.github.io/ctg-bep/` that loads the calculator
- Users can sign up with email + password, scenarios sync across devices
- Updates push live in ~60 seconds (`git push` → site updates)

## What's already done

- Code is built at `C:\Users\User\Downloads\ctg-bep-website\`
- Supabase project is live (`msdfzzvdmmqzwcnxtrfn.supabase.co`)
- `scenarios` table exists with RLS
- `config.js` has your URL + publishable key

## What's left

1. Create GitHub account + repo (3 min)
2. Push the folder to GitHub (3 min)
3. Enable GitHub Pages (2 min)
4. Add the Pages URL to Supabase's allowed list (2 min)
5. First user test (3 min)
6. *Optional*: custom SMTP for emails, custom domain

---

## Step 1 — GitHub account & repo

**If you don't already have a GitHub account:**

1. Go to <https://github.com/signup> → sign up (free).
2. Confirm your email.

**Create a new repository:**

1. Click the green **New** button (top-left after signing in) or go to <https://github.com/new>
2. Fill in:
   - **Repository name**: `ctg-bep` (or whatever you want — this will be in the URL)
   - **Description**: `CTG Exhibition Break-Even Calculator`
   - **Public** or **Private** — *both work for GitHub Pages on free accounts*. Public is easier (no login required to visit). Pick Public if you're not sure.
   - ❗ **Leave "Add a README file" UNCHECKED**. We already have one.
   - ❗ **Leave .gitignore "None"** and **License "None"**. We already have a .gitignore.
3. Click **Create repository**.

GitHub shows you a "quick setup" page with a URL like `https://github.com/your-username/ctg-bep.git` — copy it, you'll need it in step 2.

---

## Step 2 — Push your folder to GitHub

Open a terminal (PowerShell, Git Bash, or Windows Terminal). Then:

```sh
cd "C:\Users\User\Downloads\ctg-bep-website"

git init
git add .
git status                                    # sanity check — should NOT list config.js (gitignored)
git commit -m "Initial CTG BEP site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ctg-bep.git
git push -u origin main
```

**Replace `YOUR-USERNAME/ctg-bep`** with the URL GitHub gave you in step 1.

Git will ask for credentials. Two ways to authenticate:

- **Easiest**: GitHub's browser pop-up sign-in (called Git Credential Manager) — your default Windows Git uses this; just sign in when prompted.
- Alternative: a [Personal Access Token](https://github.com/settings/tokens) as your password.

When the push succeeds, refresh your repo page on GitHub — you'll see all your files.

> **Should you commit `config.js`?**
> Default behavior (current `.gitignore`): `config.js` is **NOT** pushed. Each person who clones must create their own. This is the safer pattern.
> If you want everyone using this repo to share the same Supabase project (since the publishable key is safe to publish anyway): edit `.gitignore`, remove the `config.js` line, then `git add config.js && git commit -m "Include config" && git push`.

---

## Step 3 — Enable GitHub Pages

1. On your repo page, click **Settings** (top nav).
2. Left sidebar → **Pages**.
3. Under **Build and deployment**:
   - **Source**: pick **Deploy from a branch**
   - **Branch**: pick `main`, folder `/ (root)`
   - Click **Save**
4. Refresh after 30 seconds. A green banner appears: **"Your site is live at `https://your-username.github.io/ctg-bep/`"**.
5. Click the URL — the calculator should load.

If you see the calculator but the header shows **"Offline mode"**: `config.js` wasn't pushed (it's gitignored). Two fixes:
- Push it: remove `config.js` from `.gitignore`, then `git add config.js && git commit -m "Add config" && git push`
- Or copy `config.js` content from `config.example.js` and manually push a filled-in version

---

## Step 4 — Tell Supabase about your new URL

Sign-up confirmation and password reset emails contain links back to your site. Supabase only redirects to URLs you've whitelisted.

1. Go to <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/auth/url-configuration>
2. **Site URL** — set to your GitHub Pages URL, e.g. `https://your-username.github.io/ctg-bep/`
3. **Redirect URLs** — click **Add URL**, paste the same URL. Also add `http://localhost:8000` if you'll ever test locally.
4. Click **Save**.

Without this, users will click the confirmation link in their email and see a Supabase error page.

---

## Step 5 — First user test

1. Open your GitHub Pages URL in a browser.
2. Top-right → **Sign In** → switch to **Sign Up** tab.
3. Enter an email + password (min 6 chars) → click **Create account**.
4. The modal switches to "Almost there! We sent a confirmation link to..."
5. Check your email inbox (and spam folder — Supabase's default SMTP often gets flagged).
6. Click the confirmation link → you'll land back on your site, now signed in.
7. Type a Scenario Name (e.g. "Test KLCC 2026") and click **Save as Scenario**.
8. Switch to **Compare Scenarios** tab — your saved scenario appears.
9. Open the site in another browser or device → sign in with the same email → scenario is there. ✅

**To test password reset**: sign out → **Sign In** → **Forgot password?** → enter email → click link in email → set new password.

---

## Step 6 — *Optional but recommended for real users*: Custom SMTP

Supabase's default SMTP is rate-limited to **~3 emails per hour per project** and the "From" address looks like `noreply@mail.supabase.io`. For real users this isn't acceptable.

1. Sign up for an SMTP provider (free tiers):
   - **Resend** (3,000 emails/month free) — easiest signup
   - **Postmark** (100 emails/month free trial, then paid) — best deliverability
   - **Amazon SES** — cheapest at scale (but harder setup)
   - **Gmail App Password** — quick & dirty, max ~500/day, OK for very small use
2. Get the SMTP host, port, username, password from your provider.
3. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**
4. Toggle **Enable Custom SMTP**, fill in the fields, save.
5. Test by signing up with a new email — confirmation should arrive instantly and *not* from `mail.supabase.io`.

---

## Step 7 — *Optional*: Custom domain

If you own a domain like `bep.ctg.com.my`:

1. GitHub repo → **Settings → Pages** → **Custom domain** → enter `bep.ctg.com.my` → Save.
2. GitHub will tell you the DNS records to add at your domain registrar (an A record or CNAME).
3. Add the records in your registrar's DNS panel. Wait 5-60 minutes for propagation.
4. Once GitHub shows "DNS check successful", check **Enforce HTTPS**.
5. **❗Go back to Supabase URL Configuration and replace** the GitHub Pages URL with your custom domain (otherwise confirmation/reset emails will point users to the old `.github.io` URL).

---

## Updating the site after deployment

Edit any file locally, then:

```sh
cd "C:\Users\User\Downloads\ctg-bep-website"
git add .
git commit -m "What I changed"
git push
```

GitHub Pages rebuilds in ~60 seconds. Hard-refresh your browser (`Ctrl+Shift+R`) to see the change.

---

## Troubleshooting

**Site loads but says "Offline mode"**
`config.js` isn't on the server. Either you pushed without it (it's gitignored by default), or the file is empty. See Step 3 fix.

**"Invalid email or password" after creating account**
You didn't click the confirmation link in the email yet. Check inbox + spam.

**Confirmation/reset email never arrives**
Most common: you've hit Supabase's default SMTP rate limit. Wait 1 hour, or set up custom SMTP (Step 6).

**Sign in succeeds but no scenarios save / "permission denied"**
The `scenarios` table or its RLS policies aren't there. Re-run `supabase/schema.sql` in the Supabase SQL Editor.

**`git push` fails with "Authentication failed"**
Use the GitHub browser sign-in (Git Credential Manager) or create a Personal Access Token at <https://github.com/settings/tokens> and use it as the password.

**404 on GitHub Pages URL right after enabling**
GitHub Pages takes 1-3 minutes for the first deploy. Wait, refresh.

---

**CTG · Changing the Game · Deployment Guide v1.0**
