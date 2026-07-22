# Handoff: Unboxed rail — status-dot → title gap + Playwright geometry suite

## Context

Cycle Forge Unbox sidebar (`/unbox`). Operator feedback: **left column alignment is
good** (MasterNav “Unbox”, scan placeholder, `UNBOXED` eyebrow, row titles share
one x), **but there is an unwelcome horizontal canyon between the green status
dots and the row title text** (“Bose…”, “Unfound PO”).

Do **not** fork a page-local rail. Compose / grow the SoT in
[`header-shell.ts`](../../src/components/layout/header-shell.ts) +
[`RailRow.tsx`](../../src/components/sidebar/rail-shell/RailRow.tsx). Keep
`npm run verify` green. Prefer Playwright geometry assertions over visual
snapshots for this spacing regression.

Dogfood lane is `main` (WS-DOGFOOD). Stay on the current branch; no ad-hoc
branch. User owns commits.

---

## What’s already landed (keep)

| Concern | Where | Behavior |
|---|---|---|
| Right edge | `SIDEBAR_RAIL_ROW_PAD_RIGHT` + eyebrow `pr-1.5` | Pencil ↔ selected blue ring ↔ age |
| Text column SoT | `SIDEBAR_TEXT_INSET_LEFT = 'pl-[4.3125rem]'` | Eyebrow + row title + scan input under MasterNav label |
| Scan icon | `STATION_SCAN_BAR_ICON_SLOT_CLASS` `left-[2.9375rem]` | Under MasterNav mode glyph |
| List host | `SIDEBAR_RAIL_INSET_X = 'pl-0 pr-0'` | Flush — avoids empty strip *left of* the dots |
| Status dots | Absolute `left-2` / `left-3` inside the row button | Hug the left inside the selection ring |
| Ticket · seller | `IdentityLinkChip` `tooltipTrigger="click"` when `actionsInMenu`; `SellerMessageChip` `placement="below"`; claim cluster `gap-2` | Downward tooltips, clearer ticket↔bubble gap |

---

## Problem — canyon between status pill and title

### Symptom

On `/unbox` Unboxed rail:

```
[●]············[Bose 302A Sp…]
 ^ dot          ^ title
    ← large empty gap →
```

`UNBOXED · N` eyebrow also sits on the title column, so the canyon is visible
between the vertical stack of green dots and the title/eyebrow text column.

### Root cause (code deep-dive)

**Two independent left anchors** that are not a tight `gap-*` pair:

1. **Status chrome** — absolutely positioned near the button’s left edge:

```157:163:src/components/sidebar/rail-shell/RailRow.tsx
        <span
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5',
            isGrouped ? 'left-3' : 'left-2',
          )}
        >
```

   Dot center ≈ `0.5rem` (`left-2`) + half of `h-2 w-2` ≈ **~12px** from the
   button’s left edge.

2. **Title / age flex content** — padded by the MasterNav **label** column:

```43:43:src/components/layout/header-shell.ts
export const SIDEBAR_TEXT_INSET_LEFT = 'pl-[4.3125rem]';
```

```147:151:src/components/sidebar/rail-shell/RailRow.tsx
        className={cn(
          'ds-raw-button group relative flex w-full items-center gap-2 text-left transition-colors pr-1',
          SIDEBAR_TEXT_INSET_LEFT,
```

   Title text starts at **4.3125rem ≈ 69px** from the button’s left edge.

3. **Eyebrow** uses the same text inset (so `UNBOXED` lines up with titles, not
   with the dots):

```145:153:src/components/sidebar/SidebarRailShell.tsx
  const eyebrowInsetX =
    railInset === 'scanDock'
      ? cn(SIDEBAR_TEXT_INSET_LEFT, SIDEBAR_RAIL_ROW_PAD_RIGHT)
      : SIDEBAR_GUTTER;
  ...
        <div className={cn('flex items-center justify-between py-1', eyebrowInsetX)}>
```

**Net gap** ≈ `69px − ~12px − ~8px(dot)` ≈ **~50px** of air between pill and
title. That is not `gap-2.5` — it is “absolute left chrome” + “MasterNav-label
padding on the whole button.” The absolute span does **not** reserve flow
space; the `pl-[4.3125rem]` still reserves the full MasterNav chrome width
(chevron + hairline + mode icon + gap) even though that chrome is **not** in
the row.

### Why it was done this way

Prior iteration: padding the **list host** by `pl-[2.9375rem]` put a dead strip
*left of* the dots (rejected). Absolute dots + text-inset on the button fixed
that, but traded it for a canyon *between* dots and titles.

### Intentional invariants to preserve while fixing

1. **Scan typed text** and **MasterNav “Unbox” label** share one x (or a
   deliberate, documented offset).
2. **No dead strip** left of the status dots (list must not re-introduce
   `pl-[2.9375rem]`-style host padding).
