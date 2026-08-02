# Deep-research briefing — Support ticket surface: premium upgrade + vision-grounded reply drafting

**For:** Gemini 2.5 Pro (deep research / architecture adjudication)
**From:** Cycle Forge engineering, 2026-08-02
**Surface under review:** `/support?ticket=<id>` — Workbench branch `service-workspace`
**Repo:** `cycleforge-app` (Next 16 App Router · React 19 · Tailwind v4 · Postgres/Neon · TanStack Query)
**Lane:** WS-DOGFOOD (`main`). Dev server is operator-owned on `:3050` — attach, never start.

> **What we want back is a RULING plus an execution plan, not a survey.** Where this brief poses a
> question, answer it with a decision and the reasoning that forecloses the alternative. Where it
> states a house law, treat the law as binding and design inside it — or argue explicitly that the
> law is wrong and say what replaces it. "It depends" is not an answer we can build from.

---

## 0. TL;DR — the four things to decide

1. **What replaces the chat-bubble thread.** The current thread is a generic blue-bubble chat
   widget. It is the wrong primary surface for a support *record* in an ops app. Design the
   replacement and justify it against the alternatives (§6).
2. **Where the AI lives and what it is allowed to do.** A grounded reply-suggestion lane is ~85%
   built and mounted **nowhere** (§4.1). Decide its placement, its trust model, and its failure
   behaviour.
3. **The vision feature: paste an image → decode → drafted reply.** A per-org photo-analysis
   provider waist already exists (§4.2). Decide whether the ticket's image-understanding composes
   it or takes a new multimodal path, and specify the whole loop (§7).
4. **Which source-of-truth documents change, and to what text.** This repo's rules files are
   *binding law*, not documentation. Ship the exact diffs (§9).

---

## 1. Product context (do not re-derive this)

**Cycle Forge** is multi-tenant reseller-ops SaaS. A tenant is a used-goods reseller (eBay, Amazon
FBA, Shopify, walk-in). USAV is the dogfood tenant — a Bose audio reseller running a ~1–15 person
warehouse. Vendor integrations (Zendesk, Zoho, Ecwid) are **tenant connectors behind capability
facades**, never the product; operator copy uses capability nouns or the runtime provider label,
never a hardcoded vendor sentence.

### Who is on this screen

A **support agent** at a reseller. Not a call-center rep with a queue SLA dashboard — a generalist
who also touches receiving and shipping. Their day: a customer says "the IR emitter on my 4790 is
bad", and the agent must decide *what actually happened to that physical unit* and reply. The facts
they need are spread across the ticket thread, the order, the carton that was received, the serial's
journey, and photos taken at three different benches.

**The job to be done is not "answer a chat". It is: reconstruct the truth about one unit fast
enough to answer confidently, then answer.** Every design decision below should be scored against
that sentence.

### Brand personality — **Kinetic Ledger** (binding)

From `.impeccable.md` and `.claude/rules/kinetic-ledger.md`:

> Data-first reseller ops: dense, state-colored, scan-aware, multi-tenant. **Legible throughput over
> document calm.** Calm chrome (Linear discipline), not document whitespace as the product shape.

Five laws, all binding:

1. Facts and state drive chrome — chrome never invents a second story.
2. Archetypes are region contracts (I/O + persistence), not layout skins.
3. Data shape chooses the primary surface — table | list | board | card | timeline | KPI | canvas.
4. Presentation kinds resolve via SoT — labels, tones, chips, dates; **views stay dumb**.
5. Compose named shells; grow the SoT when wrong; compound every UI task.

Industry blend the house is aiming at: **ops density (Carbon / Stripe Dashboard) + Linear chrome +
POS/scan floors**. Explicitly *not*: Intercom, Zendesk Agent Workspace, or any consumer chat app.

---

## 2. Region contract (binding architecture)

`/support` is Layer-A **Workbench** (pointer-driven pick + edit, durable URL selection, CRUD),
Layer-C branch **`service-workspace`**. Full law: `.claude/rules/display/workbench-service.md`.

