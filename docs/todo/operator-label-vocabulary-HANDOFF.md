# Handoff — Operator label vocabulary (say what the surface does)

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Predecessor:** Testing L2 rename (QC → Quality Control, Shipping → Ready to Pack) + plan
[`operator_label_upgrades`](../../.cursor/plans/operator_label_upgrades_c0ac0882.plan.md) **wave 1 — SHIPPED**
**Status:** wave 1 done (`npm run verify` green). This handoff is **wave 2+** residual + the naming law.
**Lane:** `main` checkout — no ad-hoc branch. Attach to `:3050`. **User owns commits.**
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/operator-label-vocabulary-HANDOFF.md and execute the next wave (§3), then stop and report.

Wave 1 already shipped (§0). Do NOT re-rename those faces. Wire ids / routes / DB
sentinels stay stable — change display labels and primary operator copy only.

Laws: say what the surface does; expand cryptic page titles; never collide two jobs
under one word; capability nouns over vendor product sentences (Integrations carve-out);
Open displays ≠ Show inspector.

Attach to :3050; never start/restart/kill the dev server. npm run verify before done.
```

---

## 0. What already shipped (wave 1) — do not redo

| From | To | Where |
|---|---|---|
| Testing L2 **QC** | **Quality Control** | `SIDEBAR_PAGE_NAV` tech children + `WORKSPACE_MODES.testing` |
| Testing L2 **Shipping** | **Ready to Pack** | same (wire id still `shipping`) + PackageCheck glyph |
| Products L2 **QC** | **QC Checklist** | Products children (≠ floor QC) |
| Shipping L2 **Postage** | **Labels** | outbound children |
| **FBA** / **FBA prep** | **Amazon Prep** | nav, titles, goal chips, many station faces |
| Goal **Tech** | **Testing** | `STATION_LABEL` / `STATION_LABELS` |
| Surface **Incoming** | **Inbound** | `surface-keys`, mobile title, receiving mode items |
| **Repair Service** (station) | **Repair** | APP + PAGE nav |
| Sales **Repairs** | **Repair History** | Sales children |
| **Workflow Studio** | **Operations Studio** | footer pin + titles SoT |
| Inventory L2 **Triage** | **Tracking Exceptions** | inventory children + sidebar tab label |
| Support **Inquiries** | **To ship** | support alias onto orders desk |
| Aria **Shipping …** on `/test` | **Ready to Pack …** | tech shipping chrome |
| Tab **Ship** (tech workspace) | **Pack** | `ShippingScanWorkspace` |
| **PO items** | **Purchase order items** | Unbox / unfound section headers |
| Displays **Linkage** | **Pairing** | unbox display index + tabs + testing displays |
| Chip **Details** (opens inspector) | **Show inspector** | `IdentityLinkChip` default + CartonContextCard |
| **Open in Displays** / **Hide right panel** | **Open displays** / **Hide displays** | Unbox edge + ScanStationProgressControl |
| **Open in Zendesk** | **Open in helpdesk** | claim filed, UnfoundMatchStrip, warranty popover |
| Zoho-PO operator sentences | purchase-order capability nouns | classify pills, PoLinkTab, Open PO chip |
| Classify **FBA Return** | **Amazon return** | `intake-classification` face (+ claim subject tests) |
| Channel / platform face **FBA** | **Amazon** | `source-platform`, CHANNEL_OPTIONS, pairing chips |
| Unfound face **Unfound PO** | **Unfound order** | `UNFOUND_PO_DISPLAY` (DB sentinel stays `Unfound PO`) |
| **Receiving #N** fallbacks | **Carton** / tracking last-8 / **Unmatched carton** | claim header, search, details stack |

**Stable on purpose:** wire ids (`shipping`, `fba`, `qc`, `incoming`, `triage`), routes, permissions, DB `item_name = 'Unfound PO'`, Amazon FNSKU as a *scan token* (not a page title).

---

## 1. Naming law (use this for every new rename)

1. **Face = job.** The label an operator reads must name the *work*, not the wire id, vendor, or internal architecture noun.
2. **One word → one job.** If two surfaces share a word, one of them is wrong (was: Testing “Shipping” vs domain Shipping; Inventory “Triage” vs Arrival).
3. **Expand page titles; keep short marks short.** L2 / header faces prefer full words (`Quality Control`, `Amazon Prep`). Dense chips / column marks may keep `PO`, `AMZ` *only* when space is the constraint and hover/tooltip carries the full name.
4. **Capability nouns, not vendor product sentences** outside Integrations hub + intentional deep links. Prefer “helpdesk”, “purchase order”, “inventory” over “Zendesk”, “Zoho PO”, “Zoho”.
5. **Displays ≠ inspector.** Station edge: **Open displays** / **Hide displays**. Desk Band 3: **Show inspector** / **Hide inspector**. Never “details editor”.
6. **Labels only.** Never rename a route, `?view=` / `?mode=` value, permission id, or DB sentinel to “fix copy”. Display SoTs first: `sidebar-navigation.ts`, `sidebar-titles.ts`, `surface-keys.ts`, then chrome strings.

---

## 2. Pattern catalog — how to spot the next miss

| Smell | Bad example | Better face | Notes |
|---|---|---|---|
| Cryptic acronym as **page** title | QC, FBA, Tech | Quality Control / QC Checklist, Amazon Prep, Testing | Marks in grids can stay short |
| Domain word reused for a **different** job | Shipping (tech handoff), Triage (inventory exceptions) | Ready to Pack, Tracking Exceptions | Check sibling L1 labels before renaming |
| Registry drift (same route, two faces) | Inbound vs Incoming, Workflow vs Operations Studio | Pick one face; update all registries | Grep label + `SIDEBAR_TITLES` + `SURFACE_REGISTRY` |
| Architecture noun as operator title | Linkage, Collab | Pairing, Collaboration (or Threads) | Wire id can stay |
| Vendor product in body/CTA | Open in Zendesk, Merge Zoho PO | Open in helpdesk, Merge purchase order | Keep provider name in Integrations / tooltip only |
| Internal id as human title | Receiving #123 | Carton · last-8 / Unmatched carton | Never paint raw `receiving_id` as the hero |
| Asymmetric chrome pair | Open displays / Hide right panel | Open displays / Hide displays | Match the open verb |
| Placeholder still jargon | `Search PO # / …` | `Search purchase order # / …` (or keep PO # if every nearby chip is already PO) | Prefer consistency with the section face |

