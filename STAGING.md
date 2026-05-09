# Staging environment

A separate Cloudflare Worker (`mashmaut-api-staging`) with isolated KV
namespaces, used to test changes end-to-end before they reach production.

## Why staging exists

Production is alonmashmaut.org with real subscribers. Three things must NEVER
happen from staging:

1. Email a real subscriber (Resend send → real inbox).
2. Write to the production GitHub repo (admin POST → CDN regeneration).
3. Auto-trigger the weekly bulletin dispatch.

Two layers of protection enforce this:

- **`STAGING_MODE=1` env var** — Worker code skips GitHub writes and restricts
  email recipients to `ADMIN_EMAIL` only.
- **`FROM_EMAIL=onboarding@resend.dev`** — Resend's sandbox sender, which only
  allows sends to verified addresses (the owner's inbox).
- **`crons = []`** — automatic dispatch trigger is disabled in staging.
- **`GITHUB_BRANCH=staging`** — no such branch exists, so any leaked write 404s.

## One-time setup

```bash
cd worker

# 1. Create the two staging KV namespaces (this prints two IDs).
npx wrangler kv namespace create EMAILS_STAGING
npx wrangler kv namespace create EVENTS_STAGING

# 2. Paste the two IDs into wrangler.toml under [env.staging.kv_namespaces]
#    (replace REPLACE_WITH_EMAILS_STAGING_ID and REPLACE_WITH_EVENTS_STAGING_ID).

# 3. Deploy the Worker for the first time (creates mashmaut-api-staging).
npx wrangler deploy --env staging

# 4. Set secrets — use DIFFERENT values from production where it matters.
npx wrangler secret put ADMIN_API_KEY --env staging        # NEW key, separate from production
npx wrangler secret put RESEND_API_KEY --env staging       # can reuse production's, the sandbox sender restricts targets
npx wrangler secret put GITHUB_TOKEN --env staging         # can reuse — STAGING_MODE skips writes anyway

# 5. Note the staging worker URL. It looks like:
#    https://mashmaut-api-staging.<your-subdomain>.workers.dev
#    The `wrangler deploy` output prints it.
```

Then in the repo root, point your local frontend at staging:

```bash
cp .env.local.example .env.local
# Edit .env.local — set VITE_API_BASE to your staging worker URL.
```

## Daily loop

```bash
# Worker changes:
cd worker && npx wrangler deploy --env staging

# Frontend (with .env.local in place):
npm run dev       # → http://localhost:5173 talks to staging worker

# Live tail of staging logs:
cd worker && npx wrangler tail --env staging
```

When developing the frontend, use the **staging admin API key** (the one set
in step 4 above), NOT the production one. The login form is the same — just
paste the staging key.

## Promoting to production

When everything is verified on staging:

```bash
# 1. Worker first — additive endpoints; doesn't affect existing UI.
cd worker && npx wrangler deploy
curl https://api.alonmashmaut.org/health

# 2. Frontend — auto-deploys via GitHub Actions.
git push origin main
```

After production deploy, **leave `commentsEnabled` and `statsArchive.enabled`
both OFF for the first 24 hours** (set via /admin/settings on the live site).
Smoke-test with one comment from your own browser, then enable comments. After
another 24 hours of stability, enable the auto-archive.

## Rollback

If comments cause a problem in production: open `/admin/settings` and uncheck
"שיחות מופעלות". The discussion section disappears immediately. All comment
data stays in KV — re-enable to restore it.

If the auto-archive misbehaves: same flow, uncheck "ארכוב אוטומטי מופעל".
The dashboard reverts to showing all current `cnt:*` data.

## Verification checklist (run on staging before promoting)

Infrastructure:
- [ ] `curl https://mashmaut-api-staging.<sub>.workers.dev/health` → 200
- [ ] Bulletin POST from staging admin → response includes `staged: true`,
      no commit appears on `main`.
- [ ] `/admin/test-email` to a third-party address → log shows
      `staging: sendEmail blocked`, no email arrives.
- [ ] `/admin/test-email` with no `to` → email arrives at owner's inbox.

Stats archive (Phase A):
- [ ] In `/admin/settings`, set `periodDays = 1` temporarily.
- [ ] Generate fake events: `curl -X POST <api>/event -d '{"type":"view","slug":"test","year":"5786","fp":"abc12345"}' -H 'Content-Type: application/json'` (repeat).
- [ ] Hit `POST /admin/stats/archive-now` (staging-only) to force an archive.
- [ ] Open `/admin/stats` → "היסטוריה" → see the archive, download CSV,
      open in Excel — Hebrew renders correctly.
- [ ] After download, `cnt:*`/`fp:*`/`done:*` keys are gone (the dashboard is
      empty); restore `periodDays = 7`.

Comments (Phase B):
- [ ] First comment from a fresh browser → name prompt appears.
- [ ] Second comment → no prompt; uses saved name.
- [ ] Second browser tries the same name → 409 + re-prompt.
- [ ] Open the bulletin in two tabs; post in tab A; tab B sees it within ~7s.
- [ ] Tab in background (focus another window) → polling pauses (check
      `wrangler tail`).
- [ ] Reactions: ❤ → +1; ❤ again → 0; 👍 then ❤ → 👍 = 0, ❤ = 1.
- [ ] Reply to a comment → renders nested.
- [ ] Reply to a reply → server rejects ("שרשור עמוק מדי").
- [ ] Edit own within 15 min → "נערך" badge appears.
- [ ] Admin deletes a comment → renders as "[ההודעה נמחקה]" placeholder.
- [ ] Admin lock → composer disabled with locked notice.
- [ ] Report a comment → admin notification appears in `/admin/notifications`.
- [ ] XSS smoke test: post `<script>alert(1)</script>` → renders as text.