```
┌────────────────────┬──────────────────────────────────┐ ┌─────────────────────────┐
│ LEFT — queue map   │ MIDDLE — thread (focus surface)  │ │ RIGHT — displays        │
│                    │                                  │ │ ▣ ▣ ▣  icon strip       │
│ durable ?ticket=   │ split header (PaneHeader blocks) │ │ Connections             │
│ STAYS MOUNTED      │ conversation body — NO tab strip │ │ Conversations           │
│ (display:none)     │ crossfades on ticket id          │ │ Timeline                │
│                    │ ──────────────────────────────── │ │ push · resize · collapse│
│                    │ OmnichannelComposerDock (bottom) │ │ SupportContextDetailPanel│
└────────────────────┴──────────────────────────────────┘ └─────────────────────────┘
      the SHELL's two slots                          the RightRailHost's occupant
```

**The branch's ranking rule** — this settles arguments the composition table cannot:

> **The middle is what must be done right now. The right side is the extras — the context and the
> actions that help the middle.** If it is the work, it belongs in the middle.

### Non-negotiables (violating one is a bug even when the feature "works")

| Law | Where |
|---|---|
| The **queue never unmounts** — hidden with `display:none` + `inert`, never conditionally rendered | `ServiceWorkspaceShell.tsx`, guarded |
| Only the **thread** crossfades on ticket id; the queue never animates | `motionRole.swap.focus` (0.18s tween) |
| Every resident right edge **PUSHES**; nothing floats over the work surface. Width comes from the LEFT before it comes from the grid | `source-of-truth.md` → Right-rail modality |
| **One owner of the right edge**: `RightRailHost` renders exactly one occupant. No private `fixed right-0 z-panel` | `src/lib/right-rail/store.ts` |
| The bottom dock is **ticket-terminal** — a click on the right edge must never re-label the button at the bottom | `display/station-workbench.md` |
| **One scroll port per region, and the HOST owns it.** A child that adds `overflow-y-auto` inside a host that already scrolls gets no height at all | `ui-design-system.md` → Scroll ownership |
| **Never reserve height a body has not asked for** — a `min-h-[N]` on dynamic content renders as an empty void | `ui-design-system.md` |
| Color, spacing, type, z-index, elevation, focus come from **tokens**. No page-local hex, no raw `z-[N]`, no hand-rolled `focus:ring-*` | `source-of-truth.md` |
| **Type: three cuts, one face each, capped at 600.** Sans = Inter; condensed = IBM Plex Sans Condensed (bound to `role-eyebrow`/`role-micro`); mono = IBM Plex Mono (identifiers only). `font-bold`+ is banned and the 700 cut is not even loaded | `ui-design-system.md` → Type |
| Motion: name a `motionRole.*`; import only from `@/design-system/motion`; **never animate layout** except a deliberate push toggle (tween, never spring) | `display/motion-crossfade.md` |
| **`⌘K` has exactly one owner** (`CommandBar`) and Escape belongs to the innermost overlay | `source-of-truth.md` |
| Order notes have **one writable home** (`order_notes`); ticket ↔ entity linkage has one (`shipment_links` / `ticket_links`) | `source-of-truth.md` |
| A safety classification is a **required parameter**, never defaulted | `backend-patterns.md` |
| Migration lands **first** (expand → code → contract) | `backend-patterns.md` |

---

## 3. Measured current state (2026-08-02, dogfood org, 1440×900, `/support?ticket=9604`)

Measured in the real browser against the running dev server, not eyeballed from a mock.

| Fact | Value |
|---|---|
| Right rail | `data-right-rail-mode="push"`, `x=1012 w=420`, zero overlap with the thread card |
| Rail displays | Connections · Conversations · Timeline, `SectionTabsSlider density="icon"` |
| Subject renders | exactly once (`innerText` count = 1) — a duplicate was removed the same day |
| Scroll ports on the page | 12 |
| Support-context bundle latency | Connections still showed a bare spinner at **9s**; resolved by 20s |
| Thread messages on this ticket | ~20 across 9 days |
| Distinct message tones used | **1** (accent blue) for every author, plus white for the last |

