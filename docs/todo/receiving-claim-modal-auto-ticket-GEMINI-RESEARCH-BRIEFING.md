# Research briefing — auto-ticket creation from an operational record: is `ReceivingClaimModal` over-built?

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject surface:** `src/components/receiving/workspace/ReceivingClaimModal.tsx` and everything it composes — "File a claim," the flow that turns a receiving carton (damaged/missing/wrong-item/return/RTS) into a Zendesk support ticket, optionally with an AI-drafted subject/body and an AI-drafted marketplace-seller message.
**Status:** functionally correct (we just fixed a live bug in its subject-generation path), but the subsystem is large enough that we no longer have an easy one-sentence description of what it does. This brief asks whether that size is inherent to the job or self-inflicted.
**Deliverable:** (a) a benchmark of "auto-draft and file a support ticket from operational context" against named 2026 systems (helpdesk platforms, WMS/3PL claim tooling, RMA/returns platforms) and their app-embedding patterns (Zendesk Apps, Intercom, Freshdesk); (b) a defended verdict on the seven decisions in §7; (c) answers to §8 with sources.

---

## 0. How to use this brief

You do not have this codebase. Everything below is a literal inventory — file paths, line counts, route lists — taken from the running repository today, not estimates. Where something is inferred rather than measured it is labeled **(inferred — verify)**.

Three deliverables, kept separate:

1. **What is industry standard (2026)** for embedding "draft + file a ticket" inside an operational workflow screen (not a standalone helpdesk agent console). Name real systems and patterns — Zendesk/Freshdesk/Intercom "compose" APIs and app SDKs, WMS/3PL claims modules, RMA platforms (Loop, Narvar, AfterShip), and any published guidance on wizard-form complexity budgets. State the conditions under which each pattern wins.
2. **Take a side on each decision in §7.** Each states our current shape, the strongest case against it, and an admission where we think we already know the answer.
3. **Answer §8** with sources.

The reader is the engineer who will refactor this subsystem. Prefer a concrete target architecture and named trade-offs over a decision framework.

---

## 1. Product and vocabulary, briefly

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). A **receiving carton** is a physical inbound box tracked through Scanned → Unboxed → Received. When something is wrong with it (damage, missing units, wrong item, a customer return, carrier return-to-sender) or the operator wants to formalize a claim against a vendor/3PL/marketplace, they open **"File a claim"** from the Unbox bench. That modal is this brief's subject.

The modal talks to two different audiences depending on claim type:
- **Zendesk** (internal support ticket) — always, for any claim type.
- **A marketplace seller** (eBay, Amazon, etc.) — only for return-shaped claims, via a separately AI-drafted, link-stripped, plain-text message (marketplace TOS forbids links in seller messages).

There is also a **link mode**: instead of filing a new ticket, attach photos/evidence to an *existing* Zendesk ticket already open for this shipment.

---

## 2. The job, restated as a research question

Strip away this codebase's specific names and the task is a recognizable pattern:

> Given a structured operational record (what happened, to what, with what evidence), **auto-draft** a professional external communication (a support ticket, in one case also a customer/vendor-facing message), let a human **review and edit** it, then **file** it via an external system's API — while preserving every fact from the record (no hallucinated PO/tracking/quantity) and giving the human graceful degradation when the AI drafting step is unavailable.

This is exactly the shape of:
- A WMS/3PL "file a carrier claim" or "file a damage claim" workflow.
- A returns platform (Loop, Narvar, Happy Returns) auto-drafting an RMA communication.
- Zendesk/Freshdesk/Intercom's own "compose from context" / "AI-suggested reply" features, and their app-SDK equivalents when a third-party operational tool wants to create a ticket in the user's own helpdesk instance without the user leaving the operational screen.

**Named research target:** how do 2026-era systems in each of those three categories structure this feature — as a modal wizard embedded in the operational screen, a side panel, a one-shot API call with a toast, or a hand-off to the helpdesk's own compose UI (deep link / iframe / app SDK)? What is the typical **step count** and **state surface** for the ones that keep it in-app?

---

## 3. What shipped — measured anatomy

### 3.1 Client-side inventory

