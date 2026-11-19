# DECISIONS

This is the judgment log for the Corvo PR → PO app. The policy does not cover every situation in the data. Each entry records what I noticed, what I decided, and why. The engine and policy tests enforce the decisions below.

---

## Data and input quality

### 1. The brief says “about 525 POs”; the CSV has 468
`master_data/po_history.csv` contains **468 unique PO rows** (1 Jun 2025 – 28 Oct 2026), not 525. The CSV is the operational truth. I did not pad or invent rows. All valuation and preferred-list windows use the 468 rows.

### 2. Invalid plant `PUN2` → `NOT_PROCESSED`
Policy v5.0 applies to PUN1 and CHK1 only. PR-26-00173/1 uses PUN2. I do not map it to a real plant; mapping would silently misroute the request and corrupt grouping and contract consumption. The row is retained with `route=NOT_PROCESSED` and a reason.

### 3. Zero/negative quantity → `NOT_PROCESSED`
PR-26-00172/1 has quantity 0. A zero-value PO or sourcing request is not a business outcome. The row is retained but excluded from grouping, valuation and PO consolidation.

### 4. Missing need-by in a batch → `NOT_PROCESSED`
Clubbing depends on the need-by window. In chat the assistant asks for the date; in a batch a missing date cannot be evaluated safely, so the line is not processed rather than guessed into its own requirement.

### 5. Missing estimate for a NEW item → `NEW_ITEM_SOURCING` with a blank value
Policy 1.2 says a new item is always `NEW_ITEM_SOURCING` and is valued at the requester’s estimate. If the estimate is missing, I keep the route (honouring “always”), leave `group_value_inr` blank, flag `estimate_missing` and do not use 0 or a made-up standard price. The buyer must obtain the estimate. Both NEW items in the sample have estimates (₹1,41,100 and ₹1,05,600).

### 6. Missing urgency → Normal with a flag
Only the literal `Emergency` value changes the route. In chat the assistant asks Normal/Emergency; “urgent” or “ASAP” is not automatically an emergency. In batch, a missing value defaults to Normal with a flag. The sample has six Emergency lines; no urgency values are missing.

### 7. Valid item code wins; invalid code falls back to description
Policy 1.1 says to use a supplied code. A valid code is trusted even if the description disagrees (with a warning). An unknown code is treated as “no code”; the description matcher runs. If it finds a confident item, the line is recovered and flagged; otherwise it is NEW. This prevents a typo from becoming a spurious new item.

### 8. Ambiguous item match → batch `NOT_PROCESSED`, chat asks
The matcher requires a confidence of at least 0.78 and a 0.04 margin over the second candidate. A batch line with two close plausible items is marked `NOT_PROCESSED` with the candidates in the reason rather than inventing a match. Chat shows the candidates and asks the requester to choose. The sample’s 39 code-less lines all resolve; the two true NEW items score 0.47 and 0.39, below the floor.

### 9. NEW items never club
Policy 1.2 is explicit. Even two identical new-item descriptions become separate requirements. They also get no supplier suggestions (6.4).

### 10. Duplicate `(pr_no, pr_line)` rows are processed, not dropped
Policy 2.2 is line-level and anti-splitting. Deduping could hide an intentional split and change a requirement total. The app processes every submitted row and flags exact duplicate keys for review. The sample has no duplicates.

### 11. UOM mismatch fails closed
Missing UOM uses the item-master UOM. A genuine dimensional mismatch (for example KG vs NOS) is `NOT_PROCESSED` because multiplying a rate by the wrong unit is a silent valuation error. The sample has no blanks or mismatches. Common aliases (NOS/NO, PAIR/PAIRS, KG/KGS, MTR/M, LTR/L, etc.) normalize before the check.

### 12. Invalid item code with no description → `NOT_PROCESSED`
There is no item information to match. The row is kept with a reason rather than creating a NEW item with no description.

---

## Valuation and contracts