### What is on screen, precisely

- **Four stacked horizontal bands** before any content: (1) pane-header action row, (2) pane-header
  identity row (status dot · subject · `#9604`), (3) a Zendesk field band (`Open ▾` `Priority ▾`
  `Manager ▾` … `Staff ▾`), (4) the thread's own top edge.
- **Every message is a saturated accent-blue bubble** with a circular initials avatar and a `PUBLIC`
  chip. `Sales Support` appears **18 times** on one screen. The last message is the only white one
  and it is white because of authorship, not because that is legible as a rule.
- **Block markdown is not rendered.** A real message shows literal `### Expected Delivery by` and
  `## Monday3 August2026` inside a blue bubble. `src/lib/support/markdown.ts` implements an
  **inline-only** grammar (bold / italic / code / image / autolink / line breaks). Block headings,
  lists and quotes fall through as raw text.
- **No customer identity anywhere in the middle.** The requester band is suppressed on this host
  (`hideRequesterBand` defaults to `embedded`). There is no name, email, order history, lifetime
  value, or "third ticket this month".
- **Connections shows three unlabelled chips** — `4790`, `33987359`, `220573AZ`. Nothing on screen
  says which is the order, which is the tracking number, which is the serial.
- **Composer at rest lies.** Placeholder reads "Internal note — not emailed…", the mode toggle shows
  `Internal` selected, and the primary button reads **Reply** in green. The label only becomes
  honest once a draft exists (`resolveTicketTerminal` in
  `service-workspace/resolve-support-terminal.tsx`). The green also has no relationship to the
  accent blue used everywhere else on the surface.
- **Loading is a bare centred spinner** for up to ~20s in a 420px column.

### File map (start here, do not go hunting)

```
src/components/support/
  zendesk/SupportTicketsWorkspace.tsx        # branch mount: list | thread | rail occupant
  zendesk/SupportTicketsBoard.tsx            # the queue map (must stay mounted)
  zendesk/chat/SupportChatThread.tsx         # THE BUBBLE THREAD — primary rewrite target
  zendesk/chat/SupportChatHeader.tsx         # status/priority/agent/staff field band
  zendesk/chat/SupportChatComposer.tsx       # reply composer (inline + station-dock variants)
  zendesk/chat/SupportTicketComposerDock.tsx # floating dock compound
  zendesk/chat/SupportTicketDetail.tsx       # header + thread + dropzone + gallery
  zendesk/chat/SupportSuggestionPanel.tsx    # ★ BUILT, ZERO CONSUMERS
  zendesk/chat/TicketSubjectField.tsx        # the one subject renderer
  service-workspace/ServiceWorkspaceShell.tsx
  service-workspace/SupportTicketFocus.tsx   # the middle
  service-workspace/SupportTicketPaneHeader.tsx / SupportTicketIdentity.tsx
  service-workspace/support-ticket-displays.tsx   # the rail's displays
  service-workspace/resolve-support-terminal.tsx  # dock VM
  context/SupportContextDetailPanel.tsx      # THE rail occupant
  context/SupportContextHub.tsx              # Linkage | Customer | Team | Activity
src/lib/support/  markdown.ts · suggest-reply.ts · context-types.ts · ticket-refs.ts
src/lib/photos/   analyze-provider.ts · analyze-core.ts · analyze-types.ts · local-vision-client.ts
src/lib/ai/       provider.ts · hermes-client.ts · nemoclaw-rag.ts · gemini.ts
src/hooks/        useSupportSuggestion.ts · useTicketPhotoStaging.ts · usePhotoDropzone.ts
                  useSupportContext.ts · useZendeskQueries.ts
```

Guards that will fail you if you break the branch: `service-workspace.guard.test.ts`,
`right-rail-push.guard.test.ts`, `support-chat-hierarchy.guard.test.ts`,
`workbench-anti-station-shell.guard.test.ts`, `dialog-shell.guard.test.ts`,
`typography-tokens.guard.test.ts`, `spacing-tokens.guard.test.ts`, `focus-ring-tokens.guard.test.ts`,
`motion-major.guard.test.ts`.

