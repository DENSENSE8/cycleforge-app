# Plan — turn the 18 failing angles into passes

**Input:** `docs/todo/operator-reports-adversarial-VERIFY-RESULT.md` (18 FAIL · 2 PASS · 10×S1 · 2×S2)
**Harness that grades it:** `scripts/agui-validation/` + the attack scripts in `.tmp/agui-validation/attacks/`
**Screenshots:** `docs/todo/screenshots/ag-ui-validation/`

---

## The finding that makes this cheap

**18 failing angles are not 18 defects. They are six root causes.** Four of them are a handful of
lines in two files. The audit produced a long list because it attacked from 20 directions, not
because the foundation is broken in 20 places:

| Root cause | Where | Angles it fails |
|---|---|---|
| A ratio computed over two different row sets | `packing-performance.ts:346` vs `:348-351` | 10, 11, 12 (part), 19 (part) |
| `minutes()` discards the remainder past 24 h | `report-kit.ts:66-75` | 8, 12 (part) |
| `money()` drops cents at ≥ $1000 and prints `-$0.00` | `report-kit.ts:42-55` | 8 (part) |
| The unbox report re-types the bench's predicate instead of importing it | `unbox-backlog.ts:143-160` vs `build-sql.ts:577` | 7 |
| The panel indexes cells and prints strings without a boundary guard | `ReportArtifact.tsx:261,278`; `ui-artifacts.ts` sanitizer | 1, 2, 3 |
| Nothing marks provenance or staleness, and six guards never fire | loops, `session-surface-cohort.ts`, `SESSION_ARTIFACT_KINDS` | 4, 6, 13, 15, 16, 17, 18, 20 |

So the order below is by **S1s retired per line changed**, not by angle number.

## How "pass" is measured

The verification harness is the acceptance test — that is the point of having built it:

```bash
npx tsx .tmp/agui-validation/attacks/<angle>.ts      # the attack that produced the FAIL
npx tsx scripts/agui-validation/build-cases.ts       # re-render the findings into the panel
node scripts/agui-validation/shots.mjs               # re-shoot docs/todo/screenshots/ag-ui-validation/
```

An angle is done when its own attack script reports zero failed checks **and** the promoted
regression test lives in `src/`, not in `.tmp/`. Each wave below names both.

---

## Wave 1 — Two functions in `report-kit.ts`

**Retires:** angle 8 (S1, 4 non-reconciling totals cells + every money defect), angle 12's two
unreproducible numbers. **Cost:** ~25 lines in one file.

1. `minutes()` — `` `${d}d ${h % 24}h` `` throws away the remainder minutes while sub-24 h rows keep
   theirs, so a column visibly fails to add up to its own total (`2d 8h` printed for 3410 min).
   Print the minutes (`` `${d}d ${h % 24}h ${rem}m` ``) or drop the day form entirely. One of the
   two — never a format whose precision depends on magnitude.
2. `money()` — `maximumFractionDigits: n >= 1000 ? 0 : 2` is the same defect in dollars: `$1,499.99`
   prints `$1,500` while `$999.99` keeps its cents. Fix to 2 everywhere. Normalize signed zero
   (`n === 0 ? 0 : n`) so `-0` stops printing `-$0.00`, and strip thousands separators before
   `Number()` so `'1,499.00'` stops silently becoming an em dash.
3. **Promote the tripwire:** `.tmp/agui-validation/attacks/a8-numeric-truth.test.ts` →
   `src/lib/reports/report-totals.test.ts`. It is a general property over any `ArtifactReport`
   (every numeric `totals` cell equals the sum of its column, with the non-additive keys declared
   and justified), so it covers reports that do not exist yet.

## Wave 2 — One box set per ratio

**Retires:** angle 10 (S1), angle 11 (S1), the rest of 12, and the largest cluster of 19's
mismatched definitions. **Cost:** one aggregation loop + the verdict helpers.