```
src/components/receiving/workspace/ReceivingClaimModal.tsx          128 lines  (thin composition shell)
src/components/receiving/workspace/claim/                          3618 lines across 27 files
  hooks/useReceivingClaimController.ts                               938 lines — the controller
  hooks/useClaimSellerMessage.ts                                     250 lines
  hooks/useClaimTemplate.ts                                          180 lines
  hooks/useClaimPhotos.ts                                            117 lines
  hooks/useClaimTicketReply.ts                                        87 lines
  hooks/useClaimTicketSearch.ts (+ .test.ts)                          64 + 34 lines
  components/ClaimTemplateEditor.tsx                                 294 lines
  components/ClaimPhotoPicker.tsx                                    256 lines
  components/ClaimTicketReply.tsx                                    201 lines
  components/ClaimModalFooter.tsx                                    187 lines
  components/ClaimReviewStep.tsx                                     138 lines
  components/ClaimNasBackupCard.tsx                                  131 lines
  claim-types.ts                                                     140 lines
  … + 14 more step/field components (10–97 lines each)
────────────────────────────────────────────────────────────────────────────
TOTAL client surface for one "file a claim" modal:                 ~3746 lines / 28 files
```

`useReceivingClaimController.ts` alone composes **six** sub-hooks and owns **~24 independent `useState` calls**, including five separate booleans tracking one linking lifecycle (`linking`, `unlinking`, `linkCommitted`, `linkUpdating`, `linkUpdatePosted`) and a parallel set for a built-in dry-run/test mode (`isDryRun`, `testCreating`, `testResult`, `testSellerLoading`, `testSellerPreview`) that lives in the production controller rather than a separate harness.

### 3.2 Two wizards, sharing most of their steps

```
CreateClaimStep = 'photos' | 'compose' | 'review' | 'confirm' | 'seller'   (5 steps)
LinkClaimStep   = 'find' | 'photos' | 'compose' | 'review' | 'linked' | 'seller'  (6 steps)
```

`ClaimConfirmStep` (create-mode step 4) and `ClaimLinkedStep` (link-mode step 5) are near-duplicates by the components' own doc-comments — `ClaimLinkedStep`'s header literally says *"Mirrors the create 'Filed' confirmation."* Both render a success banner + the same `ClaimNasBackupCard`. `ClaimPhotosStep`, `ClaimComposeStep`, `ClaimReviewStep`, and `ClaimSellerStep` are **the same component instances**, reused verbatim by both wizards. `ReceivingClaimModal.tsx`'s step-body renderer is one 25-line nested-ternary switching on `mode` × `step` to route between them.

### 3.3 Server-side inventory — ten route files under one prefix

```
src/app/api/receiving/zendesk-claim/
  route.ts              435 lines  — POST: create the ticket for real (Zendesk REST via a helpdesk-capability facade)
  archive-only/route.ts 257 lines  — POST: NAS/local photo backup, independent of ticket filing
  assist/route.ts        302 lines — POST: LLM rewrite of {subject, description, seller_message} — raw chat-completions + regex JSON extraction, its OWN fact-guard
  draft/route.ts         105 lines — POST: LLM rewrite of {subject, description} — forced-tool-call (hermesToolCall), a DIFFERENT fact-guard
  assist-seller/route.ts 100 lines — POST: LLM draft of the seller-facing message only
  seller-message/route.ts 146 lines — GET/PUT/DELETE: persistence for the drafted seller message
  classify/route.ts       41 lines  — POST: LLM suggests claimType + severity from the operator's note
  preview/route.ts        51 lines  — POST: the deterministic (non-AI) template — the ONLY one actually wired into the default UI flow today
  link/route.ts          137 lines  — POST/DELETE: attach/detach an existing ticket
  thread/route.ts        201 lines  — GET: read an existing ticket's comment history
────────────────────────────────────────────────────────────────────────
TOTAL:                  1775 lines / 10 route files (+ link-request.ts helper + its test)
```