---

## 4. What already exists — do not rebuild these

This is the highest-ROI section of the brief. Two substantial systems are already in the tree and
unmounted or unconnected.

### 4.1 A grounded reply-suggestion lane, ~85% built, with **zero consumers**

| Layer | Path | State |
|---|---|---|
| UI | `zendesk/chat/SupportSuggestionPanel.tsx` | complete — confidence chip, sources, Use / Regenerate / Dismiss, error + retry |
| Hook | `hooks/useSupportSuggestion.ts` | complete (`useMutation` → the route) |
| Route | `app/api/support/suggest/route.ts` | complete — `withAuth`, per-org rate limit, helpdesk-connected gate |
| Domain | `lib/support/suggest-reply.ts` | complete — DI'd (`SuggestDeps`), unit-testable with zero network |
| Grounding | `lib/ai/nemoclaw-rag.ts` | Bose document RAG |
| Generation | `lib/ai/hermes-client.ts` | local Hermes gateway |

Contract already returns `{ suggestion, sources, confidence: 'high'|'medium'|'low', mode: 'local',
model, grounded }`. The domain docblock **already anticipates the cloud sibling**:

> "a cloud sibling can implement the same `SupportSuggestion` contract later and be selected per-org
> (mirrors the photo_analysis provider pattern)."

**Nothing mounts the panel.** It has never been on screen. It is currently listed as deliberately
absent in `workbench-service.md` on the grounds that "an empty tab that looks broken is worse than a
missing one" — which was correct *given no bridge into a composer*. Building that bridge is the
cheapest large win on this surface.

### 4.2 A per-org vision/photo-analysis provider waist

`src/lib/photos/analyze-provider.ts` resolves a provider per organization:

```
'local-vision' | 'hermes' | 'gcp-vision' | 'catalog'
precedence: org setting → PHOTOS_ANALYZE_PROVIDER env → 'local-vision'   (LOCAL-FIRST default)
```

Every provider must produce one shape (`analyze-types.ts` → `PhotoAnalysisMetadata`):

```ts
{ ocr_text: string[]; labels: string[]; damage_detected: boolean;
  damage_notes: string | null; caption: string }
```

…which lands in `photo_analysis.metadata` (jsonb) and is what SQL photo search reads. Only
`photo_analysis.model` records which engine ran. There is an admin UI for the choice
(`components/admin/PhotoAnalysisProviderPanel.tsx`) and shared `DAMAGE_KEYWORDS` so "damaged" means
one thing everywhere.

**This is a strong local-first privacy posture and it is a product position, not an accident.** A
tenant with an on-prem RTX box keeps every customer photo on their own hardware.

### 4.3 A photo staging + upload pipeline already wired to the ticket composer

- `useTicketPhotoStaging(ticketId)` — host-owned staging bag; shared by the dropzone and the dock.
- `usePhotoDropzone(onFiles)` — drag-drop + click-to-pick, `image/*`, ignores internal app drags.
- Drop anywhere on the ticket panel → uploads to GCS → links the photo to the ticket → stages it on
  the next reply. Full-panel drop overlay already implemented.
- `usePhotoGallery` + `PhotoViewerPortal` — one gallery aggregated across every message attachment
  and linked photo.

**Gap:** there is **no paste handler anywhere** (`clipboardData` / `onPaste` return zero hits in the
support tree and in `usePhotoDropzone`). Paste is genuinely net-new — and it is the single
interaction the request names.

### 4.4 AI config resolution

`src/lib/ai/provider.ts` → `resolveAiConfig()` is the SoT for `{ baseURL, apiKey, model }` per
capability. A Vercel AI Gateway lane exists (models are referenced as `"provider/model"` strings,
e.g. `anthropic/claude-haiku-4-5`). **No multimodal call exists anywhere** — `image_url`,
`inlineData`, `vision`, `multimodal` return zero hits across `src/lib/ai/*`. `gemini.ts` is
embeddings-only (`text-embedding-004`).

