# Handoff — Support ticket premium upgrade, Phases 2–4

**For:** the next Claude Code session
**From:** the session that built Phase 1, 2026-08-02
**Supersedes** §§4, 8 (partly) and §11 of
[`support-ticket-premium-upgrade-CLAUDE-CODE-PROMPT.md`](./support-ticket-premium-upgrade-CLAUDE-CODE-PROMPT.md).
Everything else in that prompt still stands — **read it first**, then read this for
the corrections.

**Surface:** `/support?ticket=<id>` — Workbench branch `service-workspace`
**Lane:** current checkout, no ad-hoc branch. Attach to `:3050`. **The user owns commits.**

---

## 0. Run it at this effort

One line per phase. These are *floors* — the cost of getting each one wrong is
the reason, not the line count.

| Phase | Model | Effort | Why that floor |
|---|---|---|---|
| **2 · RequesterDetailBand** | Opus 5 | **medium** | Small and mostly mechanical. The one judgment call is refusing to invent LTV / return rate, and that decision is already made below — the session only has to hold the line. |
| **3 · Assist display + `setDraft`** | Opus 5 | **high** | Two things that bite: an overwrite rule on a **shared** interface (get it wrong and a support agent loses three typed sentences with no undo), and a multi-tenant prompt leak. Neither is discoverable by tests. |
| **4a · paste → stage → analyze → cross-reference** | Opus 5 | **xhigh** | Six layers, one of them a security-shaped trap (§1 correction #5 — never hand a model an app route). The deterministic pass is the whole differentiator and the cheap wrong answer is to skip it. |
| **4b · generate + trust surface + failure/latency** | Opus 5 | **xhigh** | A breaking contract migration (`sources: string[]` → objects) across four files, plus a safety classification that must be a **required parameter with no default**. |
| **Final sweep** (verify, E2E, SoT diff audit) | Opus 5 | **medium** | Mechanical once the phases are green. |

**Split Phase 4 at the seam shown above.** It is the only phase where one turn
cannot both hold the pipeline and do the contract migration carefully; the seam
is natural because 4a produces `SearchHit[]` and 4b consumes it.

Do **not** drop to Sonnet for Phase 3 or 4. Phase 2 on Sonnet 5 / high is
defensible if you want the speed; the rest is not worth the retry.

**Do not use a workflow or subagents** unless the user asks. This is sequential
work on one surface with a shared type spine — fanning it out invents merge
conflicts inside a single component tree.

---

## 1. What Phase 1 actually landed (do not rebuild any of it)

All green: `tsc` clean on this slice, `eslint` clean, 52 tests pass, `knip` clean
for this slice. Verified in a real browser at 1440 with a Playwright probe —
**13 rows, 6 day bands, `distinctLeftEdges: [32]`** (the one-shared-left-edge
proof the ruling asked for), 0 console errors.

**New files**

| File | What it is |
|---|---|
| `src/components/support/zendesk/chat/MergedRecordStream.tsx` | The ledger. Replaces the deleted `SupportChatThread.tsx`. |
| `src/components/support/zendesk/chat/SupportTicketFields.tsx` | `TicketStatusSelect` · `TicketPrioritySelect` · `TicketAssignmentFields`, extracted from the killed field band. |
| `src/lib/timeline/zendesk-comment-events.ts` | `zendeskCommentsToTimeline` + `MergedRecordItem` / `TicketCommentRow` / `TicketMessageDetail` / `TicketAttachment`. |
| `src/components/ui/timeline-ref-chip.tsx` | `TimelineRefChip`, **extracted out of `EventTimeline`** so both renderers share one `kind` dispatch. |

**Changed**

- `src/lib/support/markdown.ts` — added `parseMarkdownBlocks` + `renderBlockMarkdown`
  (headings / lists / quotes / rules). The block type scale is defined **once**, in
  `BLOCK_CLASS`. `markdownToHtml` was deliberately **not** extended — see §5.
- `SupportChatHeader.tsx` — field band deleted; returns `null` when the host hides
  both the requester band and the title (that is `/support`).
- `SupportDetailsStack.tsx` — new `fields: 'read' | 'edit'` prop.
- `SupportTicketIdentity.tsx` — the 8px status dot became a `TicketStatusSelect`;
  `TicketPrioritySelect` beside it. The dot survives only as the loading face.
- `support-ticket-displays.tsx` — Connections gained an `Assigned` section.
- `resolve-support-terminal.tsx` — dock label follows the visibility mode at rest.
- `LinkedTicketsPanel.tsx` — the loop chips gained a kind label track (`LoopRow`).
- `support-chat-hierarchy.guard.test.ts` — **migrated, not silenced.** Re-pointed at
  `MergedRecordStream`, original assertions kept, five added.
- Rules: `workbench-service.md` (Thread anatomy + field-band table),
  `ui-design-system.md` (§ Conversation & message rows), `reference-timeline.md`
  (the sibling justification).

**Probe hooks now in the DOM** — use these instead of class selectors, the queue
also carries `divide-y divide-border-hairline` and will match:

```
[data-testid="support-merged-stream"]
  [data-stream-row="message" | "event"]
  [data-internal="true"]            // internal notes only
```

---

## 2. Corrections to the original prompt's §1 table

| # | Original said | Now |
|---|---|---|
| 1 | `ThreadComposerBridge` has no `setDraft` | **Still true.** Verified: `{ hasDraft, isPublic, submitting, canPost, focus, submit }` at `ThreadPanel.tsx:33`. Phase 3 still owns adding it. |
| 2 | `border-subtle` is not a token | Resolved — the ledger uses `divide-border-hairline`. |
| 3 | no `prose` plugin | Resolved — `renderBlockMarkdown` owns the block scale. **Reuse it in Phase 3/4; do not add a second.** |
| 4 | `analyzePhoto(deps)` is the sync DI'd core | **Still true.** `src/lib/photos/analyze-core.ts:69`, deps interface `AnalyzePhotoDeps:40`. Provider resolution is `resolvePhotoAnalyzeProvider` in `analyze-provider.ts` (used by `analyze.ts:178`). |
| 5 | `/api/photos/[id]/content` 302s to a signed GCS URL | **Still true and still the likeliest mistake.** `route.ts:130` calls `adapter.getSignedReadUrl(...)` then `NextResponse.redirect(signed, { status: 302 })`. A cloud model cannot follow that. |
| 6 | LTV / active orders / return rate do not exist | **Still true.** See §3. |

Two more, both verified today:

- **`SupportSuggestionPanel` really does have zero consumers.** The only other hit
  is a *docblock* in `SupportContextDetailPanel.tsx:43` saying so. Nothing mounts it.
- **`sources: string[]`** — `suggest-reply.ts:31` declares it, `:157` fills it from
  `rag?.sources`, and `SupportSuggestionPanel.tsx:102` maps it. `mode: 'local'` is a
  literal union in `suggest-reply.ts:33`/`:159` and `useSupportSuggestion.ts:10`.
  Widening both is a four-file change **in one commit**.

---

## 3. Phase 2 — `RequesterDetailBand`

**Goal:** the agent sees who is asking and what already happened to them, before
reading the thread.

Ship these five and only these five:

| Fact | Source | Note |
|---|---|---|
| Name / email | `requesterFrom(ticket)` + `customers` row | already on screen elsewhere; this is its home |
| Linked order | `SupportContextBundle.linkage.order` | bundle is already fetched by the stream — **reuse the cache, do not add a query** |
| Tracking / serials / receiving | `SupportContextBundle.linkage` | same bundle |
| Order count for this customer | `orders.customer_id` — one aggregate | derivable, cheap |
| Prior ticket count | helpdesk search by requester | one call |

**LTV and return rate do not exist and you are not to invent them.** No
placeholder number, no `0`, no "—" pretending to be a metric that will fill in
later. If they are wanted, propose the aggregate (the query, where it caches,
what it costs per ticket open) as a separate reviewed change.

- Compose `StaffAvatar` / `IdentityMark` from `@/components/identity`. Never a
  hand-rolled `rounded-full` + initials span, never a local `initials()`.
- **Placement:** above the stream, inside the same scroll port — it is context for
  the conversation, and it scrolls away with it. It is not chrome; do not pin it.
- **Gate:** renders on a ticket with no linked customer without collapsing the
  layout. That is the actual failure mode — an unlinked ticket is the common case.

---

## 4. Phase 3 — the Assist display

**Goal:** prove the trust model and the rail→composer bridge with logic that
already exists. Nothing here is net-new AI.

Already built, do not rebuild: `SupportSuggestionPanel` · `useSupportSuggestion` ·
`POST /api/support/suggest` · `lib/support/suggest-reply.ts` (DI'd via
`SuggestDeps`, unit-testable with zero network) · `nemoclaw-rag` grounding ·
`hermes-client` generation.

### 4.1 `setDraft` — the one net-new API

```ts
/**
 * Insert a drafted body into the composer. NEVER sends.
 *
 * `mode` sets the public/internal toggle so a draft addressed to the customer
 * cannot arrive with `Internal` selected.
 *
 * MUST NOT clobber operator text.
 */
setDraft: (text: string, opts?: { mode?: 'public' | 'internal' }) => void;
```

**The overwrite rule is the load-bearing part and it is a real decision.** Pick
ONE of refuse-and-tell / append-below-a-rule / explicit-confirm, implement it, and
say which in the docblock. `requestConfirm` / `ConfirmDialogHost` is the house
confirm — never a hand-rolled scrim.

`SupportChatComposer` already has `seedBody` + `seedToken` (`:50–53`) and its
effect is keyed on `seedToken` alone. **That is the mechanism to build on, and it
is currently unsafe for this purpose** — it overwrites `body` unconditionally.
Route it through the new rule; do not add a second seeding path beside it.

### 4.2 Mount it

- Add to `support-ticket-displays.tsx` → **Connections · Conversations · Timeline ·
  Assist**. Icon `Sparkles`. Exclusive, persisted by selection, like every peer.
- **Rail, not middle** — suggesting is an extra; sending is the work.
- **The dock stays ticket-terminal.** If you find yourself threading an imperative
  bridge from the rail to the dock's label, stop.

### 4.3 Fix the tenant leak while you are in here

`suggest-reply.ts:56` hardcodes *"a senior customer-support agent for a **Bose**
audio reseller"*, and `:127`/`:138`/`:139` plus the route's own docblock repeat
"Bose". This is shared multi-tenant code — USAV is the dogfood tenant, not the
product. Resolve the vertical/brand framing from org settings, or drop it to a
generic "reseller". **A second tenant on this code today gets a prompt claiming
they sell Bose.**

**Gate:** `right-rail-push.guard.test.ts` + a real draft reaching the composer
without sending + a typed-draft-not-clobbered test.

---

## 5. Phase 4 — the vision loop

Follow §7 of the original prompt verbatim for the pipeline, contract, privacy
rule, trust surface and failure/latency budget. Three additions from today's
reconnaissance:

- **`usePhotoDropzone` has no paste handler** — confirmed zero `onPaste` /
  `clipboardData` hits in `src/hooks` and `src/components/support`. Extend that
  hook (it already owns the `image/*` filter and the internal-drag exclusion);
  the Zendesk claim modal inherits paste for free. Its signature today is
  `usePhotoDropzone(onFiles, { accept, multiple })` at `:40`.
- **`useTicketPhotoStaging` exposes `addFiles`** (`:32`, returned at `:125`) — that
  is step 2 of the pipeline, already built.
- **Reuse `renderBlockMarkdown` for the drafted body preview.** A model returns
  markdown; the Assist display showing literal `###` is the exact defect Phase 1
  fixed one surface up.

**Known gap you may hit, and it is out of scope:** `markdownToHtml` (the Zendesk
`html_body` path) is still inline-only. A staffer who writes `### heading` in a
reply sees it rendered in the ledger and *literal* in the customer's email. Phase 1
deliberately left it — extending it is a separate, small change with its own test.
Flag it; do not silently fold it in.

---

## 6. Tree state — read before you diagnose a red gate

Several sessions edit this repo concurrently. **Stage only your own files. Never
`git add -A`, never `git stash`.** Before assuming a failure is yours,
`git status --porcelain` the failing path.

**Red from OTHER lanes as of this handoff** (each confirmed `M` in the working
tree, none touched by Phase 1):

- `tsc`: `src/components/station/receiving-grid/cells/ReceivingZohoCell.tsx` ·
  `src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx` ·
  `src/components/receiving/workspace/line-edit/steps/CartonPhotoPairPanel.tsx`
  (the set churns — another session is actively editing)
- `knip`: 8 findings, all under `src/lib/receiving/**` and
  `src/components/station/receiving-grid/**`
- A Turbopack overlay flashed a stale `dispatchReceivingOpenPairingPo` export error
  from `TriagePanel.tsx`. That symbol **does** exist (`src/utils/events.ts:179`) —
  it was an HMR race with another session's edit, not a real break.

**The dev server on `:3050` was DOWN at handoff** (`ERR_CONNECTION_REFUSED`).
The user owns it — **do not start, restart or kill it.** Ask, then attach.

---

## 7. Outstanding from Phase 1

One item, blocked on the dev server:

- **Verify the ledger at 360px in the Unbox ticket push.** Open Unbox with a linked
  ticket, expand `ReceivingTicketStack`, confirm the rows survive at 360px (mark
  column, meta-line wrap, attachment grid, day bands) and that `SupportChatHeader`
  still renders its requester band + the `fields="edit"` popover there. That host
  passes `hideRequesterBand={false}`, so it is the one surface where the header
  did NOT collapse to `null`.

An internal-note row was never seen rendered — ticket 9604's 13 comments are all
public (`data-internal` absent on every row). The tint + `Internal` label path is
code-correct and now probe-addressable; confirm it on a ticket that has one.

---

## 8. Definition of done, per phase

| Phase | Done when |
|---|---|
| 2 · Identity | Five available facts render, `—` for the rest, no invented aggregate, no layout collapse when the customer is unlinked |
| 3 · Assist | Rail shows Connections · Conversations · Timeline · Assist; a draft reaches the composer without sending; typed operator text is not clobbered; the dock label is unchanged by display selection; the Bose hardcode is gone |
| 4 · Vision | Paste → staged → analyzed → cross-referenced → drafted on the dogfood org; network shows a signed GCS URL, **never an app route**; provider absent ⇒ text-only fallback, not failure; failure leaves the image attached with one toast |

**Every phase:** `npm run verify` green for your slice (report which failures are
pre-existing, per §6), the SoT diff for that phase landed in the same commit, and
a browser pass at 1440 with the rail open. **Measure geometry with a probe, not a
screenshot** — a screenshot cannot tell "pushed" from "covered", and it cannot
tell one left reading edge from three.