**Three of these routes independently solve "have the model rewrite ticket text": `/classify`, `/draft`, `/assist`.** `/draft` and `/assist` overlap almost entirely (both rewrite subject+description; `/assist` additionally drafts the seller message and uses a different LLM-calling convention — raw `fetch` + regex-extracted JSON — than `/draft`'s forced-tool-call `hermesToolCall` helper, which is this codebase's own documented "route every LLM call through here" chokepoint). **Neither `/draft` nor `/assist` is actually called by the default modal flow** — `useClaimTemplate.ts` (the hook that feeds the visible Subject/Description fields) only calls `/preview`, the deterministic template. The AI-drafting routes appear to be either dead code, wired into a rarely-used path we didn't find, or an unfinished migration.

**Total for one modal: ~5500 lines across 38 files**, filing one kind of external ticket.

---

## 4. The self-indictment

1. **Two wizards for one job, sharing 4 of 5–6 steps, expressed as a hand-written mode×step matrix.** The delta between "create" and "link" is: where you start (Find, only in link mode) and how the "success" step is labeled (Confirm vs Linked — same content). That is a small, well-defined difference currently paid for with two enum types, two step-order arrays, two `*StepStates` functions, and a 25-line nested ternary.
2. **Three LLM-drafting endpoints for two jobs** (rewrite ticket text; suggest claim type). `/draft` and `/assist` are the clearest duplicate — same input shape (template + operator note), same output shape (subject + description), different HTTP-calling convention, different fact-guard logic, and (per our reading of the current call sites) **neither is wired up**, while a third, wholly separate concern (drafting a marketplace seller message) is split across yet another two routes (`assist-seller` for drafting, `seller-message` for CRUD persistence).
3. **A 938-line controller hook is the actual state machine, expressed as 24 independent `useState` calls rather than a modeled state machine.** Five booleans track one link lifecycle (idle → linking → linked → (optionally) updating → posted) that is a five-state sequence, not five independent flags — every consumer has to know the *legal combinations* by convention, not by type.
4. **A dry-run/test harness lives inside the production controller** (`isDryRun`, `testCreating`, `testResult`, `testSellerLoading`, `testSellerPreview`) rather than being a separate tool, adding surface area every real-path change has to route around.
5. **A local-NAS backup side-quest (`archive-only`, `ClaimNasBackupCard`, 257 + 131 lines) is embedded inside the ticket-filing flow** rather than being a decoupled post-ticket side-effect — the modal's job description grew to include "and also back up these photos to a file share," which is a different concern (evidence retention) riding along with ticket creation (external communication).
6. **The instinct to add a new drafting endpoint per new AI-assist idea (`classify`, `draft`, `assist`, `assist-seller`) rather than parameterizing one endpoint** is a visible pattern across four routes, three of which (`draft`/`assist`/`assist-seller`) are really "ask the model to produce field X from context Y, with a fact-guard," which is one job, done three times.

---

## 5. The tension that produced this, and whether it's the real root cause

The honest defense of the current shape: **this genuinely is two audiences (internal Zendesk ticket, external marketplace seller) and two entry points (new ticket, existing ticket)**, and each of those legitimately needs review-before-send because the AI can be wrong and the record's authoritative facts (PO#, tracking#, quantities) must never be silently altered — which is why every drafting route carries its own "did the rewrite keep the PO/tracking reference intact, else fall back to the deterministic template" guard.

The question this brief most wants answered:

> **Is the five/six-step wizard-with-AI-assist-and-human-review the right shape for this job at all**, or is that itself an over-adaptation of a general-purpose support-ticket composer pattern onto what is, from the operator's chair, a single decision ("this carton has a problem, tell someone")? Named helpdesk platforms have spent years on "compose with AI, human reviews before send" — what do THEY converge on for step count, and do any of them solve "keep the authoritative facts locked while letting prose be rewritten" with something more specific than a full-text substring check (which is what this codebase's fact-guards currently do — checking `description.includes(poRef)`)?

