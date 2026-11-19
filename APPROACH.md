# APPROACH

## What I built

A single Next.js 16.4.6 + TypeScript application with a pure deterministic procurement engine, a PostgreSQL database, a buyer workspace, a policy-as-data console, chat intake, CSV import/export, contract PDF extraction and preferred-supplier ranking. The app is designed to be explained and changed: the engine has no React, Next.js or database imports; the policy rules and thresholds are data; the UI only renders stored decisions.

## AI tools used

- **Coding assistant:** I used OpenCode with **DeepSeek V4.1 Flash** as the coding agent. It scaffolded files, wrote the TypeScript engine and UI under my direction, ran tests, and applied fixes.
- **Independent research/oracle:** I used three parallel **general-purpose sub-agents** during planning:
  - a data-audit agent that built an independent **Python reference oracle** for policy v5.0;
  - a policy-analysis agent that read every clause, contract and ambiguity;
  - a technology-research agent that checked the 2026 stack, hosting and PDF/LLM choices.
  The Python oracle is a separate implementation from the TypeScript engine. It passes 44/44 tests; the TypeScript engine matches its 186-row output on route, group/PO, supplier, price, value, suggestions and policy version. The oracle is not used by the app at runtime.
- **In-app AI:** the current chat is a **deterministic slot-filling assistant** using the same item matcher and server validation. It does not require an API key and does not invent items. The architecture is LLM-ready: an OpenAI-compatible model can call the same `search_items`/`draft` tools later, but a model is not in the batch decision path. I chose this deliberately: it is testable, reproducible and cannot halluate an item in the blind test.
- **No answer key was used.** The sample’s worked examples were treated as tests, not hard-coded branches. The production engine has no PR-number or item-specific `if` statements.

## How the policy engine works

1. Normalize the PR line; resolve the item by code, then description (alias/numeric-token/fuzzy matcher).
2. Sort by creation time, PR number, line.
3. Club lines into requirements: same item/plant, first-line 14-day creation window, first-line ±7-day need-by window, earliest eligible requirement; NEW items never club.
4. Resolve applicable contracts (item, inclusive term, Active supplier), check per-requirement ceiling in requirement-date order, value at the selected/lowest rate or the 3.1 PO/standard fallback.
5. Evaluate the ordered policy rules from the JSON version. The default v5.0 rules are 1.2 NEW → 5.1 capex → 5.2 contract → 5.3 emergency → 5.4 spot → 5.5 RFQ → 5.6 RFP. 5.7 is a global Active-only supplier guard.
6. Build the preferred list (6.1–6.3) and sourcing suggestions (6.4).
7. Consolidate POs: same supplier/plant/route, first requirement + 24h, earliest open PO; sourcing never combines.
8. Emit one row per input line in input order.

The policy is versioned in Postgres. The run records the exact version. A draft amendment can be uploaded/described, diffed, previewed against the latest batch, edited as JSON, approved with an effective date and reprocessed as an explicit backtest. A future effective date is scheduled, not silently active.

## Why these design choices

- **Pure engine:** the 40% decision score is too important to couple to React or the DB. The engine is unit-testable and the oracle gives an independent cross-check.
- **Two prices:** 3.1 valuation and 6.3 award price are separate by design (Worked Example 6). The UI shows both; forcing equality would be wrong.
- **Policy as data:** limits, windows, priorities, conditions and outcomes are JSON. The rule editor can add a plant/category/value rule without code. The honest boundary: new facts/predicates or new routes require code; see `DECISIONS.md` #40.
- **Fail closed on bad input:** invalid plant, zero quantity, ambiguous item, UOM mismatch and missing need-by are `NOT_PROCESSED` with reasons, not guesses.
- **Contract ledger:** the register is the baseline; each run has an isolated ledger. This makes run 1 and run 2 comparable and avoids double-counting ceilings.
- **Demo-grade auth:** the brief asks for “who and when”, not SSO. A signed cookie + role switcher keeps the hosted demo easy to evaluate while recording the actor.

## How to change it

### Add or change a policy rule (no code)
Use `/policy`, upload an amendment or describe the change, or open a draft and edit:
- `parameters` for limits/windows/suggestion counts;
- `rules` for priority, conditions (`fact`, `op`, `value`, `all`/`any`/`not`) and outcomes (`decision`, `route`, `supplier`, `price`, `suggest_count`, `requires_approval`).

The rule set is validated for route/outcome consistency, duplicate priorities and exhaustiveness before approval.

### Add a new fact or operator (code)
Add the fact to `buildFacts` in `src/engine/process.ts`, add its type to `Policy` facts if desired, add a test, and it becomes available to the editor. A new predicate that cannot be expressed by the existing condition DSL needs code; that is the documented boundary.

### Add a new route (code)
Add it to the `Route` union, the route labels/tones, and the execution layer (PO/sourcing materialization). The policy editor will then accept it.

### Change the item matcher or ranking
`src/engine/normalize.ts` and `preferredSuppliers` in `src/engine/process.ts` are pure and covered by the golden tests. Any change must still pass the three worked rankings and the direct-PO anchors.

## Verification

- `npm test` — policy extraction, full-policy refusal and chat slot parsing in a clean clone; with `KIT_DIR` and `ORACLE_CSV` the 186-row golden suite adds 8 tests (17 total).
- `npm run test:golden` — 14 worked decisions, 3 rankings, all 186 rows against the private oracle fixture.
- `npm run smoke:api` — live API health, 186-row process, exports, preferred CSV and policy draft.
- `npm run validate:csv -- file.csv` — exact headers, enums, blocked-supplier guard and PO fields.
- `npm run db:verify` — master counts and sample run counts.
- The independent oracle: `../research/oracle` (44/44). It and the supplied task data are kept outside the public repo; the hosted database is already seeded.

## Trade-offs and next steps

- The chat is deterministic rather than LLM-driven to keep the blind test reproducible. The next step is an LLM tool loop with the same server-side validation and confirmation card.
- Auth is demo-grade; production would use SSO and hard role enforcement.
- PDF extraction is template-aware for the generated contracts; scanned PDFs use manual entry.
- The app does not send real emails/RFQs; approval records a sourcing event with invited suppliers.
- Deployment to Vercel + Neon requires the owner’s credentials; the Docker Compose app is the reproducible local equivalent.
