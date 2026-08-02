# Right-rail inspector — display contract

**Region:** Workbench / Desk record plane (and intake create overlays that share `RightRailHost`).  
**Shell SoT:** `RightRailHost` + `src/lib/right-rail/store.ts` + detail-stack tokens.  
**Header SoT:** `PaneHeader` + blocks (`PaneHeaderLabel`, `PaneHeaderActionBar`, `PaneHeaderCloseButton`, …).  
**Modality / push / occupancy:** [source-of-truth.md](../source-of-truth.md) → **Right-rail modality**.  
**Guard:** `src/components/right-rail/right-rail-inspector-header.guard.test.ts`.

---

## Anatomy (every record inspector)

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — icon action row (ONLY secondary action surface)     │
│ [ contextual icons … ]              [ >| · ↑ · ↓ ]          │
│ PaneHeaderActionBar iconOnly        close prev next         │
├─────────────────────────────────────────────────────────────┤
│ Row 2 — dense identity (PaneHeaderLabel)                    │
│ [badge?]  eyebrow (mode / entity kind)                      │
│           value = SHORT durable key (truncate)              │
├─────────────────────────────────────────────────────────────┤
│ optional belowSlot — tabs / status pills                    │
├─────────────────────────────────────────────────────────────┤
│ Body — scrollable facts · forms · long titles · prose       │
├─────────────────────────────────────────────────────────────┤
│ optional footer — ONE primary CTA band (submit / resolve)   │
└─────────────────────────────────────────────────────────────┘
```

Compose with `PaneHeader`: icon cluster in the main row (`leftSlot` / `rightSlot`); identity in `belowSlot` **or** identity left + close right when the rail has no contextual icons yet — but **never** a wrapping hero title.

---

## Identity — Hard Always / Never

**Always**

- Identity uses `PaneHeaderLabel` (or the same role ladder):  
  - Eyebrow: `text-role-eyebrow uppercase tracking-widest` — mode / entity kind (`Order #`, `Catalog link`, `PO`, `Repair ticket`).  
  - Value: truncated short key at caption density (`paneHeaderLabelValueClass` / `text-role-caption font-semibold`) — order id, item #, SKU, ticket #, tracking.
- Long product titles, listing sentences, descriptions, and multi-line prose live in the **body** as fact rows — not in the header.
- Contextual icon actions are a **per-occupant** `PaneHeaderActionBarAction[]` (Link / Sync / Print / Ignore / …). The shell does not hardcode them.
- Close is **`PaneHeaderActionBar onClose`** (which composes `PaneHeaderCloseButton` at the HEAD of its trailing cluster), mandatory for `modal={false}`. Queue walk uses the same bar's `onPrev` / `onNext`, so `close · up · down` is one cluster **by construction** — never close in a `rightSlot` on the row above, which is how the two halves drifted apart and how two headers ended up swallowing the prop. Reach for `PaneHeaderCloseButton` directly only outside an action row.
- **Close leads, and its glyph is `ArrowRightToLine` (`>|`), not an `X`** (2026-08-02). Dismiss is the control reached for without looking, so it takes the stable end — prev/next come and go with the queue behind the record. The arrow says the panel is parked back against the right edge it came from rather than cancelled; `intent="dismiss"` restores the `X` for a pane that genuinely goes away.
- **Order surfaces mount `RecordPaneHeader`** (`src/components/order-record/`) — the merge of `ShippedDetailsHeader` + `OrderIdentityHeader` (2026-08-02). Tabs are a `tabs` slot on it, not a second component. Open-full-page is an **action in the icon row**, not a lone `IconButton` beside close.

**Never**

- **`SidebarIntakeFormShell` as record-inspector chrome.** That shell is for **create / intake / import** forms (New Order, Import eBay, FBA create, column-display prefs). It ships a left-circle close + wrapping uppercase `<h2 title>` — the exact anti-pattern that turned a Bose product sentence into a hero header on Review → Catalog link.
- A **wrapping hero title** (full `product_title` / listing name / paragraph) in any right-rail header.
- `text-role-title` / `text-role-display` / raw `text-lg`+ for rail identity.
- Labelled button blocks that **duplicate** the icon action row (e.g. a second Delete in the footer). A single primary CTA band (Link listing / Resolve / Save) in the footer is allowed; it is not a twin of the icon strip.
- Page-local `fixed right-0` panels, intake `h2` titles, or a third right-edge grammar.

---

## Two chrome families (do not cross)

| Family | Component | Use for |
|---|---|---|
| **Record / queue inspector** | `PaneHeader` + blocks | Picked row detail, queue walk, edit-in-context (`detail:order`, `detail:catalog-link`, `detail:incoming`, …) |
| **Intake / create overlay** | `SidebarIntakeFormShell` | Empty-form create / import wizards (`detail:new-order`, `detail:incoming-import-ebay`, FBA create, grid column prefs) |

If a surface starts as intake and later becomes “open a row and resolve it,” **migrate the header to `PaneHeader`** — do not stretch the intake shell’s title prop to hold the row’s product name.

---

## Contextual icons

Different rails own different action contracts. Pass them in; do not fork a second header:

| Occupant (examples) | Typical icon actions |
|---|---|
| `detail:order` | Print · note · open full · delete · … |
| `detail:incoming` | Sync |
| `detail:catalog-link` | Link listing · Ignore |
| `detail:import-exception` | Resolve · Ignore |
| `detail:claim` | Print · Square · … |

Trailing cluster is always **`>| · ↑ · ↓`** when the rail walks a queue; close alone when it does not.

---

## Checklist (new right-rail occupant)

1. `DetailStackRailRegistrar` / `useRegisterRightPanel` — no private geometry.  
2. `modal={false}` for record peeks; stable id when row→row is the loop.  
3. Header = `PaneHeader` + `PaneHeaderActionBar iconOnly` (row 1, with `onPrev`/`onNext`/`onClose`) + dense `PaneHeaderLabel` short key (row 2). Order surfaces: compose `RecordPaneHeader`, don't fork a third.  
4. No `SidebarIntakeFormShell` on a record inspector.  
5. Long titles / prose only in the scroll body.  
6. Push / resize / collapse per Right-rail modality SoT.
