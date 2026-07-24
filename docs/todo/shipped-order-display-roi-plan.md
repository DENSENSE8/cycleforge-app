# Shipped / searched order display — high-ROI updates

**Status:** PLAN (partially started)  
**Lane:** `main` / WS-DOGFOOD  
**Surface:** search → open order detail (Dashboard slide-over, Support · Orders focus, Shipping/Labels detail, full order page)  
**Principle:** Close support + warehouse loops **on the order body** (not header chrome). Compose existing Support / Labels / Warranty waists — do not invent parallel queues.

---

## 0. Goal

Turn the **searched and displayed order** into the same kind of one-stop operator surface Shopify Admin and Amazon Seller Central optimize for: facts + next actions in context, without bouncing across pages.

Cycle Forge’s edge is **ops density** (serials, packing photos, stations, multi-channel fulfillment) — not storefront checkout chrome.

---

## 1. Placement law (locked)

| Do | Don’t |
|---|---|
| Put operator CTAs on the **order body** (scroll facts + action row) so context is already visible | Park create/print actions only in the **header / More** chrome |
| Deep-link into existing queues (`/support` tickets, `/shipping` Labels) | Fork a second “issues” or “returns” queue beside tickets / Labels |
| Gate helpdesk actions on `integrations.zendesk` (capability) | Hardcode Zendesk product sentences in operator copy |

**Support actions row SoT (started):**  
`src/components/shipped/details-panel/OrderSupportActionsSection.tsx`  
composed from `ShippedDetailsPanelContent` (default `showSupportActions`).

---

## 2. Already strong (do not rebuild)

| Capability | Where |
|---|---|
| Packout pipeline (Tested → Packed → Scanned Out) | `OrderPipelineSection` |
| Shipping + product facts, copy helpers | `ShippingInformationSection`, `ProductDetailsSection` |
| Packing + SKU integrity photos | `ShippedDetailsPanelContent` |
| Notes / urgent / out of stock | Header dock + editors (`ShippedPanelEditorDock`) |
| Warranty / customer quick links | `OrderQuickLinksSection` |
| Timeline / serial journey / documents (full page) | Order tabs / stacks |
| **Report an issue → Support New ticket (order-anchored)** | `OrderSupportActionsSection` + `supportCreateTicketHref` + `?createTicket=1` |

Deep link: `/support?mode=orders&openOrderId={pk}&createTicket=1`  
Helper: `supportCreateTicketHref` in `src/components/sidebar/support/support-sidebar-shared.ts`.

---

## 3. Highest-ROI features (Shopify / Amazon mapped)

Ranked by **daily-ops leverage × loop closed ÷ effort** for reseller fulfillment + tech support.

| Rank | Feature | Shopify / Amazon analog | Why high ROI here | Status |
|---|---|---|---|---|
| **1** | **Return / replacement actions** — Print return label → Labels queue; Issue replacement / RMA chip | Amazon: Request return / Replacement; Shopify: Return / Exchange | Completes the issue loop operators already start from search | ⬜ Not started |
| **2** | **Linked tickets + last reply** — open/pending tickets, one-line status, jump to thread | Shopify: Timeline + conversations; Amazon: Buyer messages | Most issues already exist; create is the minority path | ⬜ Partial (SupportContextHub tabs; not on order-body strip) |
| **3** | **Customer contact strip** — name, email/phone, channel, message/call deep-link | Shopify customer card; Amazon buyer info | Support’s first 10s after search | ⬜ Partial (quick link only) |
| **4** | **Fulfillment / SLA facts** — ship-by, deliver-by, carrier ETA, exception badge | Shopify fulfillment card; Amazon ship-by | Turns search into triage | 🟡 Some stamps exist; not a dedicated SLA strip |
| **5** | **Money + remedy summary** — paid, refunded, replace-in-progress, OOS/blocked | Shopify payment + refunds; Amazon refund/replace | Stops wrong promises when money ≠ ops state | ⬜ Not started |
| **6** | **One-tap documents** — packing slip, invoice, label PDF, return label | Shopify print menu; Amazon invoice/packing slip | Printer floor + support both land here | 🟡 Docs tab exists; not body one-taps |
| **7** | **Serial / unit identity + journey peek** | Weak on Shopify/Amazon — **our** differentiator | Cuts “same unit?” tickets on used goods | 🟡 Full-page journey; peek on slide-over TBD |
| **8** | **Related entities** — same buyer / same serial / prior RMA / sibling order | Shopify related orders | Replacement + return confusion / fraud | ⬜ Not started |

