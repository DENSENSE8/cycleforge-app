# Handoff — Carton inspector rebuild (Gemini UX verdicts), mid-flight

> **SUPERSEDED (2026-07-29).** Do not resume this doc.  
> Canonical handoff (decision **2a** locked — read inspector replaces `ReceivingDetailsStack`):  
> [`carton-inspector-D4-ROOT-FIX-HANDOFF.md`](carton-inspector-D4-ROOT-FIX-HANDOFF.md).  
> Visual IA (photos button · handling|findings · no Unbox spam):  
> [`carton-inspector-LAYOUT-POLISH-HANDOFF.md`](carton-inspector-LAYOUT-POLISH-HANDOFF.md) +  
> `.claude/rules/display/carton-read.md`. **D3 photo-lead / zero-click filmstrip is overturned.**  
> §0 below is historical (Identity already deleted; industry redesign was built then **reversed**).

**Lane:** `main` (integration/dogfood). Stay on it — no branch, no worktree, never `git stash`.
**State:** uncommitted. The user manages commits.
**Read first:** [`carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md`](carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md) (the brief + measurements) and the Gemini verdicts pasted into the session, summarized in §2 below.

---

## 0. ⚠ THE TREE IS IN A KNOWN-BROKEN INTERMEDIATE STATE

I was three edits into the rebuild when context ran out. **Do these three things first, in order, before anything else.**

| # | Action | Why |
|---|---|---|
| 1 | **Delete** `src/components/receiving/inspector/CartonInspectorIdentity.tsx` | Orphaned by the rewrite. Nothing imports it except the stale guard (next row). It *was* the D4-era "compose the work header with props omitted" adapter — the exact thing D6 rejects. |
| 2 | **Rewrite** `src/components/receiving/inspector/carton-inspector.guard.test.ts` | **It will fail as written.** Line 32 reads `./CartonInspectorIdentity.tsx`; its `identity COMPOSES the shared entity-context card` test asserts the D4 rule that D6 overturned. See §3 for the new contract. |
| 3 | Run `npx tsc --noEmit -p tsconfig.json` | The rewritten `CartonInspector.tsx` has **never been typechecked**. Expect real errors (icon names, `PhotoThumb` props, `xl:grid-cols-[3fr_2fr]`). |

Nothing else in the working tree is mid-edit.

---

## 1. What the rebuild is

`/carton/[id]` (read-only carton view, Phase 4 / D4) shipped 2026-07-28 and was **rejected on sight by the product owner**. The brief measured why: 720px column = 50% of a 1440px viewport (37.5% at 1920), **25 facts / 354 chars above the fold**, the word "Kai" 4× and one date 4×, and **7 photos hidden behind a click**. It was *document calm*, which the house identity explicitly bans.

Gemini Pro reviewed it and returned verdicts on 8 decisions. §2 is the compressed ruling; the full text is in the session transcript and should be pasted into the brief as an addendum if you want it durable.

---

## 2. Gemini's verdicts (all PROPOSED unless noted)

| # | Verdict | Status |
|---|---|---|
| **D1** Density | Dense-by-default `ops`; multi-column; target ~80–120 facts/screen | **done in the rewrite** |
| **D2** Answer-first | Lifecycle state hero at top-left ("is it done?" before anything else) | **done** |
| **D3** Photos | **Lead the layout.** Filmstrip of ~120px thumbs, zero clicks. Empty state must be explicit ("no photos captured" is itself claim-relevant) | **done** |
| **D4** Provenance | Collapse single-actor/single-session to one line; `[+]` expander for the second-precision audit rows | **done** |
| **D5** Width | Full-width responsive, 2-col ≥1280px. 720px is a *prose* rule, not a data rule | **done** |
| **D6** Shared-primitive rule | **Category error.** Share the read model, tokens and *atoms*; **do NOT share layout panels.** Drift is governed by typed props, not by forcing one component onto two jobs | **code done; GUARD NOT YET UPDATED** (§0 row 2) |
| **D7** Surface shape | **Shape B** — non-modal right rail, deep-linked via `?inspect=carton-<id>`, NOT a full route | **NOT STARTED — and see §4, it has a blocker Gemini did not know about** |
| **D8** Should it exist | **KEEP.** "Safe to open" decays over a 3-year horizon; a structural read-only boundary is the durable guarantee | no action |