A second, narrower question: given the two near-identical wizards (§3.2, §4.1), is there a name for this exact refactor in wizard-UI literature — "parameterize a wizard by entry point, not by duplicating steps" — and a known trap in doing so (e.g., step components silently accumulating mode-conditional branches until they're worse than two wizards would have been)?

---

## 6. Shapes not taken

| Shape | Argument for | Argument against |
|---|---|---|
| **A. One wizard, `startStep` param** (collapse create/link into one `ClaimWizard` that begins at `find` only when `mode==='link'`, and unifies Confirm/Linked into one `ClaimFiledStep({ mode })`) | Deletes ~150–250 lines of duplicated step-order/state-machine bookkeeping; one place to add a step | The two flows' footers/CTAs already differ per-step (`ClaimModalFooter.tsx` is 187 lines of per-step button logic) — unifying the wizard doesn't remove that complexity, just relocates it |
| **B. One `/api/receiving/zendesk-claim/draft` endpoint, parameterized by `fields: ('subject'\|'description'\|'seller_message')[]`** | One LLM-calling convention (the codebase already has a documented "route every call through `hermesToolCall`" rule that `/assist` violates), one fact-guard implementation | Seller-message drafting has a materially different system prompt (link-stripping, different tone) — worth checking whether that's a *prompt* difference (fine to parameterize) or a *pipeline* difference (isn't) |
| **C. A modeled link-lifecycle state** (`'idle' \| 'linking' \| 'linked' \| 'updating' \| 'posted'` instead of 5 booleans) | Makes illegal states unrepresentable; every consumer switches on one value | Any state-machine library (XState etc.) is a new dependency for a 938-line hook that otherwise has none |
| **D. Decouple NAS backup as a post-filing side-effect** (fire-and-forget after ticket creation succeeds, own small hook, own tiny UI affordance, not a wizard step) | Ticket-filing and evidence-retention are different jobs with different failure tolerances (a failed backup shouldn't block or complicate "did the ticket file?") | Today's `ClaimNasBackupCard` shows partial-failure + manual retry inline — decoupling has to preserve that recoverability, not just move it off-screen |
| **E. Helpdesk-native compose (Zendesk/Freshdesk "create ticket" deep link or app-SDK panel)** instead of an in-app modal that calls a REST create endpoint directly | Offloads the "keep facts straight while letting prose be rewritten" problem entirely to the vendor's own compose UI, which the operator may already know from other tools | Loses the deterministic-template guarantee (no ticket without the record's structured facts), loses the "review in our UI, without a context switch" property, and loses in-house control over the seller-message flow (which isn't a Zendesk concept) |

---

## 7. The seven decisions — take a side on each

### D1 — Should create-mode and link-mode be one wizard or two?
**Current:** two `*ClaimStep` enums, two step-order arrays, two `*StepStates` functions, a 25-line nested ternary router, and two near-identical "success" step components.
**Proposed:** one wizard type, `find` step conditionally first, one `ClaimFiledStep({ mode: 'created' | 'linked' })`.
**Counter:** the two flows' state transitions (what "advance" and "back" mean, what triggers auto-advance) already differ enough that today's split may be honest about that divergence rather than artificial.

### D2 — Should the three "model rewrites ticket text" endpoints (`classify`, `draft`, `assist`) collapse into one?
**Current:** three routes, two different LLM-calling conventions, two different fact-guard implementations, and (per our reading) two of the three (`draft`, `assist`) apparently unwired from the live UI.
**Proposed:** one parameterized "assist" endpoint through the one documented `hermesToolCall` chokepoint; delete whichever of `draft`/`assist` isn't (or shouldn't be) live.
**Counter:** `classify` (suggest claim type from free text) and `draft`/`assist` (rewrite given fields) are arguably different jobs (classification vs. generation) that only *look* similar because they share an LLM.

### D3 — Is the 24-`useState` controller hiding state machines that should be modeled?
**Current:** 5 booleans for the link lifecycle, 5 more for a dry-run/test path, all as independent flags.
**Proposed:** two small discriminated-union states (`linkState`, `testState`) replacing 10 booleans.
**Counter:** this repo has zero state-machine library dependencies today; introducing one for a single 938-line hook may not be worth the new concept for the team versus a lighter hand-rolled reducer.

