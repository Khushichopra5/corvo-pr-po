# Deployment handoff — Vercel + Neon

The production database has already been prepared. This document is the exact manual Vercel path for the owner.

## 0. What is already done

- Neon Postgres schema migrated: `001_init.sql`, `002_requirement_audit_fields.sql`.
- Seed loaded and verified:
  - 73 items, 48 suppliers, 468 PO-history rows, 12 contracts
  - policy **v5.0**
  - sample run: 186 PR lines → 149 requirements → 82 POs / 55 sourcing events
- Local checks: 17/17 tests, production build, Docker Compose, and API smoke test.

The Neon database supplied for this task is already seeded. **Do not run `npm run db:reset` or `npm run db:seed -- --force` against Neon** unless you intend to wipe the demo data.

---

## 1. Repository

The app is published at:

**https://github.com/Khushichopra5/corvo-pr-po**

It contains no `.env`, credentials, `node_modules`, `.next`, or local database dumps.

---

## 2. Import into Vercel

1. Open **https://vercel.com/new**.
2. Choose **Import Git Repository** and select `Khushichopra5/corvo-pr-po`.
3. Set:
   - **Project name:** `corvo-pr-po`
   - **Framework preset:** Next.js (auto-detected)
   - **Root directory:** `./`
   - **Build command:** `npm run build` (default)
   - **Output directory:** `.next` (default)
   - **Install command:** `npm install` (default)
   - **Node.js version:** 22.x (Project Settings → General → Node.js Version)
4. Add these **Environment Variables** for Production (and Preview if you want preview deploys):

| Name | Value |
|---|---|
| `DATABASE_URL` | The pooled Neon connection string from the supplied project: `postgresql://neondb_owner:<NEON_PASSWORD>@<NEON_POOLED_HOST>/neondb?sslmode=require` |
| `AUTH_SECRET` | A long random string. Generate it with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | `https://corvo-pr-po.vercel.app` (or the final `.vercel.app` URL) |
| `OPENAI_API_KEY` | Optional. The chat assistant works without it using the deterministic fallback. |
| `LLM_MODEL` | Optional. Defaults to `gpt-6.1-terra`. |

5. Set the function region to **Washington, D.C. (`iad1`)** in Project Settings → Functions if it is not already the default. The supplied Neon project is in US East (Ohio), so an East-US function region keeps database latency low.
6. Click **Deploy**.

The build does not touch the database. Migrations and seeding are intentionally local/one-off tasks, not Vercel build steps.

---

## 3. After the first deploy

If the assigned URL is not `https://corvo-pr-po.vercel.app`:

1. Update `APP_URL` in Vercel → Settings → Environment Variables.
2. Redeploy from **Deployments → ⋯ → Redeploy** so the new value is used.

---

## 4. Post-deploy smoke test

Replace `<URL>` with the deployed URL.

```bash
curl https://<URL>/api/health
```

Expected shape:

```json
{
  "ok": true,
  "counts": {
    "items": 73,
    "suppliers": 48,
    "pos": 468,
    "contracts": 12,
    "policies": 1,
    "runs": 1
  },
  "active_policy": "5.0",
  "db": true
}
```

Then check the UI:

1. **Dashboard** — latest run shows 186 lines → 149 requirements → 82 POs / 55 sourcing events.
2. **Inbox → PR-26-00009 / PR-26-00027 group** — `SPOT_PO`, supplier `S014`, unit price `1,500`, value `1,90,576`.
3. **Inbox → PR-26-00100** — `RFP`, suppliers `S020;S017;S019;S018`, value `20,70,780`.
4. **Policy** — v5.0 is active.
5. **Policy → Upload amendment** — use `public/amendment-sample.txt`.
   - Draft v5.1 shows the spot limit at `1,50,000` and the Chakan RFP rule.
   - Set the effective date to today (or 2026-11-20 if today is on/after that) so approval activates it rather than scheduling it.
   - Preview impact, approve, then **Reprocess latest batch**.
   - The same sample batch now runs under v5.1 without a code change; `PR-26-00027` moves to the Chakan RFP path.
6. **Run detail → Export CSV** — downloads the decision CSV.
7. **Preferred suppliers → Export CSV** — `https://<URL>/api/preferred-suppliers/export.csv?as_of=2026-11-01`.

If `/api/health` returns a database error, confirm `DATABASE_URL` is the **pooled** Neon URL with `?sslmode=require` and that the Neon project is awake.

---

## 5. Submission

Add the final hosted URL to the submission form and, if desired, to the README:

```markdown
**Live demo:** https://<URL>
```
