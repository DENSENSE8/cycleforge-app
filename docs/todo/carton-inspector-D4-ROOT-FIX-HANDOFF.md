# Handoff — Kill the D4 layout mistake; carton read owns the job (decision 2a)

**Status:** EXECUTED (2a + disposition) — **visual polish incomplete**  
**Follow-up handoff (photos button · columns · strip Unbox spam):**  
[`carton-inspector-LAYOUT-POLISH-HANDOFF.md`](carton-inspector-LAYOUT-POLISH-HANDOFF.md)  
**Lane:** `main` (integration/dogfood). Stay on it — no branch, no worktree, never `git stash`.  
**Commits:** user manages. Stage only files you touch.  
**Supersedes:** [`carton-inspector-REBUILD-HANDOFF.md`](carton-inspector-REBUILD-HANDOFF.md) (mid-flight Gemini rewrite — **do not resume that doc’s §0**; Identity is already deleted, current tree is the post-Gemini document-stack UI + a **reversed** industry redesign).  
**Research:** [`carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md`](carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md)

---

## 0. Read this first (why previous attempts failed)

| Attempt | What happened |
|---|---|
| **v1 CartonInspector** | Composed Unbox layout panels with edits stripped (“lobotomized work chrome”). Rejected on sight. |
| **Gemini rebuild (current HEAD)** | Fixed width/photos/provenance collapse, but kept **document IA** (Evidence → Overview → Contents → Activity → Handling → History → Record). Still bad. |
| **Industry redesign (reversed)** | New components under `inspection/*`, then **fully reverted** by product owner. Do not resurrect that tree from memory — start from job + acceptance criteria below. |

**Root cause (not “missing components”):**

1. **Old D4 implementation mistake:** “read view must compose the **same Unbox layout panels**.” Gemini D6 overturned this as a category error — share **read model + atoms only**. Agents still misread “compose first” as “reuse Unbox chrome.”
2. **Undecided surface ownership:** `/carton` (read) + Unbox (work) + **`ReceivingDetailsStack` (editable rail)** = three carton UIs → pressure to share wrong things or fork forever.

**Product decision — LOCKED (2026-07-29): option 2a**

> The **read carton inspector replaces `ReceivingDetailsStack`.** Edit/Delete/form actions leave that stack; mutation happens only on Unbox (or other explicit work surfaces). One read assembly owns “look up this carton.”

---

## 1. Locked decisions (do not re-litigate)

| # | Decision | Law |
|---|---|---|
| **S1** | Read door exists | Keep `/carton/[id]` + `searchHitHref('RECEIVING')` → `/carton/${id}`. Scan-vs-lookup Phase 2 stays. |
| **S2** | Sharing boundary (D6) | Share `carton-inspector-model` + atoms (`PhotoThumb`, CopyChip family, `formatDateTimePST`, condition/status tones). **Never** require Unbox layout panels / `CartonContextCard` / workbench shells. |
| **S3** | Surface ownership (**2a**) | `ReceivingDetailsStack` is **retired as the editable carton detail**. Call sites that opened it for “see this carton” open the **read inspector** instead. Edits → Unbox link only. |
| **S4** | Deep link SoT | Canonical carton URL remains `/carton/[id]`. Prefer **navigate to `/carton/[id]`** over mounting a second rail UI (single surface; no twin). |
| **S5** | Safety | Read surface: no writes, no editor imports, escape = `openInUnboxHref`. Guard keeps these forever. |
| **S6** | Human visual gate | No “done” until owner looks at **49929** (photos + lines) and **50263** (unmatched / empty lines) on `:3050`. |

---

## 2. Acceptance criteria (pass/fail — not a section list)

Operator questions (frequency order):

1. Is this carton actually settled?  
2. Show claim photos (zero clicks).  
3. What was in it / what’s missing — with a next action.  
4. Who handled it (audit on demand).  
5. One clear identity (Carton id · tracking · PO).

**Must pass:**

- [ ] Header **never** shows “complete / work complete” while any of: pairing `UNFOUND`, triage incomplete (after open), opened with **0 lines**, or needs-test + QA `PENDING`.
- [ ] Empty Contents / Activity / Units do **not** render equal-weight dashed “nothing here” bands.
- [ ] Claim photos visible above the fold at zero clicks (empty ≠ fetch error — branch copy).
- [ ] One identity line includes **Carton `{id}`** (not only tracking last-4).
- [ ] Incomplete cartons: primary CTA is Unbox (or record-contents), not a quiet secondary.
- [ ] Audit/history is collapsed or below the fold — not competing with findings.
- [ ] No import of Unbox/workbench editor shells on the read path.
- [ ] `openDetailStack({ kind: 'receiving', id })` / inbound-feed “open carton” no longer mounts editable `ReceivingDetailsStack` as the answer — lands on `/carton/[id]` (or equivalent read-only host that **is** that assembly).

