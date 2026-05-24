# WHT Calculator — AI OCR Setup

The WHT Calculator can scan PDF / image receipts and auto-fill the
**Invoice Amount** for each row. It uses **Claude Vision** via a
Supabase Edge Function called `wht-ocr-extract`.

The function is **already deployed**. You only need to add **one
secret** — your Anthropic API key — and you're live.

---

## Step 1 — Get an Anthropic API key (2 min)

1. Go to <https://console.anthropic.com/settings/keys>
2. Sign in (create an account if needed)
3. Click **Create Key** → name it `CTG Finance Hub`
4. Copy the key — it starts with `sk-ant-api03-...`

> **Cost:** ~RM 0.02 – 0.08 per receipt scan with Claude Sonnet 4.5.
> Add a usage cap at <https://console.anthropic.com/settings/limits>
> if you want a hard ceiling (e.g. USD 20/month).

---

## Step 2 — Add the secret to Supabase (1 min)

1. Open <https://supabase.com/dashboard/project/msdfzzvdmmqzwcnxtrfn/settings/functions>
2. Scroll to **Edge Function Secrets** → click **Add new secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: paste your `sk-ant-api03-...` key
5. Click **Save**

> No redeploy needed — the function reads the secret on every invocation.

---

## Step 3 — Use it (zero setup)

1. Hard-refresh the WHT Calculator tab (Ctrl+F5)
2. Inside any payee card, you'll see a new **drop zone**:
   > 📎 Drop PDFs / images here — or click to browse
3. Drag one or many receipts onto it — or click and select multiple files
4. Each file → new receipt row → AI fills the Invoice Amount within
   ~3-8 seconds per file (runs in parallel)
5. Date and Receipt / Invoice No stay blank for you to fill (the AI
   only extracts the **amount** per your spec; can be expanded later)

The receipt filename is auto-copied into the Receipt / Invoice No field
as a default — easy to edit later.

---

## Supported file types

- **PDF** (multi-page OK, ≤ 10 MB)
- **PNG / JPG / WEBP / GIF**

---

## What the AI looks for

The prompt asks Claude to find the **Total Payable** line (the gross
SST-inclusive amount you actually pay). Specifically:

1. Prefers explicit "Total / Grand Total / Amount Due / Total Payable"
2. If both pre-tax and tax-inclusive lines are shown → takes the
   tax-inclusive one (so SST reverse-calc works correctly)
3. Strips currency symbols, thousands separators, trailing notes
4. Returns 0 if unreadable — you'll see a toast and can type manually

---

## Troubleshooting

**"Not signed in — please log in to use AI scan"**
→ The Edge Function requires JWT auth. Sign in with email/password
first, then refresh.

**"ANTHROPIC_API_KEY is not configured"**
→ You haven't completed Step 2. Add the key in the Supabase dashboard.

**"Claude API error (401)"**
→ The key in Supabase is invalid or has been deleted at the Anthropic
console. Generate a new one and update the secret.

**"Claude API error (429)"**
→ Rate limit. Wait a minute or upgrade your Anthropic plan.

**Scan returned 0**
→ The receipt may be unreadable (low resolution, handwriting, foreign
currency without clear total). Type the amount manually.

**"File too large: 12.5MB (max 10MB)"**
→ Compress the PDF first. On Mac: Preview → Export → reduce quality.
On Windows: free tools like ilovepdf.com.

---

## Architecture (for the curious)

```
┌─────────────┐   FormData {file}  ┌──────────────────┐  Claude Messages API  ┌──────────────┐
│ WHT browser │ ──────────────────▶│ wht-ocr-extract  │ ────────────────────▶ │ Claude Vision │
│  drop zone  │  + JWT in header   │  (Edge Function) │  + base64 PDF/image   │  Sonnet 4.5   │
└─────────────┘                    └──────────────────┘                       └──────────────┘
       ▲                                    │                                          │
       │       { ok:true, invoiceAmount }   │                {"amount": 3826.00 ...}   │
       └────────────────────────────────────┴──────────────────────────────────────────┘
```

The Edge Function:
- Validates file type + size (max 10MB)
- Base64-encodes the bytes
- Wraps in Claude's `document` (PDF) or `image` content block
- Calls Claude with a tightly-scoped extraction prompt
- Parses the JSON response and returns to the browser

---

**CTG · Changing the Game · WHT OCR v1.0**
