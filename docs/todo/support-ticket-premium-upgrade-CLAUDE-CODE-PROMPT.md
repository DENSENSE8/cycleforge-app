# Execution prompt — Support ticket: merged ledger + vision-grounded reply drafting

**For:** the next Claude Code / Cursor session
**From:** Cycle Forge engineering, 2026-08-02
**Status:** ruling ratified — build it
**Surface:** `/support?ticket=<id>` — Workbench branch `service-workspace`
**Lane:** current checkout, no ad-hoc branch. Attach to `:3050`. **The user owns commits.**

**Inputs:**
[`support-ticket-premium-upgrade-GEMINI-BRIEFING.md`](./support-ticket-premium-upgrade-GEMINI-BRIEFING.md) (the brief) ·
[`support-service-workspace-UI-HANDOFF.md`](./support-service-workspace-UI-HANDOFF.md) (what landed 2026-08-01/02)
**Law:** [`workbench-service.md`](../../.claude/rules/display/workbench-service.md) ·
[`source-of-truth.md`](../../.claude/rules/source-of-truth.md) ·
[`ui-design-system.md`](../../.claude/rules/ui-design-system.md) ·
[`backend-patterns.md`](../../.claude/rules/backend-patterns.md)

---

## 0. The ruling in one paragraph

The ticket surface is being rebuilt around the real job — **reconstruct the truth about one physical
unit fast enough to answer confidently, then answer** — not around a chat. The thread becomes a
**merged record stream**: messages and warehouse/carrier events interleaved chronologically as flat
ledger rows on one shared left edge. Bubbles are banned. The Zendesk field band dies; status and
priority fold into the identity row, assignment demotes to the rail. The AI becomes an **invisible
drafter**: paste an image anywhere on the work surface → it stages and uploads → deterministic
local-first OCR/damage extraction → that output routes through `routeScan` + `hybridSearch` against
our own data → a multimodal (or text-only fallback) generation produces a draft → the draft lands in
the composer through the bridge. **The AI never sends, and it is never a chat partner.**

---

## 1. STOP — six things the ruling assumes that are NOT true in this tree

Verified against the working tree on 2026-08-02. Build against these corrections, not the ruling's
prose. **A handoff that describes code which does not exist is worse than no handoff** — that
mistake was made on this repo three days ago and had to be reverted.

| # | The ruling says | The tree says | What you do |
|---|---|---|---|
| 1 | "Wire to `ThreadComposerBridge.setDraft()`" | `ThreadComposerBridge` is `{ hasDraft, isPublic, submitting, canPost, focus, submit }` — **there is no `setDraft`** (`src/components/threads/ThreadPanel.tsx:33`) | Extend the interface in Phase 3. See §5.2 for the exact signature and the dirty-draft rule |
| 2 | `divide-y divide-border-subtle` | **`border-subtle` is not a token.** The house has `border-border-hairline` and `border-border-soft` | Use `divide-border-hairline`. `color-tokens.guard.test.ts` will fail you otherwise |
| 3 | "standard house spacing (`prose-sm` equivalent)" | **No Tailwind typography plugin is installed.** There is no `prose` class in this repo | Block markdown renders on `text-role-*` + the spacing intents (`stack-tight` / `stack-row`). Define the block scale once in `markdown.ts`'s renderer, not per call site |
| 4 | "`PhotoAnalyzeProvider` … persisting to `photo_analysis`" (implying the job) | `runAnalyzeJob` is the **async job**; `analyzePhoto(deps)` in `src/lib/photos/analyze-core.ts:69` is the **synchronous, DI'd core** | Phase 4 calls `analyzePhoto` inline — that is what makes the latency budget reachable. Persist through the same writer the job uses; do not fork a second one |
| 5 | "call a multimodal model … with image URIs" | `/api/photos/[id]/content` is **auth'd and 302-redirects to a GCS signed read URL**. A cloud model cannot fetch an app URL | Resolve `adapter.getSignedReadUrl(...)` **server-side inside the route** and pass the signed URL (or inline base64) to the model. **Never** hand a model an app route. This is the single most likely implementation mistake in Phase 4 |
| 6 | "Show LTV, active orders, and return rate" | **None of those exist.** No `ltv` / `lifetime` / `return_rate` anywhere in `src/lib`. There is `GET /api/customers/[id]` and `orders.customer_id` | See §5.1 — ship what is derivable, render honest absence for the rest, and do **not** invent an aggregate without a plan review |