---

## 5. The critique to design against (summary — full version in §11)

**Verdict: it does not read as a premium product.** Not because of the usual 2024 AI-slop palette —
there are no purple gradients, no glassmorphism, no dark-mode-with-glow, no hero metrics, and the
token discipline is genuinely good. It fails for a subtler and more expensive reason:

> **It is a generic chat widget wearing this product's tokens.** Someone reached for the Intercom
> template instead of asking what a support agent at a reseller actually needs, and then obeyed the
> design system while doing it.

The concrete tells:

1. **Color carries no information.** Twenty messages, one blue. Author, direction (inbound vs
   outbound), and visibility (public vs internal) are all encoded in repeated *text chips* instead of
   in the one channel that could carry them for free. This is a direct violation of law 1 — chrome
   is telling a story ("this is a chat") that the facts do not support.
2. **Redundancy on every row.** `PUBLIC` + author name + relative timestamp, 20 times. The eye pays
   for it 20 times and learns nothing new after the first.
3. **Ragged bubbles destroy scanability.** Variable-width blobs from 12 characters to 3 lines, no
   consistent left edge, no day banding on a 9-day thread. An ops app's whole premise is that a
   dense list scans faster than a document — this abandons that.
4. **A visible rendering bug ships as content.** Literal `###` and `##` in a customer-facing
   conversation reads as "unfinished software" more loudly than any layout flaw.
5. **The primary fact is quiet and duplicated.** Ticket status is the single most load-bearing state
   on this record; it renders as an 8px dot *and* a small grey dropdown, neither of which wins the
   eye. Meanwhile a green button that has no relationship to the surface's accent wins it instead.
6. **No customer.** A world-class support surface leads with *who is asking and what their history
   is*. This one leads with a subject line.
7. **The 420px rail is mostly empty** and its Connections display renders three unlabelled
   identifiers. Structurally correct (typed chips from the SoT), communicatively useless.
8. **Nested containers.** A glass `WorkspaceCard` inside a canvas inside a card, with the composer
   floating over it — "wrap everything in cards" is on the house's own ban list.

---

## 6. Question 1 — what replaces the thread

Design the middle. Score every option against *"reconstruct the truth about one unit fast enough to
answer confidently, then answer."*

Candidate directions (do not feel limited to these — but if you pick one, say why the others lose):

- **A · Ledger thread.** Kill bubbles. Flat rows on a shared left edge, house one-row anatomy
  (title → meta → chips right), `divide-y`, day bands (the house already ships `EventTimeline` +
  `DateGroupHeader` for exactly this). Direction encoded by a leading state mark, not a fill.
  Internal vs public encoded by *tone*, not a repeated chip.
- **B · Asymmetric correspondence.** Inbound and outbound genuinely differ (one you receive, one you
  wrote), so express that as an asymmetry of position/weight rather than of bubble color — but keep a
  single left reading edge for the body text.
- **C · Merged record stream.** The conversation is not the only thing that happened to this ticket.
  Interleave carrier events, receiving scans and unit journeys inline with messages, in one
  chronological ledger. The house already has the machinery (`EventTimeline`, the `*ToTimeline`
  adapters, `collapseTimeline`) and this maps directly to the job-to-be-done. Risk: burying the
  reply the agent is answering.
- **D · Two-density thread.** Collapsed by default with an expand-on-focus body — Linear's comment
  discipline. Risk: hiding the record.

**Constraints on whatever you pick:**