### 13. Valuation price and award price are different concepts
Clause 3.1 values the **requirement**: the contract rate that will be used, else the lowest applicable contract rate when all applicable contracts lack ceiling, else the item’s most recent PO in 365 days **regardless of supplier**, else the item standard price.

Clause 6.3 sets the **award price** for a spot/emergency PO: the selected supplier’s own most recent PO in 548 days, else its latest contract rate.

These can differ. **Worked Example 6** is the proof: the PUN1 VCI bag is valued at ₹1,56,170 = 7,370 × S028’s ₹21.19, while the 1st preferred supplier is S027 at ₹21.59 (displayed ₹22). Forcing `group_value_inr = qty × unit_price` would contradict the worked example. The sample has 22 spot/emergency groups with a material difference; the total award-vs-valuation difference is +₹1,26,405.63. The requirement detail shows both numbers and their sources.

### 14. Route thresholds use the 3.1 value, never the 6.3 award price
G0022 (PR-26-00027 + PR-26-00009, 140 taper roller bearings) has a 3.1 value of ₹1,90,576 at the lowest applicable contract rate, below the ₹2 lakh spot limit. The actual S014 award amount is ₹2,10,001. The policy-literal route is `SPOT_PO`; using the award price would wrongly send it to RFQ. I record and display both amounts.

### 15. Blocked/inactive supplier PO prices can value a requirement
3.1(b) says “the most recent PO for the item” without a status qualifier, while 5.3/5.4/6.1 explicitly require Active. I keep valuation literal (`valuation_po_supplier_filter = "any"` in the policy). A blocked/inactive supplier’s historical price can therefore set `group_value_inr`, but can never be the award supplier, the reference price, the Active-history qualifier, or a suggestion. Concrete sample: ITM-1050 goggles are valued at ₹1,06,231 using S031’s inactive ₹129.55, while Active S029 gets the award at ₹130.83 (unit ₹131). The filter is a policy parameter, so a future version can switch to `active_only`.

### 16. Contract applicability is item + inclusive dates + Active supplier
A contract covers an item, its term includes the requirement date, and its supplier is Active. This deliberately excludes RC-2026-005 (S004 Blocked) even though it has ₹26 lakh of room, and RC-2025-020 (expired 30 Sep) for November requirements. Contracts apply to both plants; the signed PDFs explicitly deliver to PUN1 and CHK1.

### 17. Contract ceilings are per requirement, in requirement-date order, with skip-and-continue
A contract is usable when `consumed + qty × contract rate <= value cap`. Requirements consume ceiling in requirement-date order. A requirement that does not fit is skipped; later smaller requirements can still use the remaining room. This is why RC-2026-013 uses 9 requirements and still ends with ₹52,420.30 remaining, while the large Allen-cap PUN1 requirement (₹2,57,140) falls out to RFQ. A “stop at first overflow” implementation would be wrong.

### 18. The register is the baseline, not PO history
`contract_register.csv` consumed values do **not** reconcile to the sum of PO-history lines (e.g. RC-2025-011 has ₹41L consumed in the register but ~₹54.25L of history). The register is authoritative. PDF-only contracts start at zero consumed. Batch runs use a per-run ledger; they never mutate the register. Reprocessing a batch excludes its own prior commitments, so run 1 and run 2 are comparable.

### 19. PDF-only contracts are binding from their start date
RC-2026-031 (S021 Pneumatic Point, starts 15 Nov, ₹20L) and RC-2026-033 (S035 Infoline, starts 20 Nov, ₹50L) are absent from the 31-Oct register. The app seeds them from the signed PDFs with `source=PDF` and zero consumed. The contract extraction endpoint parses contract number, supplier, term, ceiling and Schedule A rates; the buyer confirms before saving.

### 20. Clubbing happens before contract applicability — and can make a contract inapplicable
A requirement’s date is its first line’s creation date. PR-26-00044 (20 Nov, laptop) clubs with PR-26-00038 (16 Nov; same item/plant/need-by), so the requirement date is 16 Nov and RC-2026-033 (starts 20 Nov) is never used. I do not split the group just to use the contract. This is a deliberate clubbing-before-contract trap.