Two more that are not blockers but change your diff:

- **`mode: 'local'` is a literal union in four files** (`suggest-reply.ts`, the route, `useSupportSuggestion.ts`, `SupportSuggestionPanel.tsx`). Widening to `'cloud-multimodal'` touches all four.
- **`sources: string[]` → `Array<{ type, label }>` is breaking.** `SupportSuggestionPanel` renders sources today. Migrate the panel in the same commit.
- **`ticketId` is a `number`** in the live route (`Number(body.ticketId)`), not the `string` in the ruling's contract. Keep it a number.

---

## 2. Blast radius the ruling understates — read before Phase 1

`SupportChatThread.tsx` is not a `/support`-only component. `SupportTicketDetail` mounts it, and
**`SupportTicketDetail` has three hosts**:

1. `/support` — the `service-workspace` thread (this rebuild's target)
2. **Unbox** — `ReceivingTicketStack`, an `UnboxPushColumn` at a scan bench (`hideRequesterBand={false}`)
3. `SupportContextCustomer` — the hub's Customer segment, used inside the Unbox "Links" rail

So "kill bubbles" is a **three-surface change**, one of which is a 360px station push column where a
warehouse operator has a scanner in one hand. Plan for it: the ledger row must survive at 360px, and
Unbox must not regress.

**Scope fence — `ThreadPanel.tsx` is NOT in scope.** It is the reusable *entity* conversation
surface (order/carton/SKU threads) and it renders its own bubbles. It is also what the rail's
**Conversations** display mounts. Banning bubbles on the ticket thread does not authorise a sweep
through `ThreadPanel` — that is a separate ruling with its own hosts. If the two surfaces should
converge later, propose it; do not do it here.

**Guard that will break:** `support-chat-hierarchy.guard.test.ts` reads
`src/components/support/zendesk/chat/SupportChatThread.tsx` **by path** and asserts on its bubble
classes. Deleting or renaming that file fails the guard. **Migrate the guard in the same commit** —
re-point it at the new component and re-express its intent (body stays `text-role-data`, never
`micro` when compact). Do not delete the assertions; they exist because the compact variant once
shrank the body text.

---

## 3. Non-negotiables (violating one is a bug even when the feature works)

- The **queue never unmounts** — `display:none` + `inert`. Guarded.
- Only the **thread** crossfades on ticket id (`motionRole.swap.focus`). The queue never animates.
- The right edge **pushes**; `RightRailHost` renders exactly one occupant; no private `fixed right-0`.
- The bottom dock is **ticket-terminal** — a click on the right edge must never re-label it.
- **One scroll port per region, and the HOST owns it.** The stream is content; it adds no `overflow-*`.
- **Never reserve height a body has not asked for** — no `min-h-[N]` on dynamic content.
- Color / spacing / type / z-index / elevation / focus from **tokens only**. Weight ceiling **600**.
- Motion: name a `motionRole.*`; import only from `@/design-system/motion`; never animate layout.
- **`⌘K` has exactly one owner** (`CommandBar`). Escape belongs to the innermost overlay. The paste
  handler must not collide with either.
- **The AI never auto-sends.** No exceptions, no setting, no "confident enough" threshold.
- Migration lands **first** (expand → code → contract).
- `npm run verify` before done. **Never raise a ratchet baseline.**

---

## 4. Phase 1 — the merged ledger (foundation)

**Goal:** replace the bubble thread with `MergedRecordStream`, and kill the field band.

### 4.1 The row anatomy (one anatomy for messages AND events)

```
┌──────┬──────────────────────────────────────────────────────────────┐
│ 40px │ Row 1  author (role-eyebrow) · timestamp (text-muted)        │
│ mark │ Row 2  body — block markdown, house type scale               │
│      │ Row 3  attachments (optional) → PhotoViewerPortal thumbs     │
└──────┴──────────────────────────────────────────────────────────────┘
   divide-y divide-border-hairline between rows
   DateGroupHeader band whenever the civil day changes
```

- **Left mark, 40px, alignment-locked.** `StaffAvatar` for staff (resolve by **staff id**, never by
  name — two people share one), a generic glyph for the customer, a station glyph for a warehouse
  event (`resolveStationGlyph` / `TIMELINE_GLYPH_ICONS` already exist and are used by the carton read
  surface). **Direction is this mark, not a fill.**
- **Background is transparent by default.** Internal notes get `bg-surface-sunken` — a tint, not a
  bubble, and it must not be the only carrier of "internal" (pair it with the row's label so a
  colour-blind operator loses nothing).
- **`PUBLIC` chips come off every row.** Public is the default and the default is not worth a chip.
- **Day bands are required** for any thread spanning >24h. Compose
  `src/components/ui/DateGroupHeader.tsx` — do not hand-roll a second one.
- **Timestamps:** relative in the row, absolute on hover via `HoverTooltip` (never `title=`).
  Resolve through `src/utils/date.ts` — this is a civil-day surface and `formatDateTimePST` /
  `formatTime12hPST` are the SoT. Respect the staff `timeFormat` preference.
- **360px must work.** Test in the Unbox ticket push before calling Phase 1 done.

### 4.2 Merging messages and events

- `TimelineItem` (`src/lib/timeline/types.ts`) is the existing domain-agnostic event shape and there
  are already `*ToTimeline` adapters (`orderAuditToTimeline`, `stationActivityToTimeline`,
  `inventoryEventsToTimeline`, `carrierEventsToTimeline`, …).
- **Write a `zendeskCommentsToTimeline` adapter** in `src/lib/timeline/` beside its siblings, so a
  message becomes a `TimelineItem` like everything else. Merge, sort newest-first, and
  `collapseTimeline` adjacent duplicates — the renderer does not sort.
- **Decide and state in the docblock:** does `MergedRecordStream` compose `EventTimeline`, or is it a
  sibling? `reference-timeline.md` says there is **exactly one sanctioned fork** (`AuditTimeline`) and
  forbids a third. If you build a sibling, you must justify why the message body (block markdown +
  attachment strip + composer affordances) does not fit `TimelineItem`'s single-line model — and that
  justification goes in `reference-timeline.md`, not just a comment.
- **Assume 200+ messages.** Virtualization-ready or paginated. Do not ship an unbounded map.

### 4.3 Kill the field band

- `Open ▾` / `Priority ▾` move into `SupportTicketPaneHeader`'s identity row. Status is the single
  most load-bearing fact on this record — give it real weight, and make sure it is rendered **once**
  (the 8px dot and the dropdown were two quiet copies of the same fact; pick one home).
- `Manager ▾` (Zendesk assignee) and `Staff ▾` (our staff assignment) demote into the rail's
  **Connections** display.
- `SupportChatHeader` loses its whole bottom band. Check what remains justifies the component.

### 4.4 Also in Phase 1 (cheap, same files)

- **Label the Connections chips.** `4790` / `33987359` / `220573AZ` render today with nothing saying
  which is the order, which the tracking, which the serial. Use the typed `CopyChip` family.
- **Composer honesty.** At rest the placeholder says "Internal note — not emailed…", the toggle shows
  `Internal`, and the button says **Reply** in green. Make the label follow the mode at rest
  (`resolveTicketTerminal` only becomes honest once a draft exists), and pull the green into the
  accent system.

**Gate:** `npx tsx --test src/components/support/**/*.guard.test.ts` + a browser pass at 1440 with
the rail open, **and** the Unbox ticket push at 360px.

---

## 5. Phase 2 — customer identity in the middle

**Goal:** the agent sees who is asking and what already happened to them, before reading the thread.

### 5.1 Ship what exists; render honest absence for the rest

The ruling asks for LTV, active orders, and return rate. **None of the three exists.** What you have:

| Fact | Source | Status |
|---|---|---|
| Name / email | `requesterFrom(ticket)` (helpdesk) and/or `customers` row | available now |
| Linked order | `SupportContextBundle.linkage.order` | available now |
| Linked tracking / serials / receiving | `SupportContextBundle.linkage` | available now |
| Order count for this customer | `orders.customer_id` — one aggregate query | derivable, cheap |
| Prior ticket count | helpdesk search by requester | derivable, one call |
| **LTV / return rate** | — | **does not exist** |

**Build `RequesterDetailBand` with the top five.** For LTV and return rate: either propose the
aggregate (a query + where it caches) as a **separate, reviewed** change, or omit them. Do **not**
render a placeholder number. `—` is the house's honest-absence mark; an invented metric on a customer
record is worse than a missing one.

Compose `StaffAvatar` / `IdentityMark` from `@/components/identity` — **never** hand-roll a
`rounded-full` + initials span, and never fork a local `initials()`.

**Gate:** the band renders on a ticket with no linked customer without collapsing the layout.

---

## 6. Phase 3 — mount the assist lane (text-only, proves the bridge)

**Goal:** prove the trust model and the rail→composer bridge with the logic that already exists.
Nothing here is net-new AI.

### 6.1 What is already built (do not rebuild)

`SupportSuggestionPanel` · `useSupportSuggestion` · `POST /api/support/suggest` ·
`lib/support/suggest-reply.ts` (DI'd, unit-testable with zero network) · `nemoclaw-rag` grounding ·
`hermes-client` generation. Contract already returns `{ suggestion, sources, confidence, mode, model,
grounded }`. It has **zero consumers**.

### 6.2 Extend `ThreadComposerBridge` — the one net-new API

```ts
export interface ThreadComposerBridge {
  hasDraft: boolean;
  isPublic: boolean;
  submitting: boolean;
  canPost: boolean;
  focus: () => void;
  submit: () => void;
  /**
   * Insert a drafted body into the composer. NEVER sends.
   *
   * `mode` sets the public/internal toggle so the draft cannot land in the
   * wrong visibility — an AI draft addressed to the customer must not arrive
   * with `Internal` selected, and vice versa.
   *
   * MUST NOT clobber operator text. When `hasDraft` is already true the caller
   * is responsible for asking first; the bridge appends nothing silently.
   */
  setDraft: (text: string, opts?: { mode?: 'public' | 'internal' }) => void;
}
```

**The overwrite rule is the load-bearing part.** A support agent who has typed three sentences and
then clicks Suggest must not lose them. Decide and implement one of: refuse-and-tell, append below a
rule, or an explicit confirm. Say which in the docblock. `requestConfirm` / `ConfirmDialogHost` is
the house confirm — do not hand-roll a scrim.

### 6.3 Mount it as the `Assist` display

- Add to `support-ticket-displays.tsx` → the rail becomes **Connections · Conversations · Timeline ·
  Assist**. Icon: `Sparkles`. It is a display like the others: exclusive, persisted by selection.
- **It goes in the rail, not the middle** — the branch's ranking rule is *suggesting is an extra;
  sending is the work*. An AI panel that sends would belong in the middle and is out of scope.
- **The dock stays ticket-terminal.** Selecting Assist must not change the bottom button. If you find
  yourself threading an imperative bridge from the rail to the dock's label, stop — that is the
  cross-region action-at-a-distance the station law bans.

### 6.4 Fix the tenant leak while you are in here

`SUPPORT_SYSTEM_PROMPT` hardcodes *"a senior customer-support agent for a **Bose** audio reseller"*,
and the `grounded` docblock says "Bose RAG". This is shared multi-tenant code — USAV is the dogfood
tenant, not the product. Resolve the vertical/brand framing from org settings (or drop it to a
generic "reseller"), the same way operator copy resolves a runtime provider label rather than
hardcoding a vendor sentence. **A second tenant on this code today gets a prompt claiming they sell
Bose.**

**Gate:** `right-rail-push.guard.test.ts` + a real draft reaching the composer without sending, and a
typed-draft-not-clobbered check.

---

## 7. Phase 4 — the vision loop

**Goal:** paste an image anywhere on the ticket → the system says what it is and what it matches in
*our* data → a grounded draft appears in the composer.

### 7.1 The pipeline, in order

```
1  PASTE      onPaste on the SupportTicketFocus surface → image/* items from clipboardData
2  STAGE      → useTicketPhotoStaging.addFiles  (existing: GCS upload + ticket link + compose attach)
3  EXTRACT    → analyzePhoto()  [analyze-core.ts, SYNCHRONOUS, DI'd]
                 provider from resolvePhotoAnalyzeProvider(org) — local-vision by default
                 → PhotoAnalysisMetadata { ocr_text, labels, damage_detected, damage_notes, caption }
                 → persist to photo_analysis (same writer the job uses — do NOT fork a second)
4  RESOLVE    → each ocr_text token through routeScan()   (the ONE decoder)
                 → misses fall through to hybridSearch(orgId, token)   (the ONE search engine)
                 → SearchHit[]
5  GENERATE   → POST /api/support/suggest with { ticketId, stagedPhotoIds }
                 route resolves a SIGNED GCS READ URL server-side (§1 correction #5)
                 multimodal capability via resolveAiConfig() when the org has one
                 else text-only hermes over the deterministic OCR/labels + RAG
6  DRAFT      → bridge.setDraft(text, { mode: 'public' })  — NEVER submit()
```

**Steps 3–4 are the whole differentiator.** An OCR'd serial that resolves to a real `serial_units`
row is the difference between "a chatbot looked at a photo" and "our system recognised this unit."
Do not skip straight to step 5 because the model can read text itself — the deterministic pass is
what makes the photo searchable afterwards and what keeps the local-first promise.

### 7.2 Paste handling — net-new, and there is no prior art here

`clipboardData` / `onPaste` return **zero hits** in the support tree and in `usePhotoDropzone`
(which is drag + click-to-pick only).

- **Extend `usePhotoDropzone` with a paste handler** rather than writing a second clipboard reader —
  it already owns the `image/*` filter and the internal-drag exclusion, and the Zendesk claim modal
  will inherit paste for free.
- Paste **must not** fire while the operator is typing an image-less paste into the composer (text
  paste is text paste). Gate on `clipboardData.items` actually containing a file.
- Multiple images in one paste: stage all, analyze all, **one** draft request carrying all of them.
- Must not collide with `⌘K` (CommandBar owns it) or Escape (innermost overlay owns it).
- Announce the async result to screen readers; the rail auto-selecting Assist is a focus change the
  keyboard path has to survive.

### 7.3 API contract

```ts
// POST /api/support/suggest
interface SuggestionRequest {
  ticketId: number;                 // number, not string — matches the live route
  question?: string;                // existing text path stays working
  subject?: string;
  stagedPhotoIds?: number[];        // NEW — photo ids, not URLs. The route resolves
                                    // the signed GCS read URL itself; the client never
                                    // holds one and a model never sees an app route.
}

interface SuggestionResponse {
  suggestion: string;
  sources: Array<{ type: 'thread' | 'ocr' | 'catalog' | 'rag'; label: string }>;  // BREAKING: was string[]
  confidence: 'high' | 'medium' | 'low';
  mode: 'local' | 'cloud-multimodal';                                             // widened union
  grounded: boolean;
  searchHits?: SearchHit[];         // NEW — output of routeScan + hybridSearch
}
```

- Migrate `SupportSuggestionPanel`'s source rendering in the same commit (it renders `string[]` today).
- Generation is **not a mutation** — no audit row (matches `/api/ai/chat` and the existing route).
- Keep the per-org rate limit (`checkRateLimitForOrg`) and the helpdesk-connected gate.
- Keep `SuggestDeps` injection so this stays unit-testable with zero network. Add the vision and
  search collaborators to `SuggestDeps`; do not reach for them directly.

### 7.4 Privacy — a required parameter, never a default

Routing a customer photo to a cloud model is a **safety classification**, so per
`backend-patterns.md` it is a **required parameter with no default**. A default is a silent opt-out
that every unvisited call site takes automatically.

- The org's multimodal choice resolves the same way `PhotoAnalyzeProvider` does: **org setting → env
  → local-first default**. No new token home — credentials live only in `organization_integrations`
  via `lib/integrations/credentials.ts`.
- With no cloud provider configured the loop **degrades to text-only**, it does not fail.
- The operator must be able to see which lane ran. `mode` + `model` are already in the response.

### 7.5 Trust surface (the Assist display)

Render the provenance, or the draft is not shippable to a customer:

- confidence chip + which lane ran (`local` / `cloud-multimodal`) + the model
- what came from the **image** (`caption`, damage flag, OCR'd identifiers)
- what matched in **our data** (`SearchHit` title + entity type, linked via `searchHitHref`)
- what came from the **thread** and from **RAG grounding**
- a closing line that the draft is in the composer and must be reviewed

### 7.6 Failure + latency

- Extraction or generation fails → **the image stays staged as a normal attachment**, one toast:
  *"AI assist unavailable. Image attached."* The record is never blocked by the assistant.
- Budget: stream generation into the composer within **~3s of the upload resolving**. If you cannot
  stream, show the extraction result (caption + matches) as soon as step 4 lands rather than holding
  a spinner — the support-context bundle on this surface already spins for up to 20s and that is the
  bar not to repeat.
- Skeleton at the real geometry. **Never** a `min-h-[N]` reserving space for a body that may be small.

**Gate:** `service-workspace.guard.test.ts` + an end-to-end paste on the dogfood org, with the
network tab confirming no app-route URL was handed to a model.

---

## 8. Source-of-truth diffs (land with the phase that makes them true)

**Do not land a rule ahead of its code.** Each block ships in the commit that implements it.

### `.claude/rules/display/workbench-service.md`

Replace the "AI suggestions is ABSENT" note. Add, in the branch law:

> **Thread anatomy.** The conversation is a `MergedRecordStream` — messages and warehouse/carrier
> events interleaved chronologically. **Bubbles are banned.** Flat rows, one shared left reading
> edge, `divide-y divide-border-hairline`, day bands via `DateGroupHeader`. Direction is the leading
> mark (avatar / station glyph), never a background fill; internal notes tint with `surface-sunken`
> **and** say so in the row, so colour is never the only carrier.
>
> **Support reply drafting.** The AI is an assistant, not an actor. Generation lives in the right
> rail (`Assist` display); the draft bridges into the middle's `OmnichannelComposerDock` via
> `ThreadComposerBridge.setDraft`. **It never sends, and it never clobbers operator text.** There is
> no conversational AI panel — the assistant drafts from physical truth, it does not answer trivia.
>
> **The vision loop.** Pasting an image on the work surface stages it through the existing photo
> pipeline, auto-selects the `Assist` display, and requests a draft. The rail auto-opens if parked.

### `.claude/rules/source-of-truth.md`

Three new rows in the presentation/waist table:

> | Support reply drafting | ONE waist — `useSupportSuggestion` → `POST /api/support/suggest` → `lib/support/suggest-reply.ts`. The draft bridges into the composer; it never replaces it and never sends |
> | Image understanding | ONE provider resolution — `resolvePhotoAnalyzeProvider` (org → env → `local-vision`). Deterministic OCR / labels / damage run **local-first** and persist to `photo_analysis`. Multimodal reasoning is an explicit per-org cloud opt-in via `resolveAiConfig`; absent it, the loop degrades to text-only. **A model is never handed an app route** — the route resolves a signed GCS read URL server-side |
> | Decode → our-data cross-reference | OCR output MUST pipe through `routeScan` then `hybridSearch`. **Never a second matching engine.** The assistant reasons over `SearchHit` data, not raw image text — that is the difference between recognising a unit and describing a photo |

### `.claude/rules/ui-design-system.md` — new section

> ## Conversation & message rows
>
> There was no house law for a message row until 2026-08-02, and that vacuum is exactly why a chat
> template filled it.
>
> - **Tone is information, never decoration.** Direction (inbound / outbound) is the leading mark's
>   identity, not a bubble fill. A surface where twenty messages share one accent fill is spending
>   its only free signalling channel on saying "this is a chat".
> - **Backgrounds default to transparent.** Internal notes use `surface-sunken`, paired with a label
>   so the state survives for a colour-blind operator.
> - **One shared left reading edge.** Ragged variable-width blobs are banned; they destroy the scan
>   speed a dense list exists to buy.
> - **Day banding is required** for any thread spanning >24h — `DateGroupHeader`, never a second one.
> - **No per-row redundancy.** A chip repeated on every row (`PUBLIC`, the author on consecutive
>   messages) is paid for N times and read once.
> - **Block markdown must render** — headings, lists, blockquotes — on the house type scale. The
>   grammar escapes first, then tokenizes, and never reaches `dangerouslySetInnerHTML`.

### `.claude/rules/backend-patterns.md`

> **AI generation routes.** Generation is not a mutation: no audit row, but always a per-org rate
> limit and a capability-connected gate. Provider resolution is a pure function over
> `(org settings, env)` with a local-first default. Anything that decides **what a customer sees** —
> which lane ran, whether a photo leaves the tenant's hardware — is a required parameter with no
> default (see *A safety classification is a REQUIRED parameter*).

---

## 9. Explicitly out of scope

- A conversational AI panel. The assistant drafts; it is not a chat partner.
- Auto-send, at any confidence.
- Sweeping `ThreadPanel.tsx` (entity threads) onto the ledger anatomy — separate ruling, separate hosts.
- Asymmetric left/right correspondence layout (rejected: breaks the single left reading edge).
- Bypassing `local-vision` for a cloud model on the extraction pass (rejected: breaks the local-first
  promise, breaks `photo_analysis` searchability, and burns cloud tokens on barcode reading).
- New auth tokens or a second credential home.
- LTV / return-rate aggregates without a reviewed plan.

---

## 10. Tree-state warning (real — it cost this initiative twice already)

Several sessions edit this repo concurrently. During the predecessor work another session committed
this lane's uncommitted files into its own commits **twice**, rewrote a rules file mid-flight, and
left a half-written component with a dangling import under a running session.

- **Stage only your own files.** Never `git add -A`, never `git stash`.
- Before assuming a red gate is yours, `git status --porcelain` the failing path.
- At the time of writing, `verify` is red from **other** lanes: `dialog-shell` ratchet 41 vs baseline
  40 (offenders are `StaffAvatarEditor.tsx`, `ScanStationProgressControl.tsx`, `pane-header/blocks.tsx`
  — all untracked or modified by other sessions), `merge-station-unit-journeys`, and a scratch
  Playwright probe. **None of those are this work.** Verify your own slice explicitly
  (`npx eslint <paths>`, targeted `npx tsx --test`) and report which failures are pre-existing.

---

## 11. Definition of done, per phase

| Phase | Done when |
|---|---|
| 1 · Ledger | Bubbles gone on all three `SupportTicketDetail` hosts; day bands render; block markdown renders (no literal `###`); field band gone, status/priority in the identity row; `support-chat-hierarchy.guard.test.ts` migrated, not silenced; Unbox 360px push verified |
| 2 · Identity | `RequesterDetailBand` renders the five available facts, `—` for the rest, and does not collapse when the customer is unlinked |
| 3 · Assist | The rail shows Connections · Conversations · Timeline · Assist; a draft reaches the composer without sending; typed operator text is not clobbered; the dock label is unchanged by display selection; the Bose hardcode is gone |
| 4 · Vision | Paste → staged → analyzed → cross-referenced → drafted, on the dogfood org; network shows a signed GCS URL, never an app route; provider absent ⇒ text-only fallback, not failure; failure leaves the image attached with one toast |

**Every phase:** `npm run verify` green for your slice, the SoT diff for that phase landed in the
same commit, and a browser pass at 1440 with the rail open. Measure geometry with a probe, not a
screenshot — a screenshot cannot tell "pushed" from "covered".
