# Handoff — Home icon + Products out of Stock (platform listings)

**For:** implementing agent (Cursor / Claude Code)
**From:** Cycle Forge engineering
**Date:** 2026-07-31
**Status:** Phases 0–1 + station membership locks shipped in working tree — Phase 2 Channels sketch only (compose, not built)
**Lane:** current checkout — no ad-hoc branch
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

> Read `docs/todo/home-icon-products-platforms-HANDOFF.md` and start at §3 Phase 2
> (Channels plane). §0–§2 + membership below are locked. Verify claims by
> **call sites** in `sidebar-navigation.ts` + `SidebarNavList.tsx` + Products
> workspace, not docblocks.

---

## 0. One-sentence goal

Make **Home** a quiet top-pin **icon** (not a word row), pull **Products** out of the Stock drill into its own spine home for catalog + **connected sales-channel platforms**, and give operators a per-platform surface to update listings and related product facts — while Stock stays Inventory → Warehouse (physical stock).

---

## 1. What just shipped (do not undo)

MasterNav after Phases 0–1 + membership locks (working tree — confirm before editing):

```text
Home (house + label) · Search · Media          (top pin)
Overview | Scan Stations | Desk | Stock | Products | Library   (section drills)
  Scan Stations:
    Receiving (quiet SoT subgroup header)
      Arrival, Unbox, Local Pickup, Repair Service
    Testing, Packing (modeless), Scan out (modeless)
  Desk: Incoming, Review, Support, Shipping (Labels · Ready · FBA)
  Stock: Inventory, Warehouse
  Products: Catalog / Manuals / Labels / Pairing / QC / Kit
  Library: Studio, Catalog
Admin · Settings               (footer)
```

Locked patterns:

| Lock | Detail |
|---|---|
| Section drills | Root → Overview / Scan Stations / Desk / Stock / Products / Library; back header + pages |
| Modes | Always expanded under multi-mode pages; pinned mode-count; **no** accordion chevron |
| Receiving | L1 pages with quiet `STATION_SUBGROUPS` header (`stationSubgroup: 'receiving'`); not a Receiving accordion |
| Floor label | `STATION_GROUPS` → **"Scan Stations"** (`id` stays `floor`) |
| Shipping split | Floor **Scan out** modeless; Desk **Shipping** = Labels / Ready / FBA; route key stays `outbound` for panels |
| Packing | Modeless Standard-only (no Fragile / Multi in nav) |
| Home | `kind: 'top'` house glyph (`Home` from Icons) + **"Home"** label above Search |
| Products | `PRODUCTS_SECTION` + `kind: 'products'` after Stock, before Library |
| SoT | `SPINE_SECTIONS` + `spineSectionIdForPage` in [`src/lib/sidebar-navigation.ts`](../../src/lib/sidebar-navigation.ts) |
| Guards | `main-nav-groups.guard.test.ts`, `station-nav-groups.guard.test.ts` |

**Do not** collapse Scan Stations receiving L1 pages into a single Receiving accordion. **Do not** reintroduce mode accordion toggles. **Do not** put Products back under Stock or into the top pin.

---

## 2. Product ask (this handoff)

### 2.1 Home → labeled house row — **done** (label kept; house glyph, not Layout)

### 2.2 Products out of Stock — **done** (Option A / `PRODUCTS_SECTION`)

### 2.3 Products + integrated connections / platforms — **Phase 2 next**

Operator job: open Products and see **connected sales channels / platforms** (capability nouns + runtime provider labels — never hardcoded vendor product sentences outside Integrations hub). Per platform, update:

- Listings (create / sync / status / price / quantity signals as the connectors already allow)
- Linked catalog SKUs / pairing state (existing Pairing / Product Hub is a seed)
- Account-scoped connection health (reuse Integrations / `platform_accounts` SoT — do not invent a second account table)

Compose from existing surfaces first:

| Existing | Path / role |
|---|---|
| Products modes | `SIDEBAR_PAGE_NAV` `products` — Catalog / Manuals / Labels / Pairing / QC / Kit |
| Pairing + Product Hub | `src/components/products/pairing/*` — channel sections, unmatched queue |
| Platform style | `src/components/products/pairing/platform-style.ts` |
| Integrations registry | `src/app/settings/integrations/registry.ts` — Sales channels category |
| Unit listings write | `src/lib/inventory/markUnitListed.ts` + `serial_unit_listings` |
| Connectors vocabulary | `src/lib/integrations/connectors/types.ts` |
| Accounts SoT | `listPlatformAccounts` / catalog hooks — `platform_accounts` |

**Growth target (v1):** a Products L2 mode or Catalog sub-plane **"Channels"** (prefer capability noun) that lists **connected platform accounts** for the org and deep-links into per-account listing / sync work. Prefer growing Pairing / Product Hub over a page-local twin.

**Out of scope for v1 unless asked:** full multi-channel listing editor, Zoho item CRUD rewrite, new polymorphic tables.

---

## 3. Implementation phases

### Phase 0 — Home icon-only top pin — **done**

### Phase 1 — Products out of Stock (nav SoT) — **done**

### Phase 2 — Channels / platforms plane inside Products (compose first) — **sketch**

Compose path (do not invent a second account or listing SoT):

1. Inventory what Pairing + Product Hub already show per channel; map gaps vs "per platform update listings".
2. Add a Products mode **or** Catalog facet that lists connected sales-channel accounts from Integrations / `platform_accounts` (read path via `listPlatformAccounts` / `usePlatformAccountCatalog` first).
3. Each account row → existing deep link (Pairing `?view=pairing` + platform filter, listing URL, or settings Integrations card) — capability / runtime labels only; reuse `platform-style.ts`.
4. Only then grow write UX (listing price/qty/status) behind capability facades.

**Done when:** operator can open Products → see connected platforms → reach listing/pairing work per account without hunting Settings.

### Phase 3 — Verify + E2E

- `npm run verify` (full).
- Smoke: Home icon; Stock = Inventory/Warehouse; Products drill; Desk Shipping; floor Scan out; one connected platform path.
- E2E only if a user-facing route contract changes (prefer extending an existing products/pairing spec).

---

## 4. Files to touch first

| Concern | File |
|---|---|
| Nav SoT | `src/lib/sidebar-navigation.ts` |
| Spine render | `src/components/sidebar/master-nav/SidebarNavList.tsx` |
| Guards | `src/components/sidebar/master-nav/main-nav-groups.guard.test.ts`, `station-nav-groups.guard.test.ts` |
| Display law | `.claude/rules/display/workbench.md`, `.claude/rules/source-of-truth.md` |
| Products modes | `src/components/products/products-view.ts`, `ProductsWorkspace.tsx` |
| Channel seed | `src/components/products/pairing/*` |
| Integrations | `src/app/settings/integrations/registry.ts` |

---

## 5. Non-goals

- Do not merge Products back into Library Catalog (`studio-catalog`) — different job (ops graph catalog vs sellable SKU catalog).
- Do not put Products in the top pin.
- Do not hardcode "Amazon / eBay / Zoho" sentences in Products chrome — capability / runtime labels only.
- Do not raise knip / DS ratchet baselines.

---

## 6. Paste-ready execution prompt (Phase 2)

```text
Read docs/todo/home-icon-products-platforms-HANDOFF.md and execute Phase 2
(Channels plane inside Products by composing Pairing / Product Hub +
Integrations platform_accounts — do not invent a second account or listing SoT).
Keep Phases 0–1 + station membership locks as shipped. Run npm run verify
before claiming done. Do not edit the plan file; update this handoff status
only if membership locks change.
```
