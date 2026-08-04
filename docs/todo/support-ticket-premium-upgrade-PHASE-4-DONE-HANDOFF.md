# Handoff — Support ticket premium upgrade: what is left

**Surface:** `/support?ticket=<id>` — Workbench branch `service-workspace`
**State:** Phases 1–4 **and** item D landed. `npm run verify` green on all ten gates.
**Lane:** current checkout, no ad-hoc branch. Attach to `:3050` — never start it.
**Nothing in this initiative is committed. Stage only your own files; never `git add -A`, never `git stash`.**

Three items remain. They are independent — take one, finish it, stop.

---

## A · Prove the vision loop against a real label — **Opus 5, medium**

The paste → stage → extract → **decode → match** → draft loop is built and unit-proven. Everything
downstream of OCR has **never fired against a real printed label**, because the environment was down:

- `photo_analysis` for the test photo (3762) read `model: "catalog-fallback"`, `ocr_text: []` —
  the local-vision box was unreachable, so `analyzePhoto` degraded as designed and the token pass ran
  with **zero tokens**.
- Hermes was down too, so **no draft has ever been generated**.

**Do:** bring up the local-vision box and the gateway, paste a photo of a real carton label on an open
ticket, and read what comes back. Check these in order — a failure at any one is a real finding, not a
config problem:

1. `photo_analysis.model` is `local-vision`, not `catalog-fallback`.
2. `ocr_text` carries the handle you printed.
3. `extractEvidenceTokens` keeps it (must contain a digit, no spaces).
4. `routeScan` normalizes a printed URL to its handle — the Assist chip shows the **handle**, not the URL.
5. The match lands in *Matched in our records* as a real link.
6. An identifier matching nothing renders the amber "nothing in our records matched" line and caps
   confidence at `low`. **That line is the whole honesty of this feature** — confirm it fires.

**If the vision box cannot be brought up, say so and stop.** Do not "verify" it by reading the unit
tests back.

---

## B · QA-org E2E spec — **Opus 5, high**

`verify.md` is explicit: **E2E asserts against the QA org**, never the dogfood tenant. The paste probe
run during Phase 4 was a deliberate dogfood throwaway and was deleted.

**The real work is the fixture, not the spec.** `/api/support/suggest` 503s at the helpdesk-connected
gate, so a QA-org spec needs a **connected helpdesk and a seeded ticket** — otherwise it passes
vacuously on the 503 and proves nothing. Extend `qa-org.ts` + `scripts/provision-qa-org.ts`.

The assertion worth having is the **contract, not the draft**: the request body carries
`stagedPhotoIds` and **no URL, ever**.

Probe hooks:

```
[data-testid="support-merged-stream"]  [data-stream-row]  [data-internal="true"]
[aria-label*="support context" i]      ← the rail; 420px when pushed
```

---

## C · Vision-lane settings card — **Sonnet 5, high**

`organizations.settings.support.visionLane` is settable only by DB or `SUPPORT_VISION_LANE` today, so a
tenant who wants cloud vision cannot turn it on. Nothing is broken — local-first means the default is
correct — but the switch has no home.

Settings → Organization, beside `Gs1ComplianceCard`. `resolveSupportVisionLane` is already pure and
tested; the card is a `PATCH /api/admin/organization/settings` over two values.

**Keep the resolver as the only place the precedence lives.** A card that re-implements "org wins over
env" is a second answer to one question.

---

## Ground rules for all three

- **Do not use a workflow or subagents** unless the user asks. Each item is small and sequential.
- **Do not rebuild Phases 1–4.** The execution prompts
  ([`…-CLAUDE-CODE-PROMPT.md`](./support-ticket-premium-upgrade-CLAUDE-CODE-PROMPT.md),
  [`…-PHASE-2-4-HANDOFF.md`](./support-ticket-premium-upgrade-PHASE-2-4-HANDOFF.md)) describe work that
  is **done** — reading them is the fastest way to rebuild something.
- **Import types from `suggest-reply-core.ts`**, not from `suggest-reply.ts` (which carries
  `server-only`). Re-exporting them was dead code and knip said so.
- **A type exported ahead of its consumer fails the knip gate.** Un-export it rather than refreshing
  the baseline.
