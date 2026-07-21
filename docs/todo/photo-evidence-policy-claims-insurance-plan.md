# Plan 5 — Photo policy gates + claims insurance (WS-PHOTO)

> **Status:** Planned · 2026-07-20  
> **Parent:** [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md)  
> **Depends on:** Plans 1–2 (correct stage writes); Plan 4 optional for dispute compare  
> **Feeds:** [`unbox-receive-ux-improvement-plan.md`](./unbox-receive-ux-improvement-plan.md) readiness / guided trays

## Verdict

`receiving.photoPolicy` is registered (`optional | require_one | require_per_item`) but **never enforced**. Wire it as **station completion insurance**, align claim attachment with line-first evidence, and reserve `link_role` (`claim_evidence` / `insurance_share`) for the dispute path — without making catalog SKU the primary claim anchor.

## Verified gaps

| Gap | Evidence |
|---|---|
| Policy unused | `getReceivingPhotoPolicy` — zero production call sites |
| Docs claim mark-received | `docs/settings-registry.md` lists decision point; route has **no** checks |
| Claim anchor prefers line | `pickTicketLinkAnchor` / `claim-link.ts` — good |
| Capture often carton | Desktop button undercuts line preference |
| `insurance_share` role | In `PHOTO_LINK_ROLES` — sparsely used vs `claim_evidence` |

## What ships

### 1. Policy evaluation SoT

`src/lib/receiving/photo-policy.ts` (new, pure + Deps for DB):

```ts
evaluateReceivingPhotoPolicy({
  policy: ReceivingPhotoPolicy;
  cartonPhotoCounts: { package: number; unboxCarton: number };
  linePhotoCounts: Array<{ lineId: number; sku: string | null; itemCount: number }>;
}): { ok: boolean; blockers: string[] }
```

Semantics:

| Policy | Gate |
|---|---|
| `optional` | always ok |
| `require_one` | ≥1 **arrival package** photo on carton (unbox item alone does not satisfy) |
| `require_per_item` | every non-cancelled line has ≥1 **`receiving_item`** on `RECEIVING_LINE` |

Counts must use Plan 1 filters (entity + type), not blob “any photo on carton.”

### 2. Enforcement points

| Gate | Action when fail |
|---|---|
| Unbox Receive / mark-received | 409 + structured blockers; UI shows amber reason (mirror `combinedReviewDisabledReason`) |
| Optional: triage “done” / dock complete | only if product wants package required before unbox — default **off** |

Wire `getReceivingPhotoPolicy(org.settings)` in:

- `src/app/api/receiving/mark-received/route.ts`
- Unbox client readiness (`useUnboxLineController` / receive bar) for preflight UX

Update `docs/settings-registry.md` — remove “deferred” for this key once shipped.

### 3. Per-line readiness chrome

Surfaces (compose existing readiness ideas from unbox UX plan):

- Line row: camera chip = **item** count; carton header = package / unbox-carton counts.
- Receive disabled reason: `"3 lines need item photos"` with SKU list truncated.

### 4. Claims / Zendesk insurance path

Keep line-first ticket anchor. Harden:

1. Claim photo picker default filter = `unbox_item` (+ optional arrival package for outer damage claims).
2. `linkReceivingPhotoToClaim` — already dual-links `ZENDESK_TICKET` + `claim_evidence`; ensure item photos preferred in selection UI.
3. Filenames already PO-named in claim route — append SKU / stage when available.
4. Document when to use `insurance_share` (carrier/share packs) vs `claim_evidence` (Zendesk) — avoid free-text roles.

### 5. Serial dual-link on receive (optional, same plan if cheap)

When mark-received / scan-serial creates `SERIAL_UNIT` from a line that already has item photos:

- Either journey inheritance via provenance only (Plan 4 — **preferred**), **or**
- Explicit `linkPhoto` each item photo → `SERIAL_UNIT` for faster unit-list queries.

Prefer provenance join first; dual-link only if unit photo list queries stay slow.

### 6. Guided trays (phase B — can split)

From unbox UX plan §6: grade ≤ B ⇒ required defect slot. Implement after policy gates exist — trays call the same evaluator.

### 7. Tests

- Pure policy matrix unit tests.
- mark-received 409 when `require_per_item` and a line has zero item photos (Deps-injected).
- Claim picker e2e: prefers line-scoped photos when present.

## Explicitly NOT in this plan

| Cut | Why |
|---|---|
| Stage vocabulary | Plan 1 |
| Capture UX | Plan 2 |
| Library SKU tiles | Plan 3 |
| Full journey media | Plan 4 |
| Carrier API insurance filing | Integrations lane |

## Done when

- [ ] Org setting `require_one` / `require_per_item` actually blocks receive with clear blockers.
- [ ] UI preflight matches server.
- [ ] Claim flow defaults to line item evidence; package selectable for outer damage.
- [ ] Settings docs match reality.
- [ ] Verify green.

## Key files

- `src/lib/settings/registry.ts`, `accessors.ts`
- `src/lib/receiving/photo-policy.ts` *(new)*
- `src/app/api/receiving/mark-received/route.ts`
- `src/components/receiving/workspace/line-edit/hooks/useUnboxLineController.ts`
- `src/lib/photos/claim-link.ts`
- `src/components/receiving/workspace/claim/components/ClaimPhotoPicker.tsx`
- `src/app/api/receiving/zendesk-claim/route.ts`
- `docs/settings-registry.md`