**Must not:**

- Restyle the current Section/Eyebrow document stack in place and call it done.  
- Reintroduce `CartonInspectorIdentity` / forced `CartonContextCard` composition.  
- Raise DS ratchet baselines.  
- Start/restart/kill the dev server (attach `:3050`).

---

## 3. Execution phases (order matters)

### Phase A — Teach the law (docs + one rule line) — do first

1. Add to [`.claude/rules/pattern-evolution.md`](../../.claude/rules/pattern-evolution.md) (Always or a short “Read/work pairs” note):

   > Carton **read** (`/carton`) vs Unbox **work**: share the **read model + atoms** only. Never require shared layout panels or identity cards. A new assembly for the read job is correct. Anti-pattern name: **lobotomized work chrome**.

2. Stamp [`carton-inspector-REBUILD-HANDOFF.md`](carton-inspector-REBUILD-HANDOFF.md) header: **SUPERSEDED by this file**; §0 is historical.  
3. In Gemini brief, mark **D6 as LAW** and **D7 resolved by 2a** (canonical route; stack retired — not a second rail twin).

### Phase B — Retire editable `ReceivingDetailsStack` as carton detail (2a)

**Goal:** one read door.

Concrete approach (preferred):

1. Inventory every opener (non-exhaustive — grep and expand):

   - [`GlobalDetailStackHost.tsx`](../../src/components/detail-stacks/GlobalDetailStackHost.tsx) — `kind: 'receiving'`
   - [`ReceivingDashboardOverlays.tsx`](../../src/components/receiving/ReceivingDashboardOverlays.tsx)
   - [`TechDashboardOverlays.tsx`](../../src/components/tech/TechDashboardOverlays.tsx)
   - [`ReceivingInboundFeed.tsx`](../../src/components/station/ReceivingInboundFeed.tsx) (row click → parent opens stack)
   - [`utils/events.ts`](../../src/utils/events.ts) (receiving overlay helpers)
   - Assistant recents / `openDetailStack`

2. Change receiving openers to **`router.push(`/carton/${id}`)`** (or `searchHitHref('RECEIVING', id)`).  
3. Remove `ReceivingDetailsStack` from global/host overlays **or** turn it into a thin redirect stub that navigates and closes.  
4. Preserve anything the stack uniquely owned that is **not** “inspect carton”:

   - Progress / items tabs used on triage/unbox benches — do **not** delete without checking callers. If Unbox/Triage still need progress UI, keep those **as workbench pieces**, not as the global detail stack.  
   - `useReceivingDetailForm` Edit/Delete — must not appear on the read path; if still needed, only behind an explicit Unbox/edit intent on a work surface.

5. Update [`lib/detail-stacks/registry.ts`](../../src/lib/detail-stacks/registry.ts) + tests: `receiving` either deep-links to `/carton` or drops from global stack kinds.  
6. Tests: no `openReceivingId` / `openDetailStack(receiving)` path remounts the editable form as the default “look” action.

### Phase C — Guard contract (safety + anti-relapse; unpin frozen UI names)

Rewrite [`carton-inspector.guard.test.ts`](../../src/components/receiving/inspector/carton-inspector.guard.test.ts):

**Keep:**

- No POST/PATCH/PUT/DELETE, no `useMutation` / `emitReceiving` / `dispatchLineUpdated` / `transition(`
- No editor imports (`LineEditPanel`, `UnboxWorkspaceView`, Station docks/workbench, …)
- `openInUnboxHref` present
- `formatDateTimePST`; no `new Date(`
- Model import-free / fetch-free
- No `STATION_WORKBENCH_COLUMN` / `max-w-[720px]` / `max-w-3xl` / `max-w-2xl` on the read surface
- No string `View Receiving Photos`
- Photo query must not swallow failure into `[]`

**Replace name-pinning with intent:**

- ~~must call `cartonLifecycle`~~ → disposition/answer derived from model (exceptions **outrank** lifecycle.done)  
- ~~must call `PhotoThumb`~~ → evidence visible at zero clicks (thumb or stage OK)  
- ~~must call `collapseProvenance`~~ → single-actor provenance collapses somewhere in the tree  

**Ban:**

- Any test requiring `CartonContextCard` / Unbox layout panel composition  
- Mandating `ReceivingPhotosSection` / `WorkspaceTimelineTab` presence

### Phase D — Model: disposition truth