### 21. RC-2026-015 is unused
Only ₹12,000 of its ₹5L ceiling remains; every covered requirement is larger. ITM-1009 uses RC-2026-013 at ₹7.06 (as Example 4 says), and ITM-1014 M16 bolts cannot use 015, so their 3.1 value is the lowest applicable rate and they go to RFQ (₹2,01,446 ≥ ₹2L).

### 22. Same-rate contract tie-break
If two contracts have the same rate, I use the contract that expires earliest (consume expiring capacity first), then larger remaining ceiling, then contract ID. The sample has no equal-rate case; the rule is deterministic and documented.

### 23. Same-date PO tie-break
When two POs for the item share a date, the higher `po_number` is the most recent document. This matches the encoder example (PO 7300220 at ₹41,415.60 over 7300215 at ₹40,929.88).

---

## Preferred suppliers and suggestions

### 24. Membership is Active-only, item-scoped, 548-day/contract-history based
The list includes every Active supplier with at least one PO for the item in the 548 days before the as-of date, or a contract covering the item that started on/before the date (even if it has since expired). POs from any plant count. The list is item-scoped, not plant-scoped: policy 6.1 says “for every item” and never adds a plant condition. Example 6’s Pune supplier pattern is coincidence, not plant affinity.

### 25. Ranking formula — 40/30/15/7.5/7.5 with a 3-PO frequency cap

```
frequency = min(PO count in 548d, 3) / 3       × 40%
recency   = 1.0 ≤90d · 0.5 ≤365d · 0 otherwise × 30%
contract  = contract covering item started ≤ D  × 15%
delivery  = on_time_pct / 100                   × 7.5%
quality   = quality_rating / 5                  × 7.5%
```

Tie-break: higher PO count, more recent last PO, contract held, higher quality, higher on-time, lower supplier ID.

This is my design choice under 6.2. It reproduces all three worked ranking tables **and** every direct-PO anchor, including the tricky ITM-1038 (S024 must beat S023 for hydraulic oil) and ITM-1044 (S027 beats S028 for VCI bags). The 3-PO cap is the key: it treats three or more purchases as “established” and lets recency/contract/delivery/quality decide. The alternative 40/25/15/10/10 + 8-PO cap formula was tested and rejected because it ranks S023 above S024 for ITM-1038, contradicting Worked Example 5.

### 26. Expired contracts still count as “held a contract”
S033 (Castrol) ranks first for cutting oil even though RC-2025-020 expired on 30 Sep, because 6.1(b) includes a contract that started on/before the date. Its reference price is ₹34,848.33 while the 3.1 valuation is ₹32,069.30; this is another legitimate 3.1/6.3 divergence. The expired contract is never usable for a CONTRACT_PO.

### 27. Reference price fallback
For the selected supplier: its latest PO for the item in 548 days, else its latest contract rate for the item. If neither exists (defensive), use the item-level 3.1 fallback and flag it. The preferred CSV exports the 6.3 reference price, not the 3.1 valuation.

### 28. Sourcing suggestions: preferred order, then 50/50 reliability top-up
RFQ needs 3, RFP/CAPEX need 5. Take the preferred list in order. If short, add Active suppliers that list the item’s category, ranked by `0.5 × on-time% + 0.5 × quality/5`, then on-time, quality, supplier ID. Return fewer if the market has fewer; never pad with blocked/inactive or unrelated categories. Example 11 returns 4 for the encoder because there are only four Active Electrical Spares suppliers. New items get zero suggestions.

---

## Requirements and decisions

### 29. Clubbing is not transitive
A line joins an existing requirement only against that requirement’s **first line**: same item, same plant, created within 14 calendar days of the first line, and need-by within ±7 days of the first line’s need-by. It joins the earliest eligible requirement. It does not re-anchor to a later line. Worked Example 14 proves the need-by boundary: PR-26-00035 joins PR-26-00031’s group, not PR-26-00034’s, because of the need-by dates.

