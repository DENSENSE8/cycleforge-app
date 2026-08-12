# Handoff — claim Create microcopy after empty tracking seed

**Surface:** Unbox Ticket Displays → Claim (Create | Link) · shared `ReceivingClaimPanel`  
**Opened:** 2026-08-11  
**Status:** shipped (in-surface Create helper after empty tracking seed)  
**Depends on (already shipped):** tracking-seeded Link search + auto-flip to Create when 0 hits (`shouldAutoCreateFromEmptyTrackingSeed` in `useReceivingClaimController`)

---

## Paste this into a new session

> Read `docs/todo/claim-create-empty-tracking-microcopy-HANDOFF.md`.
>
> Job: When Link search seeded with carton tracking settles **empty** and the controller auto-switches to **Create**, replace/update the staff-facing microcopy so it explains **why** they are on Create — tracking was searched, no ticket found — not the Link-step “Pick the existing ticket…” helper.
>
> Do not invent a second search. Wire copy to the existing empty-seed flip. `npm run verify` before done.

---

## What is wrong today

After empty tracking seed → Create, staff still see (or remember) Link helper copy from [`ClaimLinkFindStep.tsx`](../../src/components/receiving/workspace/claim/components/ClaimLinkFindStep.tsx):

> Pick the existing ticket, then review the template body below and Link & send.  
> Photos and claim type stay on this same surface.

That copy is for **Link with hits**. On auto-Create it is misleading — search already ran and found nothing.

Today the only signal is a toast:

```ts
toast.info('No ticket matched this tracking — ready to create');
```

in [`useReceivingClaimController.ts`](../../src/components/receiving/workspace/claim/hooks/useReceivingClaimController.ts) (~empty-seed effect). Toast alone is easy to miss; in-surface copy must teach the flip.

---

## Required UX

When mode is **Create** because of empty tracking seed (not because the operator manually chose Create):

Show flush helper copy (same caption row grammar as Link’s helper — hairline top, `text-role-caption`, soft ink) that states, in plain ops language:

1. Tracking was searched (show last-8 / full tracking if short — prefer the same face the identity uses, not a raw dump if a chip helper exists; otherwise truncate sensibly).
2. **No ticket found** for that tracking.
3. Staff are on **Create** to file a new ticket (template / photos below still apply).

Suggested copy shape (tune for house voice; keep one short block):

> No ticket matched tracking `……76306` — create a new one. Review the template below and File.

Or two lines if needed:

> Searched tracking `……76306` — no matching ticket.  
> Create a new ticket below (photos and claim fields stay on this surface).

**Do not** keep “Pick the existing ticket… Link & send” on the Create surface after an empty-seed flip.

Operator who **manually** switches Create ↔ Link without an empty-seed flip keeps normal Create/Link helpers (no false “not found” story).

---

## Implementation sketch

| Piece | Where |
|---|---|
| Empty-seed flip + once-per-open guard | `claim-empty-seed-create.ts` + effect in `useReceivingClaimController` |
| Flag the flip for UI | Add e.g. `autoCreateFromEmptyTracking: boolean` (or `emptyTrackingSeedReason: string \| null`) on the controller; set `true` when flipping; clear on mode change / reopen |
| Create-surface helper | Mount near top of Create compose stack (after Create\|Link mode select, before Photos/Subject) — **not** inside `ClaimLinkFindStep` (that unmounts on Create) |
| Tracking face | `row.tracking_number` — last-8 if long; match TrackingChip / identity if already imported on claim surfaces |
| Toast | Keep soft info toast **or** drop if in-surface copy is enough — prefer one clear in-surface line; toast optional |

Link step (`ClaimLinkFindStep`) can keep Link-oriented copy for multi-hit / manual Link. Optionally tighten Link empty-list copy when still on Link mid-search — out of scope unless cheap.

---

## Non-goals

- Re-running Zendesk search on Create
- Changing Platform / Type / Claim identity fields (separate Unbox Ticket-over-Classify plan)
- Arrival Ticket auto-open port

---

## Verify

- Unit: controller flag set only on empty-seed flip; cleared on manual mode change / reopen
- Guard or assert: Create helper mentions tracking + “no ticket” / “create”; does not quote “Pick the existing ticket”
- Manual: unfound carton with tracking, no Zendesk hit → Create opens with the new helper visible
- `npm run verify`

---

## Related (do not confuse)

- **Unbox Ticket over Classify** (`docs` / plan `unbox_ticket_over_classify_*`): cockpit was overwriting Ticket with Classify on scan — separate fix (Ticket wins on carton open + denser claim Platform/Type/Claim labels).
- Subject identity inline patch on platform/type: already shipped (`applyCartonIdentity`).