3. **Right edge**: pencil / blue ring / age stay locked via
   `SIDEBAR_RAIL_ROW_PAD_RIGHT`.
4. Spacing guard: no new arbitrary-`px` padding without same-line
   `ds-allow-spacing` — rem/`calc` without `px`, or Tier-1 scale tokens.

---

## Suggested fix direction (pick one, keep it in the SoT)

### Preferred — two-track row, tight gap after the icon track

Stop applying `SIDEBAR_TEXT_INSET_LEFT` to the **whole** row button. Instead:

```
[ button: pl-2 pr-1 + SIDEBAR_RAIL_ROW_PAD_RIGHT on <li> ]
  [ icon track: w-4 flex center status dot ]   ← flow, not absolute
  [ gap-1.5 = SIDEBAR_MASTER_NAV_MODE_GAP ]
  [ title + age flex-1 ]
```

Align the **title track** with MasterNav / scan text by padding only when
needed:

- Option A (optical): accept that rail titles sit after a compact `w-4`+`gap-1.5`
  from `pl-2` (~house dense ops row), and move **scan input** + **eyebrow** to
  that same denser column (may mean *reducing* `SIDEBAR_TEXT_INSET_LEFT` /
  scan `pl-[4.3125rem]` to match the row, not the reverse).
- Option B (strict MasterNav): keep scan/MasterNav at 4.3125rem, but set the
  row’s leading track width so `pl-2 + w-4 + gap-1.5` lands the title at
  ~4.3125rem **without** a hollow middle — i.e. the track itself is wide and
  the dot is **left-aligned or centered at the start** of that track, not a
  tiny pill floating in a 50px void.

**Do not** leave absolute `left-2` dots + `pl-[4.3125rem]` on the same button —
that combination *is* the canyon.

### Also check

- Edit-mode checkbox: currently shares the absolute span; keep it in the
  leading track when you convert to flow layout.
- Grouped rows: indigo stripe + `left-3` — keep stripe clear of the title.
- `PkgGroupHeader` right pad already uses `SIDEBAR_RAIL_ROW_PAD_RIGHT`.
- Density: hardcoded `rem` insets ignore `--cf-density`; if you keep a rem SoT,
  document that MasterNav `px-2.5`/`w-4`/`gap-1.5` are density-aware and the rem
  twin can drift under `data-density='compact'`. Prefer composing from the same
  Tailwind tokens (`pl-2.5`, `w-4`, …) over magic rem where possible.

---

## Key files

| File | Role |
|---|---|
| [`src/components/layout/header-shell.ts`](../../src/components/layout/header-shell.ts) | `SIDEBAR_TEXT_INSET_LEFT`, `SIDEBAR_RAIL_INSET_X`, `SIDEBAR_RAIL_ROW_PAD_RIGHT`, MasterNav pad/glyph/gap |
| [`src/components/sidebar/rail-shell/RailRow.tsx`](../../src/components/sidebar/rail-shell/RailRow.tsx) | Absolute dots + `SIDEBAR_TEXT_INSET_LEFT` on button ← **primary bug site** |
| [`src/components/sidebar/SidebarRailShell.tsx`](../../src/components/sidebar/SidebarRailShell.tsx) | Eyebrow inset (`SIDEBAR_TEXT_INSET_LEFT` + row pad right) |
| [`src/components/station/scan-bar/tokens.ts`](../../src/components/station/scan-bar/tokens.ts) | Scan icon `left-[2.9375rem]`, input `pl-[4.3125rem]` |
| [`src/components/sidebar/master-nav/MasterNavHeader.tsx`](../../src/components/sidebar/master-nav/MasterNavHeader.tsx) | Live geometry the rem SoT is meant to mirror |
| [`tests/e2e/unbox-siderail-stagger.spec.ts`](../../tests/e2e/unbox-siderail-stagger.spec.ts) | Existing Unboxed rail e2e patterns (`ul[aria-label="Unboxed activity"]`) |

---

## Playwright — extensive geometry suite (required)

Add a **new** desktop-only spec (do not overload the stagger sampler unless
useful). Suggested path:

`tests/e2e/unbox-rail-column-geometry.spec.ts`

### Setup

- `test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only')`
- `page.goto('/unbox')`; wait for `ul[aria-label="Unboxed activity"]` and at
  least one `li[role="option"] button[data-rail-row]` (or
  `li[role="option"]`).
- Prefer measuring via `element.boundingBox()` / `getBoundingClientRect()` in
  `page.evaluate` — not screenshots.
- Tolerate ±2–4px for subpixel / density.

### Helpers (sketch)

