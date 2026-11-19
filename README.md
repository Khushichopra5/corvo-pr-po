# Corvo PR → PO

A policy-driven procurement workspace for **Corvo Engineering Pvt Ltd** (fictional). Employees raise purchase requests by chatting; the app matches the item master, clubs split requests, values requirements, checks rate-contract ceilings, applies an ordered policy, builds the preferred-supplier list and consolidates purchase orders. Procurement can upload an amendment, review a plain-language diff and impact preview, approve a new version, and reprocess the same batch — without a code change.

Built for the **Cantill.ai Full-stack Intern Task, Round 1**.

---

## What is in the app

- **Chat intake** — natural-language requests, item-master search, only-missing-field follow-ups, explicit confirmation, ambiguous-item choices and a NEW-item estimate flow. It never invents an item or supplier.
- **Batch import + API** — `POST /api/process-batch` accepts a sample-format CSV (multipart, raw CSV or `{ "csv": "..." }`) and returns one decision per input line. The exact CSV export is available from the API and the run screens.
- **Deterministic decision engine** — item matching, 14-day/±7-day clubbing, valuation (3.1), contract applicability/ceilings (4.1–4.4), ordered rules (5.1–5.7), preferred suppliers/reference prices (6.1–6.3), suggestions (6.4), PO consolidation (7.1–7.2), and audit reasons.
- **Policy as data** — v5.0 parameters and rules are stored in Postgres as versioned JSON. Upload a PDF/TXT/MD amendment or describe the change; the app drafts a version, shows the diff, previews the impact on the latest batch, and requires approval. A parameter form, a no-code rule builder and a JSON editor are the guaranteed fallback.
- **Buyer workspace** — inbox, requirement detail, PR lines, decision, value, supplier/price or suggestions, clause, policy version, contract/PO evidence, approve/override with a written reason, and an append-only audit timeline.
- **Contracts** — register + PDF-only contracts, ceiling progress, Schedule A lines, manual entry and PDF extraction.
- **Preferred suppliers** — as-of-date ranking with component scores and top-3 CSV export.
- **Audit trail** — every approval, override, contract import and policy action records actor and timestamp.
- **Verification** — a golden engine test against the independent Python oracle (14/14 worked decisions, 3/3 rankings, all 186 rows), policy tests, parser tests, API smoke test and a CSV validator.

---

## Quick start (one command)

**Prerequisites:** Docker Desktop. Node 22+ is only needed for the non-Docker developer path.