### D4 — Does the production controller need to carry its own dry-run/test harness?
**Current:** `isDryRun`/`testCreating`/`testResult`/`testSellerLoading`/`testSellerPreview` live inside `useReceivingClaimController.ts`.
**Proposed:** extract to a separate, explicitly-labeled test/QA harness (or delete if unused in production).
**Counter:** if operators actually use a "test this before really filing" affordance in the live UI, it's a real feature, not test scaffolding, and deserves to stay — verify usage before moving it.

### D5 — Should NAS photo backup be a wizard step or a decoupled side-effect?
**Current:** `archive-only` + `ClaimNasBackupCard` are reachable from within the Confirm/Linked wizard steps.
**Proposed:** fire automatically after ticket creation succeeds, surfaced as a dismissible status chip rather than a full step/card.
**Counter:** it currently supports manual retry on partial failure inline in the step — a chip may under-serve that recovery path.

### D6 — Is "keep the PO/tracking string present via `.includes()`" an adequate fact-guard for AI-rewritten ticket text at scale?
**Current:** both `/draft` and `/assist` (independently) check `description.includes(poRef)` / `includes(trackingRef)` and fall back to the deterministic template on failure.
**Proposed:** a single, tested "fact-guard" utility (list of required tokens in, boolean out) shared by any future drafting endpoint.
**Counter:** the current approach already works and is simple; a shared utility is only worth it if a second real (not just theoretical) consumer exists.

### D7 — Is an in-app modal the right shape at all, versus handing off to the helpdesk's native compose UI?
**Current:** a full custom wizard that calls the Zendesk REST API directly through a capability facade.
**Proposed (to be argued by the research):** name systems that instead deep-link or embed the vendor's own ticket-compose UI for this exact "create from operational context" job, and state what they give up / gain by doing so.
**Counter:** doing so would break the deterministic-template fact guarantee and the in-house seller-message flow, both of which are Cycle-Forge-specific, not Zendesk concepts.

---

## 8. Open research questions