1. `packing-performance.ts:346` adds `standard` to `agg.earned` for **every** completion, while
   `:348-351` adds handle minutes **only when a scan paired**. Efficiency = earned ÷ handle then
   divides a whole-day numerator by a partial denominator: three unpaired boxes paint a green 125%,
   500 tiny completions paint 250%. Split the accumulator — `earnedAll` (headline, capacity,
   tier mix) and `earnedPaired` (the efficiency numerator) — and compute efficiency from the paired
   pair only.
2. Add the coverage number the report currently hides: `paired ÷ boxes` as a KPI. On live data that
   is **0 %** (52 completions, 0 scans on 2026-09-01), which is exactly what an owner must see
   before reading an efficiency figure at all.
3. Stop `Math.max(0, handle)` swallowing a completion that precedes its scan. A negative handle is
   clock skew, not zero: count it in `notes[]` and exclude it from both sides of the ratio.
4. `statusAbove` / `statusBelow` have no ceiling, so 400 % efficiency and 667 % utilization paint
   `good`. Add an implausibility band (`statusAbove(v, good, watch, { ceiling })`) and use it on
   every ratio KPI.
5. Rewrite each affected `definition` to name its denominator. A definition that is *almost* right
   is worse than none — that is angle 19's verdict, and it is retired by saying which boxes count.
6. **Tripwires:** the boundary table from `.tmp/…/angle11-thresholds.ts` promoted to
   `src/lib/reports/report-kit.test.ts`, plus a test asserting every ratio KPI's numerator and
   denominator come from the same row set.

## Wave 3 — Import the bench predicate instead of re-typing it

**Retires:** angle 7 (S1) — the single most dangerous number in the foundation: the report says
**254 cartons**, the desk says **22**, and the report's own `notes[]` claims they match.
**Cost:** one import, one deleted sentence, one test.

1. `unbox-backlog.ts` carries 2 of the 7 clauses in `scannedViewPredicateSql`
   (`src/lib/receiving/lines/build-sql.ts:577`). Import it. If the report genuinely needs a different
   window, then delete the "Same predicate as the triage to-unbox queue, so this count matches the
   bench" claim from `notes[]` — one of the two must go.
2. 189 of the 254 cartons have zero `receiving_line` rows and 43 already have
   `quantity_received > 0`. Whatever the predicate ends up being, those two populations get named on
   the report face as declared blind spots.
3. Fix the adjacent bug the audit tripped over: `/api/receiving-lines` honours `count_only=1` but
   ignores `count_only=true`.
4. **Tripwire:** a QA-org test asserting the report's headline equals the desk endpoint's count.
   Two doors onto one destination that disagree is the fork this repo forbids.

## Wave 4 — Four guards at the panel boundary

**Retires:** angle 2 (S3 — a valid payload unmounts the operator's whole session), angle 3 (S1 —
RTL override on a money column), angle 1's renderable defects. **Cost:** four small edits.
Independent of waves 1-3; can run in parallel.

1. `ReportSection` — `Object.hasOwn(row, col.key) ? row[col.key] : null` for rows **and** totals.
   A column keyed `toString` currently resolves to `Object.prototype.toString` and takes the route
   down. This is the guard `toolActivityPhrase` already carries.
2. Strip Unicode bidi controls (U+202A–U+202E, U+2066–U+2069) and zero-width joiners from every
   report string at the `ui-artifacts` boundary, beside the existing `cellString()`.
3. `headline.value` gets the same `trim().min(1)` that `title` has, so a report cannot render with
   no headline number.
4. `artifactReportSectionSchema` gets a `superRefine` rejecting duplicate column keys — today two
   columns with the same key render identical data under different labels and log six React
   duplicate-key errors.
5. **Tripwires:** the prototype-key payload and the bidi money cell, as schema/renderer tests.

## Wave 5 — Provenance, staleness, and the six guards that never fired

**Retires:** angles 4, 13 (S1), 15 (S1), 16 (S3), 17 (S2), 18 (S3), 20 (S1). Each item is small and
independent; batch them.

