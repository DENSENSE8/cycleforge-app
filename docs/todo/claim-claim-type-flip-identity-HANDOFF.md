# Handoff — Claim type flip must not rewrite Platform / subject identity

**Surface:** Unbox Ticket Displays → Claim compose (`ReceivingClaimPanel` / `ClaimComposeStep`)  
**Opened:** 2026-08-11  
**Related (partially shipped):** empty-seed Create microcopy; Ticket-over-Classify on unfound recent click; claim-type subject segment patch (`replaceClaimSubjectClaimTypeSegment`)

---

## Paste this into a new session

> Read `docs/todo/claim-claim-type-flip-identity-HANDOFF.md`.
>
> Job: Flipping the **Claim** combobox (Damage / Missing / Return / Unfound / …) must update **only** the claim-type segment of Subject + Body `Issue:` line. It must **not** change the Platform or Type combobox values, and must **not** rewrite the Subject identity (first `//` segment) to Return / a platform name / anything else derived from claim type.
>
> Same bug class as “Claim → Damage flipped Subject to Return”. Operators still see Platform (or Subject identity) jump when they flip Claim to other values. `npm run verify` before done.

---

## What is wrong today

Compose order is **Platform → Type → Claim → Subject → Body**.

Changing **Claim** triggers `/api/receiving/zendesk-claim/preview` (dep on `claimType` in `useClaimTemplate`). That path used to replace the **entire** Subject from the server template, which rebuilds identity via `resolveClaimSubjectIdentity({ isReturn: carton.is_return, …, claimTypeLabel })`. Stale carton `is_return` / RETURN type then painted **Return** (or another identity) even when Platform/Type showed Unfound / PO.

A partial fix landed in this session:

- `replaceClaimSubjectClaimTypeSegment` in `src/lib/zendesk-claim-subject-identity.ts`
- On claim-type-only preview refresh, swap only the claim segment when Subject is already structured
- Then **`patchSubjectIdentityFromState()` still runs** after every preview (including claim flips)

That last step is likely still wrong: `patchSubjectIdentityFromState` → `resolveClaimSubjectIdentity` **reads `claimTypeLabel`**. For claim **Return**, the SoT deliberately collapses identity to platform-only (`Amazon` / `eBay (DH)` / …) to avoid `Return // Return`. So flipping Claim → Return (or other values that hit claimTypeLabel branches) **rewrites the identity segment** — operators experience this as “Platform changed” even when the Platform combobox value is untouched.

Also verify the Platform **combobox** itself does not change (`useSourcePlatform` / `receiving-package-updated`). If the face moves without a PATCH, it’s Subject identity; if the select value moves, find the writer (must not be claim-type flip).

---

## Required UX

| Action | Allowed | Forbidden |
|---|---|---|
| Flip Claim Damage ↔ Missing ↔ Unfound ↔ Return ↔ … | Subject claim segment + Body `Issue:` | Platform select value, Type select value, Subject identity (first segment) |
| Change Platform / Type | Subject identity segment (existing `applyCartonIdentity`) | Full template refetch / claim segment wipe |
| Reset to template | Full Subject + Body from preview | — |

Concrete:

- `Unfound - Purchase order // Unfound — no PO match // TRK#…` → Claim **Damage**  
  → `Unfound - Purchase order // Damage // TRK#…`  
  (identity unchanged)

- Same → Claim **Return**  
  → `Unfound - Purchase order // Return // TRK#…`  
  (**not** `Amazon // Return // …` or `Return // Return // …` from claimTypeLabel dedup)

Platform combobox stays on whatever it was (including empty Unfound).

---

## Implementation sketch

| Piece | Where |
|---|---|
| Claim-only subject patch | `replaceClaimSubjectClaimTypeSegment` (exists) + `useClaimTemplate` preview effect |
| Stop identity rewrite on claim flip | On `claimTypeOnly`, **do not** call `patchSubjectIdentityFromState()` after the claim-segment swap |
| Initial / reset / open preview | Full `data.subject` still OK; optional post-pass identity sync **only** when not claimTypeOnly (and only from Platform/Type seed — not claimTypeLabel-driven collapse) |
| Body | Preview may still refresh Body on claim flip (`Issue: …`) — fine |
| Platform/Type writers | `ClaimComposeStep` onChange → `applyCartonIdentity` + save — must stay Claim-flip free |
| Guard / unit | Assert claim flip: identity segment stable; Platform/Type aria values unchanged in compose source (no `setSourcePlatform` / `savePlatform` on claim path) |

Likely one-line root: remove or gate `patchSubjectIdentityFromState()` so it never runs on the claim-type-only branch.

---

## Non-goals

- Reordering Platform / Type / Claim / Subject (already Platform → Type → Claim → Subject → Body)
- Empty-seed Create helper microcopy
- Ticket-over-Classify cockpit race (already fixed separately)
- Changing `resolveClaimSubjectIdentity` Return-dedup for **initial** template build (server preview) — only stop using that path on **client claim flips**

---

## Verify

- Unit: `replaceClaimSubjectClaimTypeSegment` keeps identity for every `CLAIM_TYPE_LABEL` value
- Unit / hook: claimType-only preview path does not call identity patch (or identity string before/after claim flip is equal except segment 2)
- Manual: Unfound carton → Claim compose → flip Claim through Damage / Missing / Return / Unfound — Platform and Type faces stay put; Subject first segment stays put; only middle segment + Body Issue change
- `npm run verify`

---

## Key files

- `src/components/receiving/workspace/claim/hooks/useClaimTemplate.ts` — preview effect / `claimTypeOnly` / `patchSubjectIdentityFromState`
- `src/lib/zendesk-claim-subject-identity.ts` — `replaceClaimSubjectClaimTypeSegment`, `resolveClaimSubjectIdentity` (claimTypeLabel branches)
- `src/components/receiving/workspace/claim/components/ClaimComposeStep.tsx` — Platform / Type / Claim selects
- `src/lib/zendesk-claim-subject-identity.test.ts`

---

## Already shipped (do not redo)

- Empty-seed → Create helper chips (`ClaimEmptySeedCreateHelper`)
- Ticket wins over Classify on unfound recent open (cockpit + `resolveUnboxTicketContextOpen`)
- Compose field order Platform → Type → Claim → Subject → Body; label **Claim** (not Claim type)
- `replaceClaimSubjectClaimTypeSegment` helper + tests