```ts
const RAIL = 'ul[aria-label="Unboxed activity"]';

async function measureRailGeometry(page) {
  return page.evaluate((railSel) => {
    const ul = document.querySelector(railSel);
    const btn = ul?.querySelector('button[data-rail-row], li[role="option"] button');
    const eyebrow = ul?.closest('section')?.querySelector('p.text-role-eyebrow');
    const masterLabel = document.querySelector(
      // MasterNav mode label — adjust selector if markup differs
      '[aria-label*="modes" i], button[aria-label*="Close modes" i], button[aria-label*="Open modes" i]',
    );
    // Prefer a stable data attribute if you add one while fixing.
    const dot =
      btn?.querySelector('span.rounded-full.h-2.w-2') ||
      btn?.querySelector('[class*="rounded-full"]');
    const title =
      btn?.querySelector('[class*="flex-1"]') ||
      btn?.querySelector('.min-w-0');
    const scanInput = document.querySelector(
      'form.group input[type="text"]', // StationScanBar on Unbox
    );

    const box = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, top: r.top };
    };

    return {
      sidebarLeft: ul?.getBoundingClientRect().left ?? 0,
      dot: box(dot),
      title: box(title),
      eyebrow: box(eyebrow),
      scanInput: box(scanInput),
      // MasterNav label text node parent — refine in implementation
      masterLabel: box(masterLabel),
      button: box(btn),
    };
  }, RAIL);
}
```

Add a `data-rail-status-dot` / `data-rail-row-title` (and optional
`data-master-nav-label`) while fixing if selectors are fragile — small SoT
hooks beat brittle class scraping.

### Assertions (must-have)

1. **Dot–title canyon closed**  
   `title.left - dot.right` ≤ **12px** (house: `gap-1.5` = 6px + a few px for
   hit-box). Fail loudly if ≥ 24px (today’s ~50px regression).

2. **No dead strip left of dots**  
   `dot.left - button.left` ≤ **16px** (absolute `left-2`/`left-3` or flow
   `pl-2` + centered glyph). Fail if ≥ 32px (old list-host inset bug).

3. **Eyebrow ↔ title column**  
   `|eyebrow.left - title.left|` ≤ **4px**.

4. **Scan input text ↔ title column** (optional but preferred)  
   Measure the input’s content left via `getBoundingClientRect` + computed
   `paddingLeft`, or compare placeholder caret x.  
   `|scanContentLeft - title.left|` ≤ **4px**.

5. **MasterNav label ↔ title** (if selector is stable)  
   `|masterLabel.left - title.left|` ≤ **6px** *or* document a deliberate
   denser rail column and assert against **scan** instead of MasterNav.

6. **Right-edge lock (regression from earlier work)**  
   Selected row: get pencil (`button[aria-label*="Select rows"]` /
   `aria-pressed`) and selected `button[data-rail-row]` ring box;  
   `|pencil.right - selectedButton.right|` ≤ **6px**  
   (after `SIDEBAR_RAIL_ROW_PAD_RIGHT`).

7. **Selected ring clears canvas cutout**  
   Reuse / port the clearance check from
   [`unbox-siderail-stagger.spec.ts`](../../tests/e2e/unbox-siderail-stagger.spec.ts)
   Problem-1 assertion if present — ring right edge stays ≥ ~6px inside the
   work-canvas left, or age text isn’t clipped.

8. **Edit mode**  
   Toggle rail pencil; checkbox appears in the leading track;  
   `title.left - checkbox.right` ≤ **12px** (no canyon reintroduced).

9. **Grouped PKG row** (if a multi-line carton exists in dogfood data; else
   skip with note)  
   Indigo stripe visible; title still within the gap budget vs status dot.

10. **Refetch / remount**  
    Soft navigate or invalidate; re-measure — canyon stays closed (no
    flash-back to `pl-[4.3125rem]`+absolute combo).

### Nice-to-have

- Parametrize density: if the app exposes `data-density`, run the gap assert
  under default + compact.
- Triage rail (`Arrival`) if it shares `SidebarRailShell` + `scanDock` — same
  canyon risk; one shared helper, two describes.

### Run

```bash
npx playwright test tests/e2e/unbox-rail-column-geometry.spec.ts --project=chromium
npm run verify   # before done
```

---

## Done criteria

- [ ] Visual: on `/unbox`, status dots sit immediately before titles (`gap-1.5`
      language); no ~50px hollow between pill and “Bose…” / “Unfound PO”.
- [ ] `UNBOXED` eyebrow still shares the title x with row titles (or a
      documented, tested alternative).
- [ ] Scan placeholder/value still shares that title x (or MasterNav label).
- [ ] Right-edge pencil ↔ blue ring unchanged.
- [ ] No dead strip left of the dots.
- [ ] New Playwright geometry suite green (assertions above).
- [ ] `npm run verify` green; spacing-tokens guard still happy.
- [ ] Worklog entry when the unit is finished.

## Out of scope

- Changing stagger / snapshot reveal behavior.
- Ticket/seller tooltip work (already landed) unless a regression appears.
- Raising DS-ratchet baselines.
