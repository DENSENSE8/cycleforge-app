# EXECUTION PROMPT — WS-PHOTO Ultraco Fan-Out (Fable 5)

> Paste **everything below the horizontal rule** into a fresh **Fable 5** session  
> (`claude-fable-5-thinking-high` / Fable 5 alias) at repo root  
> `/Users/icecube/repos/cycleforge-app`.  
> You are the **Ultraco conductor**: orchestrate parallel specialist agents; do not
> solo the whole initiative as one serial god-thread.

**Plan SoT (hub):** [`docs/todo/photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md)  
**Child plans:** stage-sot · station-mode-capture · library-identity · journey-timeline · policy-claims-insurance  
**Canvas:** Cursor canvas `photo-evidence-chain` (optional visual map)

---

# Ultraco · Photo Evidence Strike — Fable 5 Conductor Brief

You are **Fable 5**, running **Ultraco mode**: one conductor, many specialists in
parallel. Cycle Forge already has a polymorphic photo hub (`photos` +
`photo_entity_links`). The product hole is **station-staged insurance** —

> Arrival package → Unbox carton → Unbox item (PO · SKU · serial) → Testing → Pack  
> so disputes can answer: *received like this, or damaged at this station?*

Your job is not to write a novel. Your job is to **fan out**, **own boundaries**,
**merge clean**, and **verify**.

## Ultraco operating system (how you work)

1. **You are the conductor.** Spawn specialist agents (Task / subagents / parallel
   worktrees — whatever Ultraco tool surface you have). Give each a *mission card*
   (below). Do not let two agents edit the same file in the same wave.
2. **Wave discipline.** Wave 0 is serial (SoT waist). Wave 1 fans four agents at
   once. Wave 2 is integration + policy. Never skip Wave 0.
3. **File leases.** Each agent owns an exclusive path set. Cross-cutting files
   (`photo-intent.ts`, `service.ts`, `types.ts`) are **Conductor-only** or
   Wave-0-only unless a lease is explicitly transferred in chat.
4. **Constitution:** `AGENTS.md`. Compose SoT — grow `photo-intent` / photo stages —
   never fork a second photo table. No `db:push`. No commit unless the human asks.
   Stay on the current branch/worktree. Never stash.
5. **Verify per agent:** smallest relevant tests; conductor runs `npm run verify`
   (or `--fast` then full) before declaring a wave done.
6. **Worklog:** after each wave, `pnpm worklog "WS-PHOTO wave N: …" --result <r>`.

## North-star stage matrix (do not invent a sixth story)

| Stage | Mode | Entity | `photo_type` |
|---|---|---|---|
| `arrival_package` | Triage | `RECEIVING` | `receiving_package` |
| `unbox_carton` | Unbox header | `RECEIVING` | `receiving_unbox_carton` *(new)* |
| `unbox_item` | Unbox line | `RECEIVING_LINE` | `receiving_item` |
| `testing` | Testing | `SERIAL_UNIT` | `testing_photo` |
| `packing` | Pack | `SERIAL_UNIT` ± `PACKER_LOG` | `packer_photo` |

**Identity law:** item insurance → `RECEIVING_LINE` (SKU on the line). Never
primary-link inbound evidence by SKU string. Display chrome: **PO · SKU · serial**
+ stage chip.

## Read first (conductor only — 10 minutes max)

1. `docs/todo/photo-evidence-chain-INDEX.md`
2. All five `docs/todo/photo-evidence-*-plan.md` children
3. `src/lib/receiving/photo-intent.ts`
4. `src/lib/photos/service.ts` + `types.ts`
5. `src/lib/photos/queries/unit-timeline-photos.ts`
6. `src/lib/settings/accessors.ts` (`getReceivingPhotoPolicy` — unused)

Then publish a **Wave Plan** in chat (table of agents + leases) and start Wave 0.

---

## WAVE 0 — Conductor solo (serial, ~1 agent-hour)

**Codename:** `WAIST`  
**Plan:** [`photo-evidence-stage-sot-plan.md`](./photo-evidence-stage-sot-plan.md)

### Mission
Freeze the stage × entity matrix and enforce it at the upload waist so parallel UI
agents cannot invent wrong stamps.

### Do
1. Grow `src/lib/receiving/photo-intent.ts` — add `receiving_unbox_carton`,
   `ReceivingPhotoStage`, `assertReceivingPhotoWrite`, stage↔intent helpers.
2. Call assert from `uploadPhoto` / `attachPhotoWithLegacyUrl` (and receiving
   attach route). Invalid pairs → 400.
3. Tighten `listReceivingPhotos` filters (import SoT constants; item = line entity
   only; package = package types only).
4. **Hotfix now:** `ReceivingPhotoButton.tsx` + `usePhotoGallery.ts` — stop
   writing `RECEIVING` + `receiving_item`. Carton empty-upload → `receiving_package`
   (or `receiving_unbox_carton` when unbox header is known).
5. Unit tests for the matrix (`photo-intent.test.ts` + receiving-list assertions).

### Lease (exclusive)
- `src/lib/receiving/photo-intent.ts` (+ new test)
- `src/lib/photos/service.ts`
- `src/lib/photos/types.ts` *(only if exporting stage helpers)*
- `src/lib/photos/queries/receiving-list.ts`
- `src/app/api/photos/upload/route.ts`
- `src/app/api/receiving-photos/route.ts`
- `src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx`
- `src/components/shipped/photo-gallery/usePhotoGallery.ts`

### Gate to Wave 1
- [ ] Invalid uploads 400
- [ ] Desktop carton stamp fixed
- [ ] Intent helpers imported by list query
- [ ] `npx tsx --test` on touched tests green
- [ ] Conductor posts **Ultraco fan-out table** and spawns Wave 1 agents **in one turn**

---

## WAVE 1 — Ultraco fan-out (FOUR agents, one message, simultaneous)

Spawn all four below **in parallel**. Each agent gets: this mission card + link to
its plan + “Wave 0 is merged; do not rewrite photo-intent/service.”

### Agent A — `CAPTURE` (Station / mode)

**Plan:** [`photo-evidence-station-mode-capture-plan.md`](./photo-evidence-station-mode-capture-plan.md)  
**Persona:** Floor ops — Triage door vs Unbox bench, desktop + phone.

**Do**
- Shared `useReceivingPhotoScope` / photo-scope helper mapping stage → entity+type.
- Triage peek/capture: `package` only.
- Unbox: carton strip (`unbox_carton`) + active line item camera (`unbox_item`) with
  SKU · serial chrome.
- Extend Ably `receiving_photo_request` with `receiving_line_id?` + `stage`;
  `ReceivingPhotoRequestCamera` routes carton vs item paths.
- Mobile studio header/copy from stage; carton galleries stop using `photosListScope: 'all'` for package/unbox_carton.

**Lease**
- `src/hooks/useReceivingPhotoScope.ts` *(new)* or `src/lib/receiving/photo-scope.ts`
- `src/components/receiving/triage/TriagePanel.tsx`
- `src/components/receiving/workspace/LineEditPanel.tsx`
- `src/components/receiving/workspace/line-edit/ReceivingPhotoPeek.tsx`
- `src/lib/realtime/receiving-photo-request.ts`
- `src/components/sidebar/receiving/usePhotoRequestPublisher.ts`
- `src/components/mobile/receiving/ReceivingPhotoRequestCamera.tsx`
- `src/components/mobile/receiving/PhotoUploadQueue.ts`
- `src/components/mobile/photos/MobileReceivingPhotoStudio.tsx`
- `src/app/m/(immersive)/r/[id]/photos/page.tsx`
- `src/app/m/(immersive)/receiving/po/**/photos/**`

**Out of lease:** library grid, journey merge, mark-received policy.

---

### Agent B — `LIBRARY` (Identity display)

**Plan:** [`photo-evidence-library-identity-plan.md`](./photo-evidence-library-identity-plan.md)  
**Persona:** Evidence librarian — find the SKU · serial frame in seconds.

**Do**
- Enrich library SELECT + `LibraryPhoto` with sku / serial / derived stage.
- Grow `display-names.ts` for PO · SKU · serial (+ stage-safe filenames).
- Stage sub-filter under Unboxing (`arrival_package|unbox_carton|unbox_item`).
- Add SKU to sidebar search fields; tile + context panel chrome.
- **Do not** dual-link catalog SKU unless conductor later approves (default = join display only).

**Lease**
- `src/lib/photos/queries/library.ts`
- `src/lib/photos/library-filter-state.ts`
- `src/lib/photos/display-names.ts` (+ tests)
- `src/lib/photos/library-context-label.ts`
- `src/lib/photos/image-type-defs.ts` *(only if adding stage keys — prefer URL sub-filter)*
- `src/components/photos/PhotoStationFolders.tsx`
- `src/components/photos/photo-library-grid/**`
- `src/components/photos/photo-library-types.ts`
- `src/components/photos/PhotoContextPanel.tsx` *(or actual path in tree)*
- Related e2e under `tests/e2e/photos-library*.spec.ts`

**Out of lease:** receiving station panels, journey adapters, upload waist.

---

### Agent C — `JOURNEY` (Timeline media spine)

**Plan:** [`photo-evidence-journey-timeline-plan.md`](./photo-evidence-journey-timeline-plan.md)  
**Persona:** Dispute detective — side-by-side station frames on the serial story.

**Do**
- Split `listUnitTimelinePhotos` `unbox` → `arrival` | `unbox_carton` | `unbox_item`.
- Update `unit-photos-events.ts` order: arrival → unbox_carton → unbox_item → testing → packing.
- Add `mergeJourneyWithUnitPhotos` helper; mount media on `SerialJourneySection`
  (+ one station consumer: `StationUnitJourneys` or `ReceivingSerialJourneys`).
- Order timeline: serial-grouped stage media when units exist (collapsed by default).
- Degrade-not-fail if photo fetch fails.

**Lease**
- `src/lib/photos/queries/unit-timeline-photos.ts`
- `src/lib/timeline/unit-photos-events.ts` (+ tests)
- `src/lib/timeline/journey-photos.ts` *(new)*
- `src/lib/timeline/journey.ts` / `src/lib/operations/journey.ts` *(only merge hook — no hop emitters)*
- `src/components/serial/SerialJourneySection.tsx`
- `src/components/station/workbench/StationUnitJourneys.tsx`
- `src/components/station/workbench/merge-station-unit-journeys.ts`
- `src/components/station/receiving/ReceivingSerialJourneys.tsx`
- `src/components/labels/unit-detail/SerialUnitTimelineSection.tsx`
- `src/app/api/serial-units/[id]/timeline-photos/route.ts`
- `src/app/api/orders/[id]/timeline/route.ts`
- `src/components/shipped/OrderTimelineSection.tsx`

**Out of lease:** `journey-hop-emitters` PACKED/SHIPPED work; library tiles; capture UI.

---

### Agent D — `POLICY` scaffolding (claims + readiness prep)

**Plan:** [`photo-evidence-policy-claims-insurance-plan.md`](./photo-evidence-policy-claims-insurance-plan.md)  
**Persona:** Insurance underwriter — gates and claim evidence preference.  
**Note:** Full mark-received enforcement may wait for Wave 2 if Capture isn’t merged;
this agent builds the **pure evaluator + claim picker defaults** now.

**Do (Wave 1 safe slice)**
- New `src/lib/receiving/photo-policy.ts` — pure `evaluateReceivingPhotoPolicy`
  (`optional` / `require_one` / `require_per_item`) + unit tests.
- Claim photo picker defaults toward `unbox_item` (+ package for outer damage).
- Document `claim_evidence` vs `insurance_share` in a short module comment.
- **Do not** wire mark-received 409 until conductor green-lights Wave 2 (needs Capture counts).

**Lease**
- `src/lib/receiving/photo-policy.ts` *(new)* + tests
- `src/components/receiving/workspace/claim/components/ClaimPhotoPicker.tsx`
- `src/lib/photos/claim-link.ts` *(read-mostly; only if preference tweaks)*
- Claim-related tests only

**Out of lease:** `mark-received/route.ts` until Wave 2; station capture files.

---

## WAVE 1 merge ritual (conductor)

When all four agents report:

1. Reconcile any accidental lease breaches (revert cross-edits).
2. Run `npm run verify -- --fast`, then full `npm run verify`.
3. Smoke mental checklist:
   - Triage photo ≠ item photo in peeks
   - Unbox line upload → `RECEIVING_LINE`
   - Library tile shows SKU when line-linked
   - Unit timeline has ≥3 inbound buckets
4. Post compound note + worklog.
5. Open Wave 2.

---

## WAVE 2 — Integration (conductor + 1–2 agents)

**Codename:** `INSURE`

1. Wire `getReceivingPhotoPolicy` into mark-received + unbox receive-bar preflight
   (Agent D + Capture coordination).
2. Playwright matrix (spawn `e2e-spec-writer` if useful):
   - Triage never creates `RECEIVING_LINE` photos
   - Unbox active-line creates `receiving_item` on line
   - Phone request with `receiving_line_id` opens item camera
   - Library stage filter + SKU label
3. Optional data hygiene script for historical carton+`receiving_item` mis-stamps
   (ask before applying to prod).
4. Update `docs/settings-registry.md` — photoPolicy no longer “deferred.”
5. Final `npm run verify` + worklog `WS-PHOTO wave 2: insured`.

---

## Explicitly forbidden (all agents)

- New photo tables / second polymorphic hub
- Primary-linking inbound evidence to catalog SKU string
- Raising DS-ratchet baselines or `--no-verify`
- Touching `unbox-triage-mode-separation` rail sort work (orthogonal handoff)
- Emitting PACKED/SHIPPED inventory events (`journey-hop-emitters` lane)
- Committing / pushing / stashing unless human asks
- Editing another agent’s leased files mid-wave

## ASK-FIRST gates

Stop and ask the human before:

- Adding a `photos.capture_mode` DB column (prefer `photo_type` first)
- Dual-linking every item photo to catalog `SKU`
- Always-on dense photo rows in Operations History browse (all dims)
- Production backfill rewriting claim evidence photo_types

## Conductor kickoff script (say this, then fan out)

> Ultraco online. Wave 0 WAIST complete → spawning CAPTURE, LIBRARY, JOURNEY, POLICY
> with exclusive leases. Plans are law; stage matrix is law; verify is law. Build the
> insurance spine — parallel, clean, Kinetic Ledger.

Then dispatch the four Wave 1 agents **in a single parallel tool batch**.

## Done looks like

Operators can:

1. Shoot **package** photos in Triage and **item** photos per SKU/serial in Unbox.
2. Browse the library by stage and see **PO · SKU · serial** on tiles.
3. Open a serial journey and see **arrival → unbox → test → pack** media.
4. Hit `require_per_item` and be blocked from receive until every line has item evidence.

**Hub remains the SoT:** if this prompt and a child plan disagree, **the child plan
wins** on its domain; the INDEX wins on stage matrix + identity law.