### Labels printer companion (same initiative)

Once **Print return for replacement** exists, promote Labels Queue into **Urgent | Pending** tables (or stacked sections) using existing `orders.is_urgent` / `?attention=1`.

Today: one awaiting table + urgent filter (`LabelsQueueTable`, `LabelsWorkspaceView`).  
Gap: two first-class tables/sections for the printer floor — not a new pipeline.

---

## 4. Recommended build order

1. **Print return for replacement** CTA on `OrderSupportActionsSection` → push order into Labels queue (urgent lane when replacement/return).
2. **Linked tickets strip** on the order body (prefer open over create when a ticket exists).
3. **Customer + SLA fact row** (compose existing fields; don’t invent a CRM).
4. **Remedy / money chip row** (channel-agnostic labels via capabilities).
5. **Related orders / prior RMA**.
6. **Labels Urgent | Pending** split (after #1 so the push target is obvious).

### Same Support actions row (compound with Report an issue)

```
[ Report an issue ]  [ Print return for replacement ]  [ Open ticket #… ]*
```

\* When linked ticket(s) exist; otherwise hide or demote create.

---

## 5. Out of scope / low ROI on this page

Looks like Shopify; weak for Cycle Forge warehouse search detail:

- Checkout fraud / risk scores  
- Marketing attribution  
- Discount / line-item merchandising editors  
- Gift cards / subscriptions  
- Rich storefront metafield browsers  

Keep those on Commerce / Integrations — not on Station order focus.

---

## 6. Compound opportunities

- **Do now (in scope / low blast radius):** return-label + linked-ticket on `OrderSupportActionsSection`; Labels urgent/pending sections reusing `is_urgent`.
- **Promote to DS next (2+ call sites):** reusable **entity actions** row for Station order focus (Support / Dashboard / Labels / full page).
- **Deferred (ask first):** full Shopify-style refund composer (money + channel rules + audit); new ticket taxonomy vs helpdesk tags.

---

## 7. Key files

| Concern | Path |
|---|---|
| Order body support actions | `src/components/shipped/details-panel/OrderSupportActionsSection.tsx` |
| Order detail stack | `src/components/shipped/ShippedDetailsPanelContent.tsx` |
| Support Orders focus | `src/components/support/orders/SupportOrdersWorkspace.tsx` |
| Create-ticket host + modal | `src/components/support/station/useSupportTicketClaimHost.ts`, `SupportCreateTicketModal.tsx` |
| Support deep links | `src/components/sidebar/support/support-sidebar-shared.ts` |
| Labels queue | `src/components/outbound/labels/LabelsWorkspaceView.tsx`, `LabelsQueueTable.tsx` |
| Related Support waist | `docs/todo/support-station-full-waist-handoff.md` |

---

## 8. Acceptance sketches (when implementing)

### Report an issue *(done)*

- [x] Button on order body, not header  
- [x] Opens Support New ticket with order anchor  
- [x] Deep link `?createTicket=1` works from Dashboard/Labels open order  
- [x] After create, lands on the new ticket  

### Print return for replacement *(next)*

- [ ] Body CTA next to Report an issue  
- [ ] Order appears on Labels awaiting queue (urgent when replacement)  
- [ ] Operator can print return label without re-searching  

### Linked tickets strip

- [ ] Shows open/pending linked tickets with one-line status  
- [ ] Click opens `/support?ticket=…`  
- [ ] Create demotes when an open ticket already exists  

---

## 9. Decision log

| Date | Decision |
|---|---|
| 2026-07-23 | Report an issue lives on **order body**; destination = Support create-ticket page/modal with order linked |
| 2026-07-23 | Do not use `/support?mode=issues` for customer order issues (that mode is product feedback) |
| 2026-07-23 | Prefer wiring Support tickets + Labels over inventing new queues |
| 2026-07-23 | Shopify/Amazon parity = ops loops on the order page, not storefront feature parity |