Caveat worth carrying: Gemini's "80–120 facts per screen" is an enterprise-WMS figure. Our test carton has **one line item and one serial** — there are not 80 facts to show. The honest target is *use the width* (evidence + contents + handling + history side by side), not manufacture density.

---

## 3. What the rewrite already did

### `carton-inspector-model.ts` — pure, **11/11 tests green**
Added and tested:
- `cartonLifecycle(receiving)` → `{ state, label, tone, done }`, most-advanced milestone wins (`received ⊃ unboxed ⊃ opened ⊃ scanned ⊃ expected`). Returns a **semantic tone**, never a class — views stay dumb.
- `collapseProvenance(milestones)` → one-line summary `{ actor, firstAt, lastAt, steps }`, and **returns `null` when >1 actor or any step is unattributed** — then per-step attribution IS the content and must not be hidden. That refusal is tested; keep it.

Already there from Phase 4: `buildCartonMilestones`, `cartonTimelineAnchor`, `cartonContentsSummary`, the payload types.

### `CartonInspector.tsx` — rewritten, **not yet typechecked or seen**
Shape now:
```
header (full width, non-scrolling)
  ‹ back · ●  Lifecycle label · [Work complete] · | PO chip · tracking chip · carrier · platform      [Open in Unbox]
scroll body (px-6, full width)
  EVIDENCE   ← photo filmstrip, 120px PhotoThumb tiles, horizontal scroll, zero clicks
  grid xl:[3fr_2fr]
    CONTENTS (dense rows: title, qty, SKU, condition, PO chip, tracking, serial chips)
    HANDLING (collapsed provenance + expander)  ·  HISTORY (WorkspaceTimelineTab)
```
- Two queries: `['carton-inspector', id]` → `GET /api/receiving/[id]`, and `['receiving-photos', String(id)]` — **the same key `ReceivingPhotosSection` uses**, deliberately, so they share one cache entry instead of double-fetching.
- `WorkspaceTimelineTab` is still composed (a genuinely shared, self-fetching primitive — D6 does not ban sharing, it bans forcing *layout* panels).
- `ReceivingPhotosSection` is **no longer used** (its launcher was the D3 failure). Check knip afterwards — it has other consumers, so it should stay alive; if knip flags it, that's a real signal.

### New guard contract for §0 row 2
Keep (these still hold):
- no `method: 'POST'|'PATCH'|'PUT'|'DELETE'`, no `useMutation`, no `emitReceiving`, no `dispatchLineUpdated`, no `transition(`
- no import of `LineEditPanel` / `ReceivingLineWorkspace` / `UnboxWorkspaceView` / `StationTerminalDock` / `StationComposerDock` / `StationWorkbench`
- `openInUnboxHref` present (the escape is a link)
- `formatDateTimePST` used; **no `new Date(`** anywhere in the inspector or model (see §6 timestamp trap)
- model stays import-free and fetch-free

Delete (D6 overturned them):
- the whole `identity COMPOSES the shared entity-context card` test
- the `WorkspaceTimelineTab` / `ReceivingPhotosSection` *must be present* assertions — sharing is now a choice, not a rule