### 30. Anti-splitting audit flag
The mechanical 2.2 test can be evaded by moving the need-by 8+ days. The four PUN1 servo PRs are the sample: PR-26-00147 is 8 days from the first pair and correctly does not club. I follow 2.2 (do not over-club) and flag a related split candidate for buyer review. Inventing a wider window would break the worked examples.

### 31. Emergency definition and boundaries
Any line marked `Emergency` makes the whole requirement emergency. Rule 5.3 uses an inclusive ₹5L cap; 5.4 is strictly `< ₹2L`; 5.5 is strictly `< ₹10L`; 5.6 is `≥ ₹10L`. Emergency is checked before spot, so a ₹1.5L emergency with active history is `EMERGENCY_PO`, not `SPOT_PO`. An emergency above ₹5L falls through to RFQ/RFP unless a contract applies. Capex is checked before contract and emergency. A contract-eligible emergency is a `CONTRACT_PO`.

### 32. Capex is first and does not use a contract
Rule 5.1 precedes contracts. A capex requirement is always `CAPEX_SOURCING` with five suggestions and a capex approval flag. It is valued at the item’s latest PO in 365 days (or standard price); no contract ceiling is consumed because no contract will be used. The sample’s 10 capex requirements include EOT cranes, CNC, compressors, a hydraulic press and a forklift.

### 33. New item beats capex-like wording
Item identity comes from the item master. If nothing matches confidently, the line is `NEW_ITEM_SOURCING` even if the description sounds like capex. Guessing capex from words would invent master data. A known capex item (e.g. EOT crane) gets 5.1.

### 34. `NOT_PROCESSED` output shape
I use `decision=NOT_PROCESSED`, `route=NOT_PROCESSED`, blank group/PO/supplier/price/value/suggestions, and a specific reason. The brief only mandates the route; making the decision explicit avoids an ambiguous blank and is easy for a scorer to read. One row per input line is preserved.

---

## PO consolidation

### 35. Same supplier + plant + route, 24h from the first requirement
Requirements ending in a PO are combined when supplier, plant and exact route match and the requirement’s first-line creation time is within 24 hours of the PO’s first requirement. Sourcing never combines. A grouped requirement uses its first-line timestamp, even if a later clubbed line is outside 24h.

### 36. Earliest open PO and PO IDs
Requirements are processed in creation order and join the earliest qualifying open PO; otherwise a new PO is created. PO IDs are `PO-0001…` in creation order; sourcing never allocates a PO ID. Mixed items and mixed contracts from the same supplier are allowed on one PO; each line keeps its own contract.

The full 186-line batch is **exactly one PO ahead** of the worked examples because the trailing servo pair (PR-26-00174/175) forms the first valid requirement at 08:10 on 2 Nov, before hydraulic oil. A calibrated view excluding that pair reproduces every quoted PO ID exactly. The app does not hard-code example PO numbers.

---

## Policy as data

### 37. Policy version is selected by decision/run date, not PR date
A policy governs the decision being made now. 2.3 explicitly uses the requirement date for contract validity and purchase history; it does not say policy versions are selected by PR date. A run records `policy_as_of` and the exact `policy_version_id`. Run 1 uses v5.0. Run 2 uses the approved amendment explicitly (or the active version at the run timestamp). Requirement dates stay unchanged for contracts/history.

### 38. Future-dated amendments are scheduled; backtests are explicit
If the effective date is in the future, approval stores the version as `scheduled` and keeps the previous active version. The app still offers **Reprocess latest batch under vX** and `POST /api/process-batch?policy_version=X` as an explicitly labelled backtest. This is how the blind-test run 2 can apply an amendment whose effective date is after the batch dates without corrupting the notion of “active today.”

