# Research briefing — mobile unbox photo capture: from a flat feed to an active-carton bench

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Scope:** The **phone** experience for the *Unboxing* mode of Receiving — specifically the loop "open a box → photograph what's inside → move to the next box." Desktop is out of scope except where it pushes the phone.
**Deliverable:** (a) the 2026 industry standard for *guided, evidence-grade photo capture on a phone held by a working operator*, with named systems and citations; (b) a concrete redesign of this flow's **display model and logic model**, reconciled against the measured constraints in §5.

---

## 0. How to use this brief

You do **not** have the codebase. Everything measured is below — routes, component names, state model, timings, tap-target sizes, and the exact post-capture sequence. Treat §3 as ground truth and §4 as an untested hypothesis you are expected to critique, not to rubber-stamp.

Answer **two separate questions**:

1. **What is the 2026 industry standard?** How do comparable products structure one-handed, gloves-on, high-repetition photo capture tied to a physical object? Named products, cited sources, explicit dominant patterns — not "it depends." We want the pattern language (what the shot list is called, where the review step lives, how the "next item" handoff works), not generic mobile-design advice.
2. **What is right for *this* codebase?** Reconcile the standard against §5's hard constraints. Where the standard conflicts with a constraint, name the conflict and pick a side.

Then give us the thing we lack: **a display model and a state machine**, specified tightly enough to implement without re-litigating.

---

## 1. Product + operator context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers. Inventory is **serialized** — individual physical units with serial numbers, condition grades, test verdicts, and photo evidence — flowing through receiving → triage → testing → repair → listing → packing → shipping → returns.

**Unboxing** is the second step. A carton has already been scanned in at the door (Triage). At the unbox bench the operator opens it, photographs the contents, records serials, and prints labels. Photos are not decorative: they are the **evidence chain** for supplier disputes, marketplace claims (Amazon/eBay returns), and condition grading. A missing photo is a real financial loss later.

### The physical reality this UI is used in

- The operator is **standing at a bench**, box cutter in one hand, phone in the other. Often gloved.
- Throughput matters more than beauty: **dozens of cartons per shift**, each 30s–3min.
- Warehouse Wi-Fi is unreliable; the app must keep accepting work while offline.
- The phone is a **second terminal onto the same station** as the desktop — the desktop scanning a tracking number can push this phone straight into the camera (see §3.2).
- The screen is glanced at, not read. The operator's eyes are on the product.

**UI identity is Kinetic Ledger:** data-first, dense, state-colored, scan-aware. Bias is **legible throughput over document calm** — Linear/Stripe chrome discipline, not whitespace-heavy document IA.

Every UI region carries one of four **region contracts** (enforced house law — please use this vocabulary in your answer):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner / camera | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition | durable focus in URL | `studio` |

Existing house rules for Station say: one active entity at a time, act-and-clear, big card pass/fail rather than a corner toast, and no browsable list competing with the scan focus. **The current unbox screen violates all four.** That tension is the subject of this brief.

---

## 2. The problem, in one paragraph

The phone's unbox surface is a **flat, bottom-anchored, infinitely-scrolling list of every recently-opened carton**, where only the newest row gets a real camera button and the rest get 32px icons. Taking photos means: find your row in the list → tap a small camera icon → get thrown to a separate fullscreen route → shoot → tap ✓ → get `router.replace`d back to a hardcoded feed URL (not necessarily where you started) → the only confirmation you did anything is a 3.5-second toast fired by a globally-mounted listener 500ms later. There is no active-carton concept, no shot list, no per-item photos from this surface at all, no completion state, and no back button anywhere on the surface. The list *is* the product, and it should be the fallback.

---

## 3. Measured current state

### 3.1 Five overlapping mobile receiving surfaces

| Route | Renders | Job | List idiom |
|---|---|---|---|
| `/m/unbox` | `RedesignedMobileReceive surface="unbox"` | Scan a tracking # to open a carton | Newest-at-**top**, local component state, 4 filter chips |
| `/m/triage` | `RedesignedMobileReceive surface="triage"` | Door scan-in | Same component, + intake-classification pills |
| `/m/receiving` | `MobileReceivingList limit={25}` | **The photo feed** — the subject of this brief | Newest-at-**bottom**, server-backed, package-grouped |
| `/m/r/[id]` | Bespoke carton detail page | Carton metadata + lines + activity | Third list idiom, own header + own sticky footer |
| `/m/receiving/history` | Bespoke search page | Find an older carton | Fourth idiom, own filters + sorts + search |

