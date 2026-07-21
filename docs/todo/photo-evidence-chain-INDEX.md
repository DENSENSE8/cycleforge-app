# Photo evidence chain — initiative index (WS-PHOTO)

> **Status:** Planned · 2026-07-20 · audited against `main`  
> **Lane:** Prefer a dedicated worktree (`topic/photo-evidence` → register in `WORKTREE-LANES.md`) once Plan 1 lands; dogfood-surface fixes (wrong stamps, intent filters) may ship on `main` first.  
> **North star:** Station-staged photo insurance — prove what the carton/item looked like at arrival, unbox, test, and pack so disputes answer “received like this vs damaged at station X.”

## Problem

Operators need **per box then per item** evidence, separated by **mode/station**, then threaded through **library + serial journey + order timeline** with **PO · SKU · serial** identity. Today the polymorphic photo hub exists, but:

- Stage is only free-text `photo_type` (no mode column); triage vs unbox carton cannot be distinguished when both are carton-scoped.
- Desktop carton upload stamps **`receiving_item` on `RECEIVING`** (wrong).
- Triage + Unbox peeks force `photoIntent="all"`.
- Phone photo requests are **carton-only** (no line / stage).
- Unit timeline has three buckets (`unbox|testing|packing`) and **merges arrival + item** into `unbox`.
- Operations / serial / order journeys are **photo-blind**.
- `receiving.photoPolicy` (`require_per_item`) is **defined, never enforced**.

## Evidence stage matrix (target SoT)

| Stage id | Mode / station | Entity | `photo_type` | Display label |
|---|---|---|---|---|
| `arrival_package` | Triage / Arrival | `RECEIVING` | `receiving_package` | Arrival · package |
| `unbox_carton` | Unbox (carton chrome) | `RECEIVING` | `receiving_unbox_carton` *(new)* | Unbox · carton |
| `unbox_item` | Unbox (active line) | `RECEIVING_LINE` | `receiving_item` | Unbox · item |
| `testing` | Testing | `SERIAL_UNIT` | `testing_photo` | Testing |
| `packing` | Pack / ship | `SERIAL_UNIT` ± `PACKER_LOG` | `packer_photo` | Packing |

**Identity rules (non-negotiable):**

1. Item evidence primary-links **`RECEIVING_LINE`** (SKU lives on the line — never primary-link by SKU string).
2. When a serial is born from that line, journey inherits line (+ parent carton stages) via `serial_unit_provenance`.
3. Catalog `SKU` links are optional secondary (reference library / enrollment) — not claim insurance.
4. Display chrome everywhere: **PO · SKU · serial** (+ stage chip).

Legacy: `photo_type='receiving'` stays a package alias (`isPackagePhotoType`). Mis-typed carton+`receiving_item` rows need a one-shot repair or filter exclusion.

## Child plans (build order)

| # | Plan | Owns | Depends on |
|---|---|---|---|
| 1 | [`photo-evidence-stage-sot-plan.md`](./photo-evidence-stage-sot-plan.md) | Stage vocabulary, upload waist validation, intent helpers wired | — |
| 2 | [`photo-evidence-station-mode-capture-plan.md`](./photo-evidence-station-mode-capture-plan.md) | Triage / Unbox / mobile / phone-request capture UX | Plan 1 |
| 3 | [`photo-evidence-library-identity-plan.md`](./photo-evidence-library-identity-plan.md) | Library folders, tile labels, SKU/serial filters | Plan 1 |
| 4 | [`photo-evidence-journey-timeline-plan.md`](./photo-evidence-journey-timeline-plan.md) | Unit timeline stages + serial/order journey media | Plan 1 (+ 2 for real data) |
| 5 | [`photo-evidence-policy-claims-insurance-plan.md`](./photo-evidence-policy-claims-insurance-plan.md) | `photoPolicy` gates, claim attach, insurance_share | Plans 1–2 |

Related (do not merge into this initiative):

- [`unbox-triage-mode-separation-handoff.md`](./unbox-triage-mode-separation-handoff.md) — rail sort/SoC (orthogonal; share mode wrappers).
- [`unbox-receive-ux-improvement-plan.md`](./unbox-receive-ux-improvement-plan.md) — readiness / guided photo trays (feeds Plan 5).
- [`journey-hop-emitters-plan.md`](./journey-hop-emitters-plan.md) — event hops (PACKED/SHIPPED); photo media is separate.

## Verified facts (2026-07-20)

- Hub: `photos` + `photo_entity_links` (`src/lib/drizzle/schema.ts`, `src/lib/photos/types.ts`, `service.ts`).
- Intent SoT exists: `src/lib/receiving/photo-intent.ts` — **helpers unused**; list SQL hardcodes strings.
- Mobile item route correctly scopes `RECEIVING_LINE` (`PhotoUploadQueue`, `/m/receiving/po/.../item/.../photos`).
- Desktop `ReceivingPhotoButton` / `usePhotoGallery` write carton + `receiving_item`.
- `listUnitTimelinePhotos` lumps carton + line under `unbox`.
- `mergeJourney` / `SerialJourneySection` / order timeline APIs never call `unitPhotosToTimeline`.
- `getReceivingPhotoPolicy` has **zero** production call sites.

## Delivery posture

1. **Plan 1 first** — without write enforcement, every UI change is theater.
2. Quick dogfood fixes on `main` (stamp + intent filters) may precede the worktree.
3. Plans 3–4 can parallelize after Plan 1; Plan 5 last (needs real stage-separated captures).
4. Each plan ships with unit tests + targeted Playwright; full `npm run verify` before “done.”
5. **Multi-agent run:** paste [`photo-evidence-ultraco-EXECUTION-PROMPT.md`](./photo-evidence-ultraco-EXECUTION-PROMPT.md) into a Fable 5 session (Ultraco conductor → Wave 0 serial, Wave 1 four-way fan-out).

## Compound opportunities (initiative-wide)

- **Do now:** fix wrong desktop stamps; Triage `photoIntent=package`, Unbox carton vs line split.
- **Promote next:** shared `ReceivingPhotoStage` + `useReceivingPhotoScope` used by mobile, station, library, journey.
- **Ask first:** injecting dense photo rows into Operations History for *all* dims (density risk); new DB column vs `photo_type`-only stages.