| Item | Change | Angle |
|---|---|---|
| Containment covers the renderer | `ARTIFACT_PLANE_FILES` += `ReportArtifact.tsx`, `renderers.tsx`; broaden the guard to `@/lib/db`, `tenantQuery`, any non-GET `fetch` | 17 (S2) |
| Stale report on a failed turn | On a tool error, age or badge the current artifact; emit a failed-artifact frame so the panel can say the read failed instead of leaving yesterday's number standing | 13 (S1) |
| Unsourced prose | Mark tool-backed turns in the transcript (the loop already knows), and cap `render_artifact` per turn server-side, not only in the client store | 15 (S1) |
| Kinds ↔ renderer | `assertNever(kind)` in the panel switch + a test that every `SESSION_ARTIFACT_KINDS` entry has a branch and a schema member (the constant has **zero consumers** today) | 20 |
| Aliases + prompt round-trip | Every report tool's `TOOL_ALIASES` route back through `subsetAdvertisedTools`; every `ASSISTANT_TOOLS` name appears in `buildSystemCore` and vice versa | 20 |
| Columns ↔ rows ↔ totals | Key-equality test over every fixture section | 20, 1 |
| Envelope opt-in | Brand `reportEnvelope()` output (symbol or a `REPORT_TOOL_NAMES` gate in dispatch) and print the producing tool on the panel | 4 |
| Mouth carve-out | The `classifiedFacts` → toolless `phrasing` branch is provider-dependent: 59 of 240 reachable rows answer a report question in prose, and `ollama` is exempt. Make every reachable provider tool-capable | 16 (S3) |
| Panel a11y | `tabIndex={0}` + `role="region"` + label on each section scrollport (closes the axe violation); collapse the surface to one column under ~700 px so the plane is reachable at phone width | 18 (S3) |
| Report permission | Raise `get_order_value_rank` to `orders.view`; gate the delegation report's `ops_plan_tasks.title` rows on `operations.plans.view` | 6 (S2) |

**Angle 6 needs the owner, not a patch.** It is a policy call about who may see order value and
desk-task titles. Everything else in this wave is mechanical.

## Lane 0 — the 13 red unit tests (parallel, unrelated to the reports)

`main`'s unit suite was already red before this work (CI receipts: `Unit tests=ran ✗` on the last
six commits). The 13 are mostly ratchets whose baseline moved during the in-flight refactor:
raw-neutral classes, native `title` tooltips, raw HTML product tables, counter event union,
`PRODUCT_TABLES` coverage, mobile app titles, nav pin/codes ×3, rail-less Settings/Admin,
default-omit wires, exempt paths, integration-disconnected hint. Triage in one pass: each is either
"the baseline legitimately moved — update the ratchet" or "the refactor dropped a case — restore
it". Do this lane first if a green pre-push hook matters more than the report numbers, because it
is what currently forces `--no-verify`.

---

## Sequencing and effort

```
Lane 0  (13 red tests)      ─────────────┐  independent, unblocks `git push` without --no-verify
Wave 1  (report-kit)        ──┐          │
Wave 2  (one box set)         ├─ 1 before 2 (2's assertions read formatted minutes)
Wave 3  (bench predicate)   ──┘ independent
Wave 4  (panel boundary)    ──── independent, parallel with 1-3
Wave 5  (guards/provenance) ──── last: the tripwires should pin the CORRECTED behaviour
```

**If only three things get done:** Wave 1, Wave 2, Wave 3. That is two functions, one aggregation
loop and one import — and it retires **six of the ten S1s**, including every wrong number an owner
would act on. Wave 4 is the cheapest S3 in the list (four lines stop a valid payload from destroying
the session). Wave 5 is what keeps all of it true in six months.

**Definition of done for the whole plan:** every attack script in `.tmp/agui-validation/attacks/`
reports zero failed checks, every promoted tripwire lives under `src/`, and a re-run of
`scripts/agui-validation/shots.mjs` regenerates
`docs/todo/screenshots/ag-ui-validation/` with 20 PASS panels.