Plus a parallel PO-scoped path — `/m/receiving/po/[poId]` and `/m/receiving/po/[poId]/item/[itemId]` — with its **own** immersive photo routes.

They do not share a list component, a header, a selection model, or a photo-href builder convention. The drawer nav lists `Triage`, `Unbox`, and `Photo feed` as three sibling destinations, so the operator must already know that "Unbox" is where you scan and "Photo feed" is where you shoot.

### 3.2 The capture flow, step by step (measured)

Entry A — from the feed:

1. `/m/receiving` renders `MobileReceivingList`. Rows are `ReceivingLineRow`s from `GET /api/receiving-lines?view=unbox_opened&limit=100&include=serials`, windowed to the last 25, reversed so **newest is at the bottom**.
2. Only the bottom-most row is `expanded` — it gets a 64px-tall gallery tile + a full-width 64px blue camera bar. Every other row is `compact`: a 32px-tall gallery pill and a 32px camera pill crammed at the right end of the meta row.
3. Tapping camera navigates to `/m/r/{receivingId}/photos?title=…&poRef=…` — a route in the `(immersive)` group, which mounts a **different layout** (black field, no shell, no header).
4. `MobileReceivingPhotoStudio` fetches prior photos, then mounts `MobilePackerSpamCamera embedded`.
5. Shutter → crop the frame to the on-screen viewfinder aspect → `toBlob('image/jpeg', 0.85)` → `compressPhotoForUpload` → object URL → pushed into local `shots[]`. **No network call.** Cap is 10 here (12 on the PO-item route, 5 in the component default).
6. ✓ (or ✗ — both commit; only an *empty* camera cancels) → `onDone(shots)` → each shot `photoUploadQueue.enqueue(...)` → `toast.message('Uploading N photos…')` → `router.replace(returnHref)`.
7. Background: downscale to 720 → base64 → mirror to `localStorage` → `POST` → on success publish `receiving_photo_uploaded` on the staff's Ably channel.
8. The feed (which set `refetchOnMount: 'always'` precisely for this) refetches; each row's `photo_count` badge ticks up.
9. ~500ms after the burst settles, a globally-mounted `PhotoUploadToaster` fires one coalesced `toast.success('N photos submitted')`, 3.5s duration.

Entry B — pushed from the desktop:

The desktop receiving station publishes `receiving_photo_request` on `staffstation:{staffId}`. `ReceivingPhotoRequestCamera`, mounted in the mobile shell, routes the phone **directly into the camera** with no prompt. Rationale in-code: "a scan is the operator's intent to start unboxing." This is the strongest part of the current design and should survive any redesign.

### 3.3 The upload pipeline is genuinely good — do not redesign it

`PhotoUploadQueue` is a module singleton with a real state machine (`queued → uploading → done | failed`), a `localStorage` mirror of the *downscaled* blob so a tab kill/refresh rehydrates and auto-resumes, a blob cache backing `retry()`, a 20-entry cap to stay under quota, and idempotent server-side handling of duplicate POSTs. Capture never blocks on the network.

**The problem is not the pipeline. The problem is that none of its state is visible on the surface the operator is looking at.** The feed renders only the server's `photo_count`. `queued`, `uploading`, and `failed` are invisible; `retry()` has no UI on this surface at all. A failed upload is a toast that has already disappeared.

### 3.4 Measured friction inventory

Numbered so you can reference them. These are observations, not conclusions — challenge any you disagree with.