Extend [`carton-inspector-model.ts`](../../src/components/receiving/inspector/carton-inspector-model.ts) (pure, tested):

- `cartonExceptions(receiving, totals)` — UNFOUND, no lines after open, triage incomplete after open, QA pending when needs_test  
- `cartonDisposition(receiving, totals)` — `complete` only if lifecycle.done **and** zero exceptions; else `unmatched` / `needs_action` / `in_progress`  
- Unit tests covering the screenshot failure mode (received + UNFOUND + triage + 0 lines ≠ complete)

Keep existing milestones / timeline anchor / contents summary.

### Phase E — Greenfield read assembly (new files; thin route)

Do **not** restyle the monolithic `CartonInspector.tsx` Section soup.

1. New tree under `src/components/receiving/inspector/inspection/` (names flexible):

   - Page shell  
   - Disposition bar (single truth + Carton id · tracking · PO + Unbox CTA)  
   - Evidence stage (large selected + filmstrip + lightbox; empty ≠ error)  
   - Findings rail (exception cards with CTAs; contents when present; sparse non-duplicative facts)  
   - Audit drawer (handling / events / timeline / record — collapsed)

2. [`CartonInspector.tsx`](../../src/components/receiving/inspector/CartonInspector.tsx) → thin re-export.  
3. Route [`src/app/carton/[id]/page.tsx`](../../src/app/carton/[id]/page.tsx) unchanged mount.  
4. Share **atoms + model only**. `WorkspaceTimelineTab` optional inside Audit.

**House style:** Kinetic Ledger taste OK; **document equal-band IA is not**. New components for this job are **allowed** (S2).

### Phase F — Verify + visual gate

```bash
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/components/receiving/inspector/carton-inspector-model.test.ts \
  src/components/receiving/inspector/carton-inspector.guard.test.ts \
  src/lib/detail-stacks/registry.test.ts
# plus any opener / search-hit tests you touch

npm run verify
```

Browser (auth: `tests/.auth/admin.json`, cookie domain `localhost`, port **:3050** — attach, don’t start):

| Carton | Expect |
|---|---|
| **49929** | Photos + ≥1 line; disposition truthful if UNFOUND/triage still set |
| **50263** | Unmatched / needs action; contents exception + Unbox CTA; **no** “Work complete” beside triage |

**Stop and ask the human to look before declaring done.**

---

## 4. File map

| Concern | Path |
|---|---|
| Route | `src/app/carton/[id]/page.tsx` |
| Current (bad) UI | `src/components/receiving/inspector/CartonInspector.tsx` |
| Read model | `src/components/receiving/inspector/carton-inspector-model.ts` |
| Guard | `src/components/receiving/inspector/carton-inspector.guard.test.ts` |
| Search href SoT | `src/lib/search/search-hit.ts` |
| Unbox escape | `src/lib/receiving/surface-path.ts` → `openInUnboxHref` |
| Editable stack to retire | `src/components/station/ReceivingDetailsStack.tsx` |
| Global stack host | `src/components/detail-stacks/GlobalDetailStackHost.tsx` |
| Stack registry | `src/lib/detail-stacks/registry.ts` |
| Pattern law | `.claude/rules/pattern-evolution.md` |

---

## 5. Current tree state (as of handoff write)

- Industry redesign **reverted** (`inspection/` deleted; inspector restored to Gemini document-stack UI).  
- `CartonInspectorIdentity.tsx` **already absent**.  
- Phase 2 scan-vs-lookup + `/carton` route + search wiring **live**.  
- `ReceivingDetailsStack` **still editable** and still mounted from overlays/global host — **Phase B work**.  
- Other lane may have large unrelated dirty tree — judge only inspector / detail-stack / search / pattern-evolution paths you touch.

---

## 6. Compound opportunities (note, don’t expand unless asked)

- Do now: disposition model + 2a navigation swap + greenfield assembly.  
- Promote later: if a second read/work pair appears (orders?), extract “read door + atoms” pattern into a short display rule.  
- Deferred: true non-modal rail *hosting the same* read assembly (only if navigate-away from queue is painful) — must still be **one** component tree, not a twin.

---

## 7. Handoff checklist for the next agent

1. Confirm decision **2a** with this doc — do not reopen A/B/C.  
2. Phase A (rule line + supersede stamps).  
3. Phase B (kill editable stack as default carton look).  
4. Phase C + D (guards + disposition model).  
5. Phase E (new assembly).  
6. Phase F (`verify` + human visual gate on 49929 / 50263).  
7. Do **not** resurrect the reversed industry tree from chat memory; rebuild from §2 acceptance criteria.