Add (encode D1–D5 so the rejection can't silently return):
- no `max-w-[720px]` / `STATION_WORKBENCH_COLUMN` in the inspector (D5)
- `cartonLifecycle` is called (D2 — the answer-first hero exists)
- `PhotoThumb` is rendered directly, and the string `View Receiving Photos` does **not** appear (D3 — evidence is not behind a launcher)
- `collapseProvenance` is called (D4)

---

## 4. ⚠ D7 has a blocker Gemini did not know about

Gemini says: move to `RightRailHost` and deep-link with `?inspect=carton-<id>`.

**Verified good news:** `RightRailHost` is mounted in `AssistantProvider`, which is in `src/app/layout.tsx` — so it is **app-global**, and `GlobalDetailStackHost` already exists precisely to "open detail slide-overs from anywhere without navigating away." A deep link from any context therefore *can* find a host. Gemini's shape is implementable.

**The blocker:** that global host **already registers a carton panel** — `ReceivingDetailsStack` (`kind: 'receiving'`, opened via `openDetailStack({ kind, id })`, rendered through `DetailStackRailRegistrar`). It is **editable** (Edit / Delete / refresh actions, `useReceivingDetailForm`, progress + items tabs).

So doing D7 blind would put **two carton panels in the same right-edge slot** — one editable, one read-only — which is exactly the "two shapes for one job" the house bans. Before implementing D7, someone must decide:

- **(a)** the inspector *replaces* `ReceivingDetailsStack` (its edit actions move to Unbox), or
- **(b)** they coexist with a stated rule for which opens when, or
- **(c)** D7 is declined and `/carton/[id]` stays a route.

**Recommendation: ask the user.** This is an architecture call, not an implementation detail, and Gemini's D7 was made without knowledge of the existing occupant. Note also that Gemini's suggested href `/search?inspect=…` is wrong for this codebase — `/search` was deleted; the search surface is `/dashboard?mode=search`.

Also flagged in the brief and still true: **we deviated from D4's original text** (it proposed the *search result itself expands*; we built a separate route). D7 is the chance to revisit that.

---

## 5. Verify — exact recipe

### Tests
```bash
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/components/receiving/inspector/carton-inspector-model.test.ts \
  src/components/receiving/inspector/carton-inspector.guard.test.ts \
  src/lib/search/search-hit.test.ts \
  src/lib/receiving/unbox-lookup-scan.test.ts \
  src/components/sidebar/receiving/scan-apply.test.ts \
  src/app/api/receiving/lookup-scan-wiring.guard.test.ts
```
Model alone is **11/11** today. The shim is required — bare `tsx --test` throws on anything reaching `@/lib/db`.

### Browser (this works; don't re-derive it)
- `tests/.auth/admin.json` holds a **live `cf_sid`** (staff 15, org `…0001`, valid to 2027). A global-setup 401 only means *minting* failed — the saved state is fine.
- Drive `chromium.launch()` + `newContext({ storageState: 'tests/.auth/admin.json' })` directly; skip the Playwright runner.
- **Use `localhost`, not `127.0.0.1`** — the cookie's domain is `localhost`.
- **The port floats.** The other lane restarts the dev server constantly; it has been on **:3050 and :3000** within one session. Check: `lsof -nP -iTCP -sTCP:LISTEN | awk '$9 ~ /:30[0-9][0-9]$/'`
- **Warm the route first** or the first Turbopack compile eats the nav timeout:
  `curl -s -o /dev/null -w "%{http_code}\n" -m 600 --cookie "cf_sid=$SID" http://localhost:3050/carton/49929`
- A script outside the repo can't resolve `playwright` — import `/Users/icecube/repos/cycleforge-app/node_modules/playwright/index.js` (CJS: default-import then destructure).
- Match receipt/inspector copy on apostrophe-free substrings — the components render `&rsquo;`, and `innerText` applies `text-transform` (the eyebrow reads `CARTON · READ-ONLY`).

### Test data (real, dogfood org `00000000-0000-0000-0000-000000000001`)
| Carton | Why it's useful |
|---|---|
| **49929** | PO `19-14910-41811`, FedEx, tracking `…874847124243`, 1 line, 1 serial, **7 photos**, unboxed by **Kai** (staff 7). The measurement baseline. |
| **50200** | **Unfound** (no PO) + unboxed — exercises the no-PO fallbacks. Tracking `9549015461676204390049`. |

### Re-measure to prove the fix
Compare against the brief's Appendix B: `1440×900 → 25 nodes / 354 chars, column 720px (50%)`. The rebuild should show materially more facts and ~100% width utilization. A measurement script pattern is in the session scratchpad; re-writing it is ~20 lines (`getBoundingClientRect` on the content column + count leaf text nodes inside the viewport).

---

## 6. Constraints — fixed

- **No new endpoint.** `GET /api/receiving/[id]` returns identity + milestones + lines + serials + totals + events in one call. Photos come from `GET /api/receiving-photos?receivingId=`.
- **No migration.**
- **Timestamp trap:** carton milestone fields are `to_char(ts::timestamp, …)` with the DB session on `America/Los_Angeles` — **warehouse wall-clock strings, not instants** (21:26:58Z arrives as `2026-07-28 14:26:58`). `formatDateTimePST` parses that naive shape purely. **`new Date(str)` on them double-shifts** and is banned by the guard. `events[].occurred_at` *is* a real instant — same formatter, different branch.
- Presentation SoTs are non-negotiable: `CopyChip` family, `conditionLabel`, `src/utils/date.ts`, semantic tokens only, one type family, **600 weight ceiling** (`font-bold` is banned and ratcheted), density-aware spacing.
- **Never raise a ratchet baseline** to land anything.
- `searchHitHref('RECEIVING', id)` → `/carton/${id}` is live and every consumer composes it (`global-entity-search.ts` was the last hardcoded twin and now composes it too). Changing the destination is a **one-line change in `search-hit.ts`** — plus its tests in `search-hit.test.ts`, `hybrid-retrieval.test.ts`, `support-ticket-search.test.ts`, `timeline/ops-events.test.ts`, `assistant/tools/read-tools.test.ts`.

---

## 7. The other lane — do not chase its failures

Another agent is refactoring modes→routes on this same worktree, **~934 changed files and still writing**. `npm run verify` is not a clean signal. Failures seen this session that are **theirs, not ours**:

- Typecheck: `StationHistoryTable.tsx`, `useCompleteCarton.ts`, `PhotoInspectorPanel.tsx`, `usePhotoLibraryUrlState.ts`, `google-sheet-rows.ts` (the set churns minute-to-minute)
- DS ratchet: `font-bold` at `PoLineRow.tsx:221`; dialog-shell count
- Knip: ~20 findings in station / photos / packer / order-display
- Route-permission drift: untracked `/api/kiosk/dev-autopair`

**Judge this work by the targeted test run in §5 and by whether a failure names a file under `src/components/receiving/inspector/`, `src/lib/search/`, or `src/app/carton/`.** Do not fix their files.

---

## 8. Prior context, in one line each

- **Phases 1 & 2 (landed, verified live):** scan-vs-lookup classification. A scan on an already-unboxed carton is a `lookup` — no `scanned_by` overwrite, no work event, one append-only `RECEIVING_LOOKUP_SCAN`. Proven on carton 50200: `scanned_by` stayed 7 while staff 15 scanned.
- **Lookup receipt:** the "Already unboxed" card on `/unbox`, with PO (last-4) · Tracking · Unboxed · Unboxed by in one `justify-between` band, and a full-width **Open package details** button.
- **A lookup does not touch the sidebar rail** (no upsert, no triage purge) — regression-tested in `scan-apply.test.ts` and confirmed server-side (no ranking timestamp moves).
- **Global search auto-opens a sole result of any entity type** (`soleHitHref`). With `searchHitHref('RECEIVING')` → `/carton/`, the loop is: scan → receipt → Open package details → search → auto-open → **read view**, never the editor. Traced twice.
- Full phase log: [`unbox-scan-vs-lookup-EXECUTION-PROMPT.md`](unbox-scan-vs-lookup-EXECUTION-PROMPT.md) §2b–§2e.