1. **No back affordance.** `MobileTopBar` accepts an `onBack` prop. The mobile shell never passes it. No receiving surface has a back button; navigation is a hamburger drawer only.
2. **Tap targets below the floor.** Compact-row photo controls are `h-8` (32px); the expand chevron is `h-7 w-7` (28px). The house's own 44px tap floor primitive (`IconButton size="touch"`) is used **zero times** across all mobile components. The 64px controls exist only on the single expanded row.
3. **Per-item photos are unreachable from this surface.** `photo_count` is computed carton-wide (`RECEIVING`-level photos *plus* every `RECEIVING_LINE` photo under that carton). In a package card with 4 items, **all 4 rows show the same number** and **all 4 camera buttons open the same carton-level capture route**. Line-level photos are only reachable via the separate `/m/receiving/po/[poId]/item/[itemId]` path. For "photograph each item you pull out of the box," the primary surface cannot express the primary intent.
4. **Return navigation is wrong by default.** The capture href is built *without* a `back` param (only the gallery href gets one), so the photos page falls back to a hardcoded `'/m/receiving'`. An operator who started on `/m/unbox` — or who was pushed in from the desktop — is deposited on a *different* surface after shooting. `router.replace` also rewrites the back stack, so hardware-back is unpredictable.
5. **Completion is a toast, not a state.** House Station law is explicit: "make pass/fail a big card state, not a toast… a 4-second corner toast is invisible at the bench." The only success signal is a 3.5s toast fired 500ms late by a global listener, plus a number quietly incrementing in a list.
6. **The list moves under you.** `useFeedWindow` calls `scrollTo({ top: scrollHeight, behavior: 'smooth' })` on every row-count change. A carton landing from the desktop while you're reading yanks the viewport.
7. **No progress model.** There is no concept of how many photos this carton *needs*, or which angles. No shot list, no required/optional distinction, no "you have not photographed the shipping label" nudge. `photo_count` counts; it does not evaluate.
8. **Inconsistent caps.** 10 / 12 / 5 across three entry points into the same camera.
9. **No pagination.** The feed fetches 100 and windows to 25 with no infinite scroll — older cartons are reachable only through the separate history page.
10. **Icon-only primary action.** The expanded row's camera is a bare glyph in a blue bar, no label; the carton sheet's CTA is likewise a lone camera icon. House rule pairs icons with text everywhere except status dots.
11. **Hover affordances on a touch device.** Workflow status is conveyed by a colored dot whose label lives in a `HoverTooltip`. On a phone there is no hover; the label is effectively unreachable.
12. **Token drift.** The scan surfaces use raw `text-xl` / `text-base` / `tracking-[0.18em]` / `text-blue-950` / `rounded-[24px]` rather than the house `text-role-*` scale and semantic color tokens, and carry several documented raw-button escapes.

---

## 4. The change the team wants (hypothesis — critique it)

The proposal, in the requester's words: *"it should be updated to display a list from a back button, and the recent order as a review of the last order of what you recently did."*

Our reading, which you should stress-test:

- **Invert the hierarchy.** The primary surface becomes the **active carton** — one entity, big controls, camera as the primary action. This matches the Station contract the surface should have had all along.
- **The list becomes a drill-back.** Reachable via an explicit back control, not the default view. It answers "which box was I on?" — a navigator, not the workspace.
- **Add a completion/review state.** After finishing a carton, show what was just captured — carton identity, thumbnails, counts, upload status — with an explicit "next carton" handoff. This is the "recent order as a review of the last order" the requester asked for, and it directly addresses friction #5.

**Open questions we specifically want your judgment on:**