- One reading edge. Ragged variable-width blobs are out.
- Color must be *information*: a colour-blind operator must lose nothing (state also on glyph + label).
- Attachments are first-class (this tenant's tickets are photo-heavy) and must open the existing
  `usePhotoGallery` viewer, never a new tab, never a second lightbox.
- Block markdown must render (headings, lists, quotes) without introducing an HTML injection path —
  `markdown.ts` escapes first, then tokenizes, and never uses `dangerouslySetInnerHTML`. Keep that.
- Long threads must be virtualization-ready or paginated; assume 200+ messages.

Also rule on: **does the Zendesk field band (`Open ▾ Priority ▾ Manager ▾ Staff ▾`) survive as its
own row?** It is currently a fourth stacked band with the visual weight of a toolbar and the
importance of a status line. Fold it into the identity row, demote it into the rail, or defend it.

---

## 7. Question 2 — the vision loop (the feature this brief exists for)

### The requested interaction, in the user's words

> "I should be able to paste an image onto the right side and AI will decode the image and then
> suggest a reply to the ticket. Just like ChatGPT replying to customer support — world-class
> premium SaaS."

### What that has to mean concretely

```
paste (⌘V / drag / pick)  →  a stated understanding of the image  →  a drafted reply
                             (what it is, what's wrong, what it     grounded in that
                              matches in OUR data)                  understanding + the thread
                                                                    ↓
                                                 the agent edits and sends. Always.
```

### Decisions we need from you

1. **Where does paste land, and what is "the right side" now?** The right edge is a
   `RightRailHost` push column showing one display at a time (Connections · Conversations ·
   Timeline). Options: a fourth **Assist** display; a paste target on the composer that *renders* its
   result in the rail; or a rail that auto-selects Assist on paste. Note the branch's ranking rule:
   **suggestions are extras (rail); sending is the work (middle)**. An AI panel that *sends* would
   belong in the middle and would be wrong.
2. **Which engine decodes the image?** Compose the existing `PhotoAnalyzeProvider` waist
   (`local-vision` default, per-org, on-prem-capable, one `PhotoAnalysisMetadata` shape), or add a
   multimodal LLM lane through `resolveAiConfig`? Trade-off to adjudicate explicitly:
   - the existing waist gives OCR + labels + damage detection + caption, is already per-org, already
     admin-configurable, already local-first, and already feeds photo search;
   - a multimodal LLM gives open-ended reasoning ("this is a Bose 4790 IR emitter, the connector is
     bent") that a label list cannot produce;
   - **is the right answer "both, in sequence" — deterministic extraction first, then reasoning over
     the extraction plus the thread?** If so, specify the contract between them and where the seam
     is. If not, say why one path alone wins.
3. **Privacy is a product position.** The local-first default exists on purpose. If your design
   routes customer photos to a cloud model, it must be a **per-org opt-in that is visible in the UI**
   and it must degrade to the local path, not fail. Specify the setting, its default, and what the
   operator sees. Do **not** invent a second token home — credentials live only in
   `organization_integrations` via `lib/integrations/credentials.ts`.
4. **What does "decode" render as?** A caption? A structured fact card (identified product ·
   condition/damage · OCR'd serial or order number · matches in our catalog)? The high-value move for
   *this* tenant is almost certainly **cross-referencing the decode against our own data** — an OCR'd
   serial that resolves to a `serial_units` row, a model number that resolves to `sku_catalog`, a
   tracking number that resolves via `routeScan`. The house already has:
   - `routeScan` (`lib/barcode-routing.ts`) — the ONE decoder for any scanned/typed/pasted string;
   - `hybridSearch` (`lib/search/hybrid-retrieval.ts`) — the ONE cross-entity search engine, exact-id
     bypass → trigram → pgvector → RRF;
   - `SearchHit` + `searchHitHref` — the result-shape SoT.

   **Decide whether the vision loop routes its OCR output through `routeScan` and `hybridSearch`.**
   Our instinct is that this is the difference between "a chatbot looked at a photo" and "our system
   recognised this unit" — but you should confirm or refute it, and specify the exact pipeline.
5. **Trust and provenance.** `SupportSuggestion` already carries `sources`, `confidence`, `grounded`
   and `model`. Specify what the agent must see before they can responsibly send: which facts came
   from the image, which from the ticket, which from our database, which the model inferred. A draft
   that cannot show its work is not shippable to a customer.
6. **Failure behaviour.** Blurry image, no text, unrelated photo, provider down, rate limit. The
   house rule is *teach and degrade* — a failing sub-resource renders empty and never takes down the
   record. Specify each state's copy and affordance.
7. **Persistence.** Does the decode write to `photo_analysis` (reuse of the existing table + the
   photo the dropzone already uploaded and linked), or is it ephemeral? Reuse implies a
   photo row exists first, which the staging pipeline already produces. Migrations land **first**.
8. **Cost + latency budget.** The support-context bundle already spins for up to ~20s on this
   surface. State a target: how long may paste→understanding take before the surface must show
   partial progress, and what streams.

### Interaction details to specify

- Paste anywhere in the ticket surface vs. paste only in a target — and how the operator knows.
  (Note: `⌘K` is owned by `CommandBar`; Escape is owned by the innermost overlay. Do not collide.)
- What happens to multiple images pasted at once.
- Whether the drafted reply lands in the composer via the existing bridge (`ThreadComposerBridge`,
  which already exposes `hasDraft` / `isPublic` / `submitting` / `canPost` / `focus()` / `submit()`)
  or in a review surface first.
- **The composer must never auto-send.** Non-negotiable.
- Reduced motion, keyboard path, and screen-reader announcement for an async result appearing.

---

## 8. Question 3 — the highest-ROI ordering

Rank the work by (operator value ÷ blast radius), and be willing to say that something visually
appealing is not worth doing. Our prior, for you to confirm or overturn:

| # | Change | Why we think it ranks here |
|---|---|---|
| 1 | Mount the existing suggestion lane + bridge it into the composer | ~85% built, zero consumers; days of value for hours of work |
| 2 | Kill the bubbles → ledger thread | the single biggest "this is not premium" signal, and it is contained to one component |
| 3 | Block-markdown rendering | a visible defect in customer-facing content; small, bounded |
| 4 | Customer identity in the middle | the missing half of the job-to-be-done |
| 5 | Paste → decode → draft (the vision loop) | the differentiator, but it depends on 1 and 4 landing first |
| 6 | Label the Connections chips; make the rail earn 420px | cheap clarity win |
| 7 | Composer honesty (mode ↔ label ↔ colour) | small, but it is currently lying at rest |

---

## 9. Question 4 — the source-of-truth documents to upgrade

**These files are law in this repo, not documentation.** Agents read them and compose from them; a
rule that describes code which does not exist is worse than no rule (we shipped exactly that mistake
on 2026-08-02 and had to demote a whole section back to a plan). Ship exact text.

| Document | What must change |
|---|---|
| `.claude/rules/display/workbench-service.md` | The thread's new anatomy. The AI's placement and its **entry test** ("if it is the work it belongs in the middle" — apply it to *suggests* vs *sends*). The vision loop's home. The `AI suggestions is ABSENT` note must be replaced with the real ruling |
| `.claude/rules/source-of-truth.md` | New rows: **support reply drafting** (one waist), **image understanding** (one provider resolution), **decode → our-data cross-reference** (`routeScan` + `hybridSearch`, never a second matcher). Reaffirm: no second token home, no second search engine |
| `.claude/rules/ui-design-system.md` | A **conversation/message-row anatomy** section — there is currently no house law for a message, which is exactly why a chat template filled the gap. Rules for tone-as-information, day banding, attachment handling, and the block-markdown grammar boundary |
| `.claude/rules/display/reference-timeline.md` | If the thread merges message + event streams (option C), state whether `EventTimeline` is the renderer or whether a sibling is justified — and if a sibling, why it is not the second timeline the doc bans |
| `.claude/rules/backend-patterns.md` | The AI-generation route pattern: generation ≠ mutation (no audit row), per-org rate limit, provider resolution, DI'd domain fn, and the required-not-defaulted safety parameter for anything that decides *what a customer sees* |
| `.claude/rules/kinetic-ledger.md` | If a genuinely new surface archetype is warranted (an assistive/agentic panel), it must be argued here or explicitly declined. **Our prior is decline** — five laws and four contracts are enough |

For each: give the **exact replacement prose**, in the house voice (decision tables over essays,
paired do/don't, the *why* preserved so the next agent cannot undo it by accident).

---

## 10. What we want back

1. **Rulings** on §6, §7, §8, §9 — decisions with the reasoning that forecloses the alternatives.
2. **A component-level design** for the new thread + the assist surface: anatomy, states (loading /
   empty-absence / empty-no-match / degraded / error), density behaviour at 1280 / 1440 / 1920 with
   the 420px rail open, and the exact house primitives to compose.
3. **A phased execution plan** with blast radius per phase, the guard that pins each phase, and an
   explicit list of what is *deliberately not* in scope.
4. **The migration + API contracts** for the vision loop (expand → code → contract; the migration
   lands first).
5. **The SoT diffs** from §9, as final prose.
6. **A named list of what you rejected and why.** We are as interested in the foreclosed options as
   the chosen one — that is what stops the next agent re-litigating it.

### Anti-goals — do not propose these

- A fifth region contract, or a `SupportContract` / per-domain contract.
- Dark mode with glowing accents, gradient text, glassmorphism, purple→blue gradients, hero-metric
  layouts, identical card grids, sparklines-as-decoration, or a display/heading font beside the
  three cuts. These are on the house ban list *and* they are the AI-slop fingerprints this upgrade
  exists to escape.
- A second search engine, a second audit path, a second token home, a second timeline component, a
  second composer, or a second right-edge grammar.
- Anything that auto-sends to a customer.
- Raising a ratchet baseline to make a gate pass.

---

## 11. Appendix — the full design critique (evidence for §5)

**Anti-patterns verdict: FAIL, on the second-order tells rather than the first-order ones.**
Palette, tokens, spacing scale, focus rings and motion roles are disciplined and would pass most
reviews. What fails is *conception*: the chat-widget template, uniform accent fills carrying no
information, per-row redundancy, card-in-card nesting, generic empty and loading states, and a
visible markdown defect in customer-facing content.

**What is working and must be preserved:**

- The **right-rail push geometry** is genuinely well-built — measured `push`, zero overlap, width
  taken from the left before the work surface, resize + collapse, one owner. Most products get this
  wrong and ship a floating panel that covers the row it describes.
- The **`density="icon"` display switcher** is the right call for a 420px column: only the selected
  display names itself, every idle cell keeps its label as tooltip *and* accessible name.
- **Token discipline**: no page-local hex, no raw z-index, no hand-rolled focus rings, one motion
  import path, a 600 weight ceiling with the 700 cut deliberately not loaded.

**Minor observations:** the composer's green primary is uncoordinated with the surface accent; the
`SUPPORT CONTEXT / #9604` rail eyebrow spends two lines saying what the middle already says; the
Conversations display re-renders a linkage strip that duplicates the Connections display; relative
timestamps only ("2 days ago") with no absolute value on hover or in a day band.

**Questions worth sitting with:**

- What would this look like if it were designed for someone holding a **physical unit** while typing?
- If the agent could only see **three facts** before replying, which three?
- What does the surface do when the AI is **confidently wrong** — and does the design make that
  cheap to catch, or expensive?
- Is a "conversation" even the right primary object here, or is it **the unit**, with the
  conversation as one of its streams?

---

## 12. Ground rules for whoever executes the ruling

- Attach to `:3050`; never start, restart, or kill the dev server. A broken dev server is a thing you
  report, not a thing you repair.
- Stage only your own files. Never `git add -A`, never `git stash`. Several sessions edit this repo
  concurrently — before assuming a red gate is yours, `git status --porcelain` the failing path.
- `npm run verify` before done. **Never raise a ratchet baseline to make it pass.**
- E2E asserts against the **QA org** (`qa-desktop` project, `QA_FIXTURE_*` constants), not the
  dogfood tenant — except where the spec exists *because of* production-shaped data, which must be
  said in the spec header.
- Measure claims in the real runner. A screenshot cannot tell "pushed" from "covered"; geometry can.