1. **Step-count norms.** For "auto-draft + human-review + file an external ticket" flows in named 2026 operational tools (WMS/3PL claims, RMA platforms, helpdesk app-SDK integrations): typical step count, and where the line is between "wizard" and "single form with an AI-fill button."
2. **Fact-preservation techniques.** Beyond substring-matching required tokens, what techniques do production systems use to let an LLM rewrite prose while guaranteeing specific structured fields (order #, tracking #, quantities) survive verbatim? (Structured-output schemas that separate "editable prose" fields from "locked fact" fields entirely, rather than free-text + a post-hoc check?)
3. **Dual-audience ticketing.** Named systems that draft two different outbound messages from one operational event (an internal support ticket AND an external customer/vendor/marketplace message) — do they share one drafting pipeline parameterized by audience, or maintain separate ones, and why?
4. **Wizard parameterization vs. duplication.** Is there published guidance (component-library docs, UI-pattern literature) on when to parameterize one wizard by entry point/mode versus maintaining two, and known failure modes of over-parameterizing?
5. **State-machine adoption threshold.** For a single ~900-line UI controller hook with two multi-step lifecycles (link status, a wizard's own step position), is there a recognized complexity threshold past which teams adopt a modeled state machine (XState-style) versus staying with `useState`/`useReducer`?
6. **Evidence-retention as a first-class side-effect.** In claims/RMA tooling, how is "also back up the photo evidence somewhere durable" typically modeled relative to the ticket-filing action itself — coupled step, decoupled async job, or a completely separate system the ticket just links to?
7. **Helpdesk-native vs. in-house compose.** For operational tools that must guarantee specific facts survive into the filed ticket, what fraction use the vendor's native ticket-creation UI (app SDK / deep link) versus a fully custom composer, and what tips the decision?

---

## 9. Constraints — treat as fixed

- **No new vendor dependency assumed** — any answer that requires adopting a state-machine library, a new helpdesk SDK, etc. should say so explicitly and weigh the cost, not assume it's free.
- **The deterministic template (`buildReceivingClaimTemplate` → `/preview`) is the trust floor** — whatever shape wins, a claim must always be fileable with zero AI involvement, with correct facts, exactly as today.
- **Capability-facade discipline holds** — Zendesk is reached only through `src/lib/integrations/helpdesk` (a swappable capability facade), never a direct vendor SDK import from a route or component. Any proposal must not bypass that.
- **Seller messages must stay link-free plain text** — a hard marketplace-TOS constraint already enforced by `sanitizeSellerMessage`; not up for debate.
- **Fact-preservation (no hallucinated PO/tracking/quantities) is non-negotiable** — the mechanism can change (D6); the guarantee cannot.
- **Multi-tenant, org-scoped throughout** — any proposal touching persistence (e.g. the seller-message CRUD) keeps `organization_id` scoping exactly as today.

---

## 10. What a good answer looks like

- A **named target architecture** for the client (wizard shape, state modeling) and server (route count and boundaries) sides, each with a concrete before/after file-count and line-count estimate.
- A **defended position on D1/D2/D7** — the three decisions that actually change how many files/routes exist — since together they determine whether this is a 20% trim or a genuine halving.
- **Named systems and standards**, with the conditions under which each pattern wins, not a generic "it depends."
- A **migration order** an engineer can execute incrementally (this modal is live and must keep working at every step) — e.g., "first delete the unwired `/draft` or `/assist` route, then merge the success steps, then merge the wizards, then model the link-state" — rather than a big-bang rewrite.

An answer that concludes "the current size is justified by genuine feature breadth, not accidental complexity" is acceptable **if defended against the specific duplications named in §4** (the two near-identical success steps; the three overlapping drafting routes; the 10-boolean state surface) — those are measured facts, not impressions, and a "keep as-is" verdict has to explain them, not wave at overall scope.

---

## Appendix A — file map

| Concern | Path |
|---|---|
| Modal shell (thin) | `src/components/receiving/workspace/ReceivingClaimModal.tsx` |
| Controller (938 lines, 6 sub-hooks, ~24 `useState`) | `src/components/receiving/workspace/claim/hooks/useReceivingClaimController.ts` |
| Step/type vocabulary | `src/components/receiving/workspace/claim/claim-types.ts` |
| Step components | `src/components/receiving/workspace/claim/components/Claim*Step.tsx` (Photos, Compose, Review, Confirm, Linked, Seller, LinkFind) |
| Deterministic template (trust floor) | `src/lib/zendesk-claim-template.ts` → `src/app/api/receiving/zendesk-claim/preview/route.ts` |
| Claim-subject identity (just fixed this session) | `src/lib/zendesk-claim-subject-identity.ts` |
| LLM rewrite #1 (forced tool-call, unwired?) | `src/lib/zendesk-claim-draft-llm.ts` → `.../draft/route.ts` |
| LLM rewrite #2 (raw fetch + regex JSON, unwired?) | `.../assist/route.ts` |
| LLM claim-type suggestion | `src/lib/zendesk-claim-classify-llm.ts` → `.../classify/route.ts` |
| Seller-message drafting + persistence | `.../assist-seller/route.ts`, `.../seller-message/route.ts`, `src/lib/receiving-claim-seller-message.ts` |
| Link-existing-ticket flow | `.../link/route.ts`, `.../thread/route.ts` |
| NAS backup side-quest | `.../archive-only/route.ts`, `src/components/receiving/workspace/claim/components/ClaimNasBackupCard.tsx` |
| Ticket creation (the actual Zendesk write) | `src/app/api/receiving/zendesk-claim/route.ts` (435 lines) |
| Local LLM gateway chokepoint ("Hermes") | `src/lib/ai/hermes-tool-call.ts`, `src/lib/ai/hermes-client.ts` |

## Appendix B — raw inventory (measured 2026-07-30)

```
Client:  28 files, ~3746 lines  (1 modal shell + 27 files under claim/)
Server:  10 route files (+1 helper +1 test), 1775 lines under api/receiving/zendesk-claim/
Controller: 938 lines, 6 composed hooks, ~24 useState calls
Wizards: create = 5 steps, link = 6 steps, 4 steps shared verbatim, 2 near-duplicate "success" steps
LLM-drafting routes: 4 (classify, draft, assist, assist-seller) — draft/assist overlap almost entirely
State-as-booleans: 5 for link lifecycle, 5 for dry-run/test path = 10 of ~24 useState calls
Grand total surface: ~5500 lines / 38 files for one "file a claim" modal
```