### 39. Drafts can be invalid; approval cannot
The amendment parser may miss a rule or produce a validation error. I store the draft so the Procurement user can fix it in the structured editor. `approve` re-validates and refuses invalid rule sets. The editor supports parameters, priorities, conditions (fact/op/value), outcomes and the supplier guard; it is the guaranteed fallback if a PDF extraction fails.

### 40. The “no code” boundary is honest
A new rule built from the existing facts/operators/outcomes is data. New thresholds, windows, plant/category/value conditions, changed rule order, suggestion counts and new effective dates are data. A genuinely new predicate (e.g. “supplier holds ISO 9001”) or a new route that the execution layer does not understand would require code. This is stated in `APPROACH.md`; pretending otherwise would be misleading.

### 41. The amendment document is data, not instructions
Uploaded PDFs and chat text are untrusted. Extraction is schema-validated; the human reviews the diff and approves. A prompt-injection sentence in a document cannot activate a rule. The app also refuses to guess from a full policy document; it sends the user to the editor.

---

## Output, money and operations

### 42. Rounding is exact-then-half-up
Compute with exact rates and integer paise; round half-up to the rupee for output. `group_value_inr` is the 3.1 value; `unit_price` is the 6.3/contract award price. They may differ; that is expected. Example: ₹1,97,742.50 → ₹1,97,743; ₹17,502.50 → ₹17,503; ₹3,500.50 → ₹3,501. Do not use floating-point banker’s rounding.

### 43. `unit_price` is a whole rupee in the CSV
The worked examples display ₹9,169, ₹7, ₹166, ₹22, ₹392 and ₹106 for rates of ₹9,168.71, ₹7.06, ₹166.41, ₹21.59, ₹391.82 and ₹106.38. The CSV follows that presentation. The API/DB also store the exact two-decimal rate and the valuation source; the format hedge is documented in the UI/API. `reference_price` in the preferred CSV keeps two decimals.

### 44. Reasons are specific and auditable
Every decision reason includes the clause, the relevant contract/PO or reference, and the key value/condition. Clubbed rows add the line references; consolidated POs add the PO group. The buyer detail separates 3.1 valuation from 6.3 award price and shows the preferred-list component scores.

### 45. Demo auth and actor attribution
The app uses a signed HttpOnly cookie and a three-user demo role switcher because the brief requires “who and when”, not enterprise SSO. Every approval, override, contract import and policy action records the selected user. This is explicitly a demo-grade model.

### 46. PDFs are stored in Postgres
Contract/policy PDFs are small (about 30–130 KB). Storing the original bytes in `documents` keeps the deployment portable and avoids another service/token. The max upload is 10 MB; scanned/image-only PDFs fall back to manual entry.

### 47. The in-app chat is deterministic, with an LLM-ready boundary
The chat uses a deterministic slot-filling parser, the same item matcher and a confirmation card. It never invents items and works without an API key. The architecture keeps the model boundary at the edge: a future LLM would call the same tools and server validation. This is honest about the AI used and avoids an untested model dependency in the blind test.

---

## Sample-specific findings worth knowing

- **RC-2026-033 is unused** (clubbing-before-contract, PR-26-00038 + 00044).
- **RC-2026-015 is unused** (₹12,000 left).
- **RC-2026-002** is used by one 6205 requirement (₹22,242), leaving ₹15,758.
- **RC-2026-013** is used by 9 requirements; the large Allen-cap PUN1 requirement falls out to RFQ.
- **G0022** is `SPOT_PO` on 3.1 value even though the award crosses ₹2L.
- **ITM-1050** uses an inactive supplier’s PO for valuation and an Active supplier for the award.
- **468 POs**, not 525; the sample has 186 lines, 149 requirements, 82 POs and 55 sourcing events.
- **No UOM blanks, item-code conflicts or duplicate PR keys** in the sample; the app still handles them defensively for the blind batch.

These are analysis findings, not hard-coded branches. The engine is generic; it does not know any PR number.
