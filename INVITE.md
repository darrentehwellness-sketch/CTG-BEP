# Inviting JV Partners to CTG BEP

This is your admin playbook. Use it to add new users from your Joint Venture partner companies.

## TL;DR

The calculator is **invite-only**. There is no public sign-up form. You add users via Supabase, they receive an email with a setup link, they set a password, they're in.

---

## One-time setup: Lock down sign-up

Do this **once**, before sharing the site URL with anyone.

1. Go to <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/auth/providers>
2. Click the **Email** row to expand it.
3. Find the toggle **Allow new users to sign up** → switch it **OFF**.
4. Click **Save**.

Now even if someone finds your URL and tries to register through the browser console or any other backdoor, Supabase will reject the request server-side.

> The Sign Up tab in the UI is already hidden in the code, so users only see the Sign In screen — but the server-side block above is what actually enforces it.

---

## Inviting a JV user (every new user)

Whenever you need to give someone access:

### Step 1 — Open the Users page

<https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/auth/users>

### Step 2 — Click **Invite user** (top right green button)

A dialog appears. Type their email address. Click **Send invitation**.

### Step 3 — They receive an email

The email comes from Supabase (or your custom SMTP sender if you've configured one). Subject line: *"You have been invited"*. Inside is a link.

### Step 4 — They click the link

The link brings them to your CTG BEP site, where they immediately see a **"Welcome to CTG BEP — Set a password"** popup. They type a password (min 6 chars), confirm it, click **Update password**.

### Step 5 — They're in

From here on, they sign in normally at your URL using their email + the password they just set.

---

## What if their invite email expires?

Supabase invite links expire after **24 hours** by default. If a user takes too long:

- Go back to the **Users** page (link above)
- Find their row
- Click the **⋮ (kebab) menu** → **Send invitation** (or **Send magic link**)

They get a fresh email.

---

## Removing access (when a JV ends, employee leaves, etc.)

1. <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/auth/users>
2. Find the user → kebab menu → **Delete user**
3. Their account is gone. Their saved scenarios are **automatically deleted too** (the `scenarios` table has `on delete cascade` on the user_id FK).

If you want to keep their scenarios for the record but block them from signing in:
- Kebab menu → **Ban user** (they can't sign in anymore but their data stays)
- Or kebab menu → **Reset password** and don't share the new one

---

## Bulk invitations

If you have a list of 5+ JV emails to invite at once, doing it through the UI is slow. Two options:

### Option A — Run SQL in Supabase

Go to <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/sql/new> and paste:

```sql
-- This uses Supabase's invite admin API via SQL. Replace the emails.
select auth.admin_invite_user_by_email(
  email := 'partner1@example.com'
);
select auth.admin_invite_user_by_email(
  email := 'partner2@example.com'
);
-- ... etc
```

> Note: `auth.admin_invite_user_by_email` may not be available in all Supabase plans. If you get an error, use Option B.

### Option B — One-by-one via dashboard

Just click **Invite user** repeatedly. For up to 10-20 users this is fine.

---

## Inviting users from specific company domains only

If you want extra safety — e.g. only allow `@ctg.com.my`, `@partner1.com`, `@partner2.com` — even via the Supabase invite UI, you can add a database trigger that blocks invites to other domains. Tell me if you want that and I'll add it. For now, the manual-invite step is the gatekeeper.

---

## Sharing the URL with JV partners

Once you've invited them, you can also share the site URL itself. They'll see the Sign In form. If they try to sign in without having been invited first, they'll get **"Invalid email or password"**. That's the only error they'll see — no clues that signup is even possible.

Sample email to send to JV partners:

> Hi [Name],
>
> I've added you to CTG's Break-Even Calculator at:
> https://darrentehwellness-sketch.github.io/ctg-bep/
>
> Look out for an invitation email from CTG (or `noreply@mail.supabase.io` — check spam) titled "You have been invited." Click the link in that email, set a password, and you'll be in.
>
> The tool lets you build expo budgets, track fixed/variable/product costs, and calculate the break-even point. Your scenarios are private to you and synced across your devices.
>
> Let me know if the invite doesn't arrive within an hour and I'll resend.

---

## ⚠ Before going live to JV partners — Set up custom SMTP

By default Supabase sends invitation/password-reset emails from `noreply@mail.supabase.io` and rate-limits to **~3 emails per hour per project**. That means:

- Your invitations land in spam folders ("from a sketchy supabase address")
- If you try to invite 5 partners in an afternoon, the 4th one silently fails

Before sharing the URL with real JV partners, set up custom SMTP:

1. Sign up for **Resend** (recommended — 3000 emails/month free) at <https://resend.com>
2. Verify a sending domain (e.g. `ctg.com.my`) — they walk you through DNS records
3. Get an SMTP host + port + user + password from Resend
4. In Supabase: <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/settings/auth> → scroll to **SMTP Settings** → Enable Custom SMTP → fill in. **Sender email** = `noreply@ctg.com.my` (or whatever domain you verified).

Now invitations come from your domain, deliver instantly, no rate limit.

---

**CTG · Changing the Game · JV Onboarding v1.0**