---

## 3. Next wave — concrete from → to (do these)

Prioritized for **operator predictability**. Wire ids stay.

### 3.1 Residual faces that still say the old nickname

| From | To | Touch |
|---|---|---|
| Operations journey facet **Tech** | **Testing** | [`operations-sidebar-shared.ts`](../../src/components/sidebar/operations/operations-sidebar-shared.ts) `JOURNEY_STATION_ITEMS` |
| Journey **Pack** / **Ship** (if they read as cryptic beside Testing) | **Packing** / **Shipping** | same file — match station page faces |
| Receiving variant chip **PO** | **Purchase order** (or keep **PO** + tooltip “Purchase order”) | [`receiving-sidebar-shared.ts`](../../src/components/sidebar/receiving/receiving-sidebar-shared.ts) `RECEIVING_VARIANT_THEME.PO.label` |
| Home L2 **Collab** | **Collaboration** (or **Threads** if that is the real job) | [`sidebar-navigation.ts`](../../src/lib/sidebar-navigation.ts) Home children |
| Home L2 **Brief** | **Shift brief** (or drop until the surface is real) | same — placeholder AI coach |
| Design-demo Displays **Linkage** | **Pairing** | [`design-demo/displays-flush/page.tsx`](../../src/app/design-demo/displays-flush/page.tsx) — demo must not teach the old noun |
| Pack card field **FNSKU** (as a lonely uppercase title) | keep token; eyebrow → **Amazon SKU (FNSKU)** if operators don’t know the acronym | [`PackFbaScanCard.tsx`](../../src/components/packer/PackFbaScanCard.tsx) |
| Scan bar placeholder `Orders · FNSKU · RS · Serial` | `Orders · Amazon SKU · Repair · Serial` (or expand RS) | [`ShippingScanBar.tsx`](../../src/components/sidebar/tech/ShippingScanBar.tsx) |
| Placeholder `Search PO # / reference / vendor…` | `Search purchase order # / reference / vendor…` | PoLinkTab, Incoming chrome, attach-tracking popovers — batch for consistency |
| Placeholder `PO #, tracking #, …` | `Purchase order #, tracking #, …` | MovePhotosBetweenPoPanel + ReceivingUnboxScanBar mode labels where face is primary |

### 3.2 Comment / doc debt (low priority, do when touching the file)

Comments still say “Workflow Studio”, “Repair Service”, “Hide right panel”, “Unfound PO”, “Zoho PO” as if they were the face. When you edit a file, bring the comment to the new vocabulary so the next agent does not reintroduce the old label.

### 3.3 Do **not** “fix” these

| Keep | Why |
|---|---|
| **Bose Repair Service** / Ecwid category names | External catalog identity, not our nav |
| DB / API sentinel `Unfound PO` | Paint via `UNFOUND_PO_DISPLAY` only |
| Wire id `tech.shipping`, `fba`, `qc` | Bookmark + test stability |
| Permission category ids | Auth SoT; face already Amazon Prep where it matters |
| Desk close **Hide right panel** / **Hide inspector** | Desk inspector contract — not Station Displays |
| FNSKU as scan *value* / event type | Industry Amazon token; expand only in *titles* |

---

## 4. How to land a rename safely

1. Change the **display SoT** first (`SIDEBAR_PAGE_NAV` / `APP_SIDEBAR_NAV` / `SIDEBAR_TITLES` / `SURFACE_REGISTRY` / goal `STATION_LABEL`).
2. Grep the **exact old face string** in `src/**/*.{ts,tsx}` — update operator-visible copy; leave wire ids.
3. Update **guards and unit tests** that assert the old string (master-nav guards, mobile title tests, claim-subject tests).
4. If introducing a display constant (like `UNFOUND_PO_DISPLAY`), **import it at paint sites** so knip does not flag a dead export.
5. `npm run verify` before done. Never raise a ratchet baseline.

---

## 5. Suggested commit message (when user asks to commit)

```
Improve operator-facing labels for clarity and job fit.

Expand cryptic page titles, align registry drift, and replace vendor/architecture
nouns with capability language so switchers and statements match the work.
```

---

## 6. Done criteria for wave 2

- [ ] §3.1 faces updated (or consciously deferred with a one-line note in this file)
- [ ] No new page title is a bare acronym that collides with another station
- [ ] Grep for `Open in Zendesk`, `Open PO in Zoho`, `Hide right panel` (station edge), `label: 'Linkage'`, `label: 'Tech'` (journey) returns only comments / Integrations carve-outs / intentional keeps
- [ ] `npm run verify` green