- Is "back button reveals the list" the right idiom in 2026, or is it a dated stack metaphor? Should the list instead be a peek/drawer, a segmented switch, a swipe-back gesture, or an overlay sheet? What do comparable products do when a *queue* and a *task* both need to be reachable one-handed?
- Should the review state be a **screen** (its own route), a **card that replaces the active carton in place**, or a **transient confirmation layer** over the camera? Is there a standard here (packing-slip / proof-of-delivery apps must have solved it)?
- Where should "review the last carton" and "review the queue" sit relative to each other? Are they the same surface at different scroll depths, or genuinely different destinations?
- Does an evidence-capture flow like this warrant a **guided shot list** (label / contents / damage / serial), or does that tax throughput more than it's worth at dozens of cartons per shift? If guided: is it a wizard, a checklist overlay on the viewfinder, or a post-capture tagging step?
- Should capture stay a **route change** to a fullscreen layout, or become an **in-place camera** on the active-carton surface? The current route change is what makes back-navigation and return-context unreliable (#4).

---

## 5. Constraints your recommendation must respect

Non-negotiable unless you make an explicit, argued case:

1. **Kinetic Ledger, not a foreign kit.** Recommendations must be expressible in the existing design system: `text-role-*` type scale, semantic color tokens, `IconButton size="touch"` (44px) for the tap floor, house `BottomSheet`, house motion presets. "Adopt Material 3 expressive" is not an implementable answer; "this Material pattern maps onto the house sheet primitive" is.
2. **Motion law.** Opacity + transform only. Never animate `width`/`height`/`padding` (height changes go through `grid-template-rows`). `AnimatePresence mode="wait"`, stable entity-id keys, sub-300ms ease-out for discrete swaps, springs only for gestural/physical surfaces. `prefers-reduced-motion` collapses to a pure crossfade — mandatory, not optional.
3. **Offline-first stays.** Capture must never block on the network. The existing queue, its `localStorage` rehydration, and its idempotent retry are load-bearing. Your design must give queue state a *visible home* without changing the pipeline.
4. **The desktop→phone push must survive.** A desktop scan lands the operator in the camera with zero taps. Any new hierarchy must have a defined entry point for "you were teleported here mid-flow."
5. **Both photo scopes must be expressible.** Carton-level (`RECEIVING`) and item-level (`RECEIVING_LINE`) photos both exist in the schema. The redesign must make the choice legible to the operator rather than silently picking carton-level (#3).
6. **Selection is ephemeral.** Station contract: the active carton must not become a durable `?id=` URL selection. If your design needs deep-linkability, argue for why this region is actually a Workbench.
7. **One-handed, gloved, glanceable.** Primary actions in the thumb arc. No hover-dependent information. Assume the operator looks at the screen for under two seconds at a time.
8. **Multi-tenant.** No cross-tenant data on any surface. (Mentioned for completeness — unlikely to constrain a display recommendation.)

---

## 6. Questions

### A. Industry standard (2026), with citations

1. **Guided capture.** Which shipped products define the state of the art for structured, multi-shot photo capture tied to a physical object — reverse logistics, vehicle inspection, insurance claims, field service, property inspection, marketplace listing intake? Name them. What is the dominant structure: guided shot list, free-form burst, or hybrid? Cite.
2. **The queue↔task relationship.** For "worker has a queue of physical items and works them one at a time on a phone," what is the dominant navigation idiom in 2026? Back-stack? Bottom sheet peek? Segmented control? Swipe-between-items pager? Which products, and what evidence exists on which performs better under repetition?
3. **Completion and review.** After a worker finishes an item, what is the standard confirmation pattern in high-repetition mobile workflows? Full-screen success state, inline card, transient banner, or immediate advance to the next item? What is the evidence on error rates when confirmation is transient vs. persistent?
4. **Camera ergonomics.** Current 2026 guidance for a task camera embedded in a business app: shutter placement, thumb reach on large phones, reviewing-while-shooting, batch capture and deletion, one-handed operation with gloves. Cite Apple HIG / Material / any published warehouse-UX research.
5. **Offline capture UX.** How do best-in-class field apps make background upload state visible without nagging? Per-item badges, an aggregate status chip, a queue screen, or silence-until-failure? Cite.
6. **2026 principles specifically.** What has actually changed in mobile enterprise UX in the 2024→2026 window that is relevant here — beyond aesthetics? We want substantive shifts (interaction models, capture assistance, on-device inference for framing/quality gating, accessibility floors), not a trend list.

### B. Recommendation for this codebase

7. **The display model.** Specify the surface hierarchy: what is primary, what is secondary, how the operator moves between them, and what the back control actually does. Address whether the requester's "back button reveals the list" reading is right or should be replaced.
8. **The logic model.** Give an explicit state machine for one carton: entry (scanned / pushed / picked from list) → active → capturing → review → cleared → next. Name every state, its transitions, what is on screen in each, and what happens on interrupt (network drop, app backgrounded, a desktop push arriving mid-capture).
9. **Shot-list ruling.** Guided or free-form? If guided, specify the shot list for a used-goods reseller carton and where the checklist lives relative to the viewfinder. If free-form, say what replaces the completeness signal.
10. **Scope ruling.** How should carton-level vs. item-level photos be presented so the operator picks correctly without thinking about the data model (#3)?
11. **Queue-state surfacing.** Where does `queued/uploading/failed/retry` live in your design (#5, constraint 3)?
12. **Consolidation ruling.** Of the five surfaces in §3.1, how many should survive, and what is each one's job? Be specific about what merges into what.
13. **Prioritized punch list.** Rank your recommendations by (operator time saved) ÷ (implementation cost), and mark which of the twelve friction items in §3.4 each one closes.

---

## 7. Deliverable format

1. **Executive summary** — max 10 bullets. The rulings, not the reasoning.
2. **Industry standard** — answers to A1–A6, each with named products and citations. Where sources conflict, say so and pick.
3. **Recommended design** — answers to B7–B13. Include a textual wireframe/ASCII sketch of each proposed screen state and an explicit state-machine diagram (Mermaid is fine). Prose-only will not be actionable.
4. **Conflicts** — every place your recommendation fights a §5 constraint, with the tradeoff stated and a side chosen.
5. **What you would NOT do** — patterns you considered and rejected, and why. This is as valuable as the recommendations; it prevents the next round re-proposing them.
6. **Prioritized punch list** — the ranked table from B13.

Be opinionated. We have a working flow with known friction; what we lack is a defensible target model. "It depends" is a non-answer.

---

## 8. Post-review rulings (2026-07-28, after Gemini's response)

### 8.1 Corrections to the research answer

Three findings the research could not have seen, all verified against the code:

1. **The shot list already exists.** `ReceivingPhotoPolicy` (`src/lib/receiving/photo-policy.ts`) is a complete SoT — tiers (`optional` / `require_one` / `require_per_item`), the stage matrix, operator-readable blocker copy, a server gate that 409s `mark-received`, and unit tests. **B9's "invent a hybrid shot list" is discarded**: the work is to *surface* this policy on the phone, not design a new vocabulary. A "Complete carton" button pointed at `mark-received` inherits the completeness gate for free — the 409 blockers become the amber reason line.
2. **The unbox stage had no writer (FIXED).** `PhotoUploadQueue` stamped every carton shot `receiving_package` (arrival evidence), so `receiving_unbox_carton` had zero production writers and a photo taken after the box was opened satisfied the `require_one` arrival gate. Fixed by routing the stamp through the new `receivingUploadStage()` in `photo-intent.ts`; the three mobile capture routes now declare their stage explicitly.
3. **Per-item completeness needs an API field.** `photo_count` is carton-wide (`sqlReceivingPhotoCount`), so every sibling line in a package shows the same number. B9's per-item badge requires a new line-scoped count on `/api/receiving-lines`.

Not available on the web, drop from A4/Conflict 1: **volume-button shutter**, and **"hardware back does nothing."** The camera needs its own `pushState` entry so back closes it; back from Idle will leave the surface and must be designed for.

Already in the codebase, so flag-flips rather than builds: on-device frame gating (`gateStillFrame` + the `gateCapture` prop on `MobilePackerSpamCamera`) and haptics (`src/lib/scan-feedback/play.ts`).

**B12 amended:** the `/m/receiving` *feed* dies, but the *route* cannot — it also hosts `?mode=local-pickup` and `?mode=repair`, both live drawer destinations.

### 8.2 Approved scope

- **"Complete carton" from the phone is IN scope** and is the point of the redesign — it is what makes the photo-policy gate visible. It runs `transition()` + Zoho sync + audit from a phone (Ask-first under `AGENTS.md`; approved 2026-07-28).

### 8.3 Requirement — phone receive must drive the desktop bench

When the operator completes a carton on the phone, the desktop unbox bench must reflect it:

| Requirement | State today |
|---|---|
| Desktop row data + **status display** refresh | **Free.** `mark-received` fires `invalidateReceivingViews` + `publishReceivingLogChanged` in `after()`; the desktop unbox subscribes via `useRealtimeInvalidation({ receiving: true })`. Status dot/pill derive from the refetched `workflow_status`. |
| Desktop **Receive button** reflects the receipt | **Missing.** `combinedReviewDisabled` checks only carton link + label options + serial confirmation; `printReceivePrimaryLabel` is a function of PO scope + unfound-ness. Neither reads `workflow_status`, so the CTA still reads "Receive" after receipt. |
| Post-receive CTA becomes **print the package label** | **Missing.** Needs an `isReceived` derivation in `useUnboxLineController` and a Print-primary branch in `resolveUnboxReceiveTerminal` (`line-edit/terminal/unbox-terminal.tsx`), keeping re-receive available in the split menu. |

The desktop half is independently valuable — the CTA should collapse to Print after receipt no matter which bench performed it.