The supplied task data is **not committed** to this repository. Put it in a local `./kit` directory first (copy the kit's `master_data`, `contracts` and `pr_batches` folders), then generate the PDF-only contract cache:

```bash
mkdir -p kit
cp -R ../Cantill_FullStack_Task_Kit/master_data ../Cantill_FullStack_Task_Kit/contracts ../Cantill_FullStack_Task_Kit/pr_batches kit/
npm run db:pdf-cache
docker compose up --build
```

Open **http://localhost:3000**. The app container waits for Postgres, applies migrations, seeds the master data, contracts, policy v5.0 and a sample run, then starts Next.js. If `./kit` is absent, the container still starts but the database is empty.

The Compose database is exposed on host port `5434` to avoid clashing with other local Postgres instances. The app uses the internal `db:5432` network address.

### Local developer path

```bash
cp .env.example .env
# Start Postgres, or point DATABASE_URL at your own instance.
# Point KIT_DIR at the supplied kit, then generate the local PDF cache.
npm install
npm run db:pdf-cache
npm run db:migrate
npm run db:seed
npm run dev
```

For the local container used during development:

```bash
docker run -d --name corvo-db \
  -e POSTGRES_USER=corvo -e POSTGRES_PASSWORD=corvo -e POSTGRES_DB=corvo \
  -p 5433:5432 postgres:16-alpine
# .env: DATABASE_URL=postgres://corvo:corvo@localhost:5433/corvo
```

Reset the demo at any time:

```bash
npm run db:reset   # migrations + truncate + reseed
npm run db:verify  # 73 items, 48 suppliers, 468 POs, 12 contracts, sample 149/186
```

---

## Demo users

The header has a **role switcher** (soft demo auth, signed HttpOnly cookie):

| User | Role | Use it for |
|---|---|---|
| Asha | Requester | Chat intake |
| Ravi | Buyer | Decision inbox, approve/override |
| Meera | Procurement Admin | Policy and contract administration |

The audit trail records the selected user. This is deliberately a demo-grade auth model; a production deployment would use SSO.

---

## Five-minute tour

1. **Dashboard** — latest run: 186 lines → 149 requirements → 82 POs / 55 sourcing events.
2. **Decision inbox** — filter by route; open a `CONTRACT_PO` and a `RFQ`; the detail page shows the clause, contract/PO evidence, 3.1 valuation vs 6.3 award price, preferred-supplier scores and clubbing lines. Approve one; override another with a comment.
3. **Policy** - download the sample amendment from `/amendment-sample.txt` or use the text box. The app drafts v5.1, shows the spot limit and Chakan RFP rule, previews the impact, and lets you approve. After approval, use **Reprocess latest batch under v5.1**.
4. **Suppliers** — choose ITM-1048 as of 2026-11-01; S029 is rank 1 and S030 rank 2; export the top 3 CSV.
5. **Chat** — try “need 200 nitrile gloves for Chakan by next Friday”, then confirm. Try “drinking water purifier 50 LPH” to see the NEW-item estimate path.

### The sample amendment

`public/amendment-sample.txt` contains a rehearsal amendment:

- spot PO limit ₹2,00,000 → ₹1,50,000
- new Chakan rule: requirements ≥ ₹8,00,000 and below ₹10,00,000 go to RFP

It is deliberately a **short amendment**, not a full policy document. If a document is a full policy, the app refuses to guess values and sends you to the structured editor.

---

## API

### Process a batch

```bash
curl -F "file=@your_batch.csv" \
  "http://localhost:3000/api/process-batch"

curl -F "file=@your_batch.csv" \
  "http://localhost:3000/api/process-batch?format=csv" \
  -o decisions.csv
```

Optional query parameters:

- `policy_version=5.1` — use an approved version explicitly (the run 2/backtest path).
- `as_of=2026-11-18T10:00:00+05:30` — select the policy active at a decision timestamp.
- `format=csv` — return the decision CSV directly.

The JSON response includes `run_id`, `policy_version`, `summary` and `rows`; each row is one input PR line.

### Decisions CSV

Exact header:

```csv
pr_no,pr_line,resolved_item_code,group_id,po_id,decision,route,supplier_id,unit_price,group_value_inr,suggested_supplier_ids,policy_version,reason
```

- `decision` is `PO` or `SOURCING_REQUEST`; `NOT_PROCESSED` rows carry `route=NOT_PROCESSED` and a reason.
- `suggested_supplier_ids` are semicolon-separated with no spaces.
- `unit_price` and `group_value_inr` are whole rupees. Exact two-decimal rates and the 3.1 valuation source are stored in the API/DB for audit.
- One row per input line, in input order.

### Other endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | DB/seed counts, active policy, latest run |
| `GET` | `/api/runs` | Run history |
| `GET` | `/api/runs/[id]` | Run summary, rows and requirements |
| `GET` | `/api/runs/[id]/export.csv` | Decisions export |
| `POST` | `/api/runs/[id]/reprocess` | Reprocess a run under an explicit policy version |
| `GET` | `/api/preferred-suppliers?as_of=YYYY-MM-DD` | Ranked JSON |
| `GET` | `/api/preferred-suppliers/export.csv?as_of=YYYY-MM-DD` | Top-3 CSV |
| `POST` | `/api/policies/upload` | PDF/TXT/MD amendment → draft |
| `POST` | `/api/policies/from-chat` | Describe a change → draft |
| `PATCH` | `/api/policies/[id]` | Edit a draft |
| `POST` | `/api/policies/[id]/preview` | Impact preview |
| `POST` | `/api/policies/[id]/approve` | Approve + effective date |
| `GET/POST` | `/api/contracts` | List/add contracts |
| `POST` | `/api/contracts/extract` | Extract a signed PDF |
| `POST` | `/api/prs` | Create a single chat PR |
| `POST` | `/api/requirements/[id]/approve` | Approve decision |
| `POST` | `/api/requirements/[id]/override` | Override with required comment |
| `GET` | `/api/audit` | Append-only audit feed |

---

## Verification

```bash
npm test              # policy/chat tests always; 186-row golden suite when KIT_DIR + ORACLE_CSV are set
npm run test:golden   # 14 worked decisions + all 186 rows vs the private oracle fixture
npm run smoke:api     # requires `npm run dev` and a local kit; checks API, exports, policy draft
npm run validate:csv -- path/to/decisions.csv
npm run db:verify
npm run db:pdf-cache  # generates kit/contracts/pdf_contracts.json from the signed PDFs
```

The independent oracle is at `../research/oracle/`; it passes **44/44** tests and reproduces all 14 worked decisions, all 3 preferred rankings, suggestion lists, contract ceiling edges and the PO-number calibration. The TypeScript engine matches it on **all 186 rows** for route, group, PO, supplier, unit price, group value, suggestions and policy version.

### Material sample facts the engine handles

- **186 lines → 149 requirements → 82 POs / 55 sourcing events**, 2 `NOT_PROCESSED`.
- RC-2026-013 is used by **9** requirements; the large Allen-cap PUN1 requirement falls out to RFQ after the ceiling is consumed.
- RC-2026-015 is **unused** (only ₹12,000 left).
- RC-2026-031 is used by 3 requirements; **RC-2026-033 is unused** because the 20 Nov laptop line clubs backwards with a 16 Nov line.
- **Worked Example 6** proves valuation ≠ award price: value ₹1,56,170 at S028’s ₹21.19; award S027 at ₹21.59 (₹22).
- **G0022** is SPOT_PO on a 3.1 value of ₹1,90,576, even though the S014 award amount is ₹2,10,001.
- PO IDs in the worked examples are calibration IDs; the full batch is **exactly +1** because the trailing servo pair is the first valid requirement.

These are recorded in `DECISIONS.md`; none are hard-coded into the engine.

---

## Architecture

```
src/engine/        pure TypeScript engine (no DB/UI): matcher, clubbing,
                   contracts, valuation, ordered rules, preferred list,
                   suggestions, PO consolidation, CSV rows
src/db/            Postgres client + queries/persistence/actions
src/app/           Next.js App Router pages and route handlers
src/components/    UI + client interactions
src/lib/           auth, CSV, PDF extraction, policy parsing/diff, chat parser
db/migrations/     SQL schema
scripts/           migrate, seed, reset, verify, smoke, validate, oracle checks
kit/               local-only task kit (gitignored); hosted demo uses Neon instead
```

The engine is pure and deterministic: same batch + same master data + same policy + same commitments → same rows. The UI never computes a decision. Policy is data, not `if` branches: `src/engine/default-policy.ts` is the v5.0 seed, and the DB holds approved versions.

### Task data handling

The supplied task data (master CSVs, contract PDFs, sample PR batch and the full oracle fixture) is intentionally **not committed**. The public repo contains application code, policy defaults, migrations and docs only. The hosted Neon database is already seeded with the sample run; to recreate it locally, point `KIT_DIR` at the supplied kit (or copy it into `./kit`) and run `npm run db:pdf-cache && npm run db:migrate && npm run db:seed`. Set `ORACLE_CSV` to the private oracle CSV if you want the full 186-row golden comparison.

### Data model (core)

`plants`, `items`, `suppliers`, `po_history`, `contracts`, `contract_lines`, `policy_versions`, `pr_batches`, `pr_lines`, `processing_runs`, `requirements`, `requirement_lines`, `purchase_orders`, `po_lines`, `sourcing_events`, `audit_events`, `documents`, `users`.

Money is stored as `numeric`; valuation and award prices are separate columns. Contract register `consumed_value` is the baseline; batch runs use a per-run ceiling ledger and never mutate the register.

---

## Policy workflow

1. Procurement uploads an amendment (PDF/TXT/MD) or describes a change.
2. The app extracts text, proposes a **draft** JSON policy (parameters/rules) and computes a structural + plain-language diff.
3. The draft is editable in the browser (parameters and rule JSON). Invalid drafts can be saved but cannot be approved until validation passes.
4. **Preview impact** re-runs the latest batch and shows changed PRs.
5. **Approve & activate** sets the effective date; a future date is `scheduled`, not active. The run records the exact policy version.
6. **Reprocess latest batch** or `POST /api/process-batch?policy_version=...` performs the run-2 backtest. Requirement dates still control contracts/history; only the rule set changes.

The amendment never requires a code change. The boundary is honest: a new **combination** of facts/operators/outcomes is data; a genuinely new predicate/route would require code (see `DECISIONS.md` and `APPROACH.md`).

---

## Deployment

The intended production pairing is **Vercel Hobby + Neon (US East)** with the same Docker-validated app. Node runtime is required for PDF/DB routes. The supplied Neon database is already migrated and seeded; the full owner checklist is in [`DEPLOYMENT.md`](DEPLOYMENT.md).

```bash
# Vercel: import the repo, then set:
DATABASE_URL=postgres://...neon.tech/...?...sslmode=require
AUTH_SECRET=<long random string>
APP_URL=https://<your-app>.vercel.app
# Optional:
OPENAI_API_KEY=...        # chat currently uses a deterministic parser; LLM is optional
```

The app stays request-driven on Vercel; Neon resumes compute from scale-to-zero in under a second. Run `pg_dump` before the blind test; Neon Free has no scheduled backups. Add the deployed URL to the submission form and README once Vercel assigns it.

---

## Limitations / notes

- The chat assistant uses a deterministic slot-filling parser; it is deliberately tool-grounded and works without an API key. A production version would add an LLM with the same tool boundary.
- Auth is demo-grade (signed cookie + role switcher), not SSO.
- PDF extraction handles the generated, single-column contracts; scanned/image-only PDFs fall back to manual entry.
- The sample has 468 POs although the brief says “about 525”; the CSV is authoritative.
- All data is fictional. All values exclude GST.
