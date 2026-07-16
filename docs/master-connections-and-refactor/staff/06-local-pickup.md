# 06 — Local pickup (Walk-In station job)

> **Status:** In progress  
> **Last updated:** 2026-07-16  
> **Staff hub:** [INDEX.md](./INDEX.md)  
> **Technical counterpart:** [Pain: Pickup](../master-index-plan.md#22-pain-points-domain-gaps-this-index-solves) · [§5.5 Local pickup](../master-index-plan.md#55-local-pickup-under-the-adapter-model)  
> **Related staff plans:** [05 External inventory](./05-external-inventory-zoho.md) · [02 Locations](./02-inventory-and-locations.md) · [04 Journey](./04-item-journey.md)

---

## Why it matters

Local pickup (seller drops inventory at the dock) is a first-class intake path. If it uses a **different mental model** than carrier POs, staff make mistakes, and the Item Journey has holes (“it came from pickup” missing from the serial story).

---

## What’s happening now

- Receiving’s **Walk-In** mode (`/pickup`) is the front-desk station with three jobs via `?job=`:
  - **Sales** — Square cart → terminal charge
  - **Local Pickup** (default) — seller drop-off cart → `LCPU-…` PO + receiving record
  - **Repair** — identify / intake / light ticket processing
- Top-level **`/walk-in`** is history: recent picked-up repairs, sales, and completed local pickups (`?category=`).
- Job SoT: `src/lib/walk-in/jobs.ts`.
- Zoho-synced pickup POs don’t always create the same **line-level** receive story as normal POs (still open).

---

## What needs to change

- **One** pickup intake model for operators (finish legacy path consolidation).
- Pickup serials get the same journey: receive → test → bin → …
- Pushing a PO to Zoho (or another provider) is optional **writeback**, not the definition of pickup.
- Keep job labels explicit inside Walk-In so **sales ≠ local pickup ≠ repair**.

---

## Side-by-side

| Topic | Now | Change |
|-------|-----|--------|
| Operator place | Receiving → Walk-In | Keep; jobs share one station shell |
| Job picker | `?job=sales\|pickup\|repair` | Stable URL contract |
| History | `/walk-in?category=` | Monitor of completed front-desk work |
| ERP PO | Often required / hardcoded vendor | Optional provider push |
| Journey | Easy to miss pickup origin | Provenance shows pickup clearly |

---

## Done looks like

- [x] Staff open Walk-In on Receiving and pick Sales / Local Pickup / Repair.
- [x] `/walk-in` shows categorized recent activity (not intake).
- [ ] A pickup serial’s journey shows origin = pickup and full downstream hops.
- [ ] Zoho outage does not block recording a local pickup on the floor.

---

## Practice together (1-on-1)

1. Receiving → Walk-In → Local Pickup → add lines → finalize.  
2. Unbox / test as usual.  
3. Open serial journey → origin shows pickup; bin after putaway.  
4. `/walk-in` → Pickups category → confirm the completed order appears.
