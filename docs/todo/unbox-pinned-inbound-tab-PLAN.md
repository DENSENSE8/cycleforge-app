# Unbox pinned Inbound list tab

**Status:** Landed (Phase 0–1) + Hardened (S1–S5) 2026-08-07  
**Created:** 2026-08-06  
**Landed:** 2026-08-07  
**Surface:** `/unbox` (Station + Workbench strip)  
**Harden:** [`unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md`](./unbox-pin-pattern-harden-CLAUDE-CODE-PROMPT.md)

## Hardening applied (2026-08-07)

- **S1** Leading `+` → **pushpin** (`Pin`) + "Pin list" copy + tooltip; testid `unbox-add-list` → `unbox-pin-list` (D6 · D12 · C14).
- **S2** Band-1 extras hard-capped at `UNBOX_PINNED_EXTRA_TABS_MAX = 2` — enforced in `sanitizeUnboxPinnedExtraTabs`, the pin write path, the popover (disabled rows + caption), and the prefs Zod (D2 · D14).
- **S3** Embed uses its own **`incoming_embed`** column-prefs bucket, split from the `/incoming` desk (`incoming`) — hiding a column on the Unbox Inbound tab no longer touches `/incoming` (D13).
- **S4** Embed stays triage-only — mounts `IncomingGridView` directly, never the desk header / `IncomingChromeActions` (Check·Import·Add). Guarded (D8 · C10).
- **S5** Org + per-role defaults (Settings → Receiving → Organization policy). Org default = registry toggle `receiving.unboxDefaultPinnedExtraTabs`; **per-role** = one advanced `select` (Inherit · Pinned · Not pinned) per role → flat keys `receiving.unboxDefaultPinnedByRole.<role>`. Resolve order **staff → role → org → []** in `unbox-default-pins.ts` (absent = inherit, `[]` = staff cleared), folded server-side in `/api/staff-preferences` GET. (D9 fully shipped.)

## Goal

On `/unbox`, a leading **Plus** opens a **small popover** to pin **Inbound** as an
extra Band-1 tab. That tab shows the existing Incoming Pipeline grid (same APIs +
`tableColumns.incoming` prefs) without leaving Unbox. Return-to-scan **Unbox** CTA
stays as today.

## UI contract (locked)

| Job | UI | Why |
|---|---|---|
| Add / pin a list | Leading **Plus popover** (`text-role-caption` / eyebrow) | Closed catalog of 1 item; ephemeral pick |
| Column show/hide | Existing **▦ → `GridColumnDetailsPanel`** | Prefs in `staff_preferences.tableColumns.incoming` |
| Row / PO detail | Existing **right rail** Incoming details | Already wired via `useReceivingDetailOverlays` |

Do not put catalog pick or column editing in the same surface.

```text
Plus popover → staff_preferences.unboxPinnedExtraTabs
            → Unbox Band-1 (pinned Inbound after system tabs)
            → ?unboxview=incoming → IncomingGridView (embedded)
            → tableId "incoming" + IncomingDetailsPanel rail
            → Unbox CTA → resume scan
```

## Why this mounts cleanly

`resolveTableMode` on `/unbox` goes through `resolveUnboxReceivingTableMode`.
Embedded `ReceivingLinesTable` historically always used `tableId="receiving"` —
the Incoming branch was `/incoming`-only. Mapping the tab to mode `incoming` is
necessary; the **embedded** path must also render `IncomingGridView` with
`tableId="incoming"` (Unbox owns Band-1 — no `IncomingWorkspaceHeader`).

## Phases

### Phase 0 — URL + embedded Incoming body

1. Extend `UnboxWorkspaceTab` with `incoming` (URL `?unboxview=incoming`); keep it
   out of `UNBOX_WORKSPACE_TABS` until pinned.
2. `resolveUnboxReceivingTableMode('incoming')` → `'incoming'`.
3. Embedded + incoming → `IncomingGridView` + `tableId="incoming"`; portal ▦ into
   Unbox Band-3 slot.
4. Deep link `/unbox?unboxview=incoming` works without a pin.

### Phase 1 — Plus popover + staff pin prefs

1. Catalog SoT: `src/lib/receiving/unbox-extra-tabs.ts` (Inbound only).
2. Prefs: `unboxPinnedExtraTabs: ('incoming')[]` on staff-preferences PUT body.
3. Plus popover + strip pin/unpin in `UnboxWorkspaceHeader`.

## Backend

| Concern | Storage / API |
|---|---|
| Pins | `staff_preferences.unboxPinnedExtraTabs` (JSONB, no migration) |
| Columns | Own `tableColumns.incoming_embed` bucket (split from `/incoming`, D13) |
| List | Receiving-lines `view=incoming` via mode descriptor |
| Details | `/api/receiving-lines/incoming/details` |

Not `saved_views` — strip membership ≠ facet views
(`.claude/rules/display/workbench-ops-queue.md`).

## Non-goals

- Home Inbox host
- Custom / tenant-authored tables
- Docked lane inside Unbox embed (Pipeline only)
- Check / Import / Add CTAs on Unbox Inbound tab
- Arrival / Pack rollouts
- ~~Org default pin templates~~ — shipped in S5 (org toggle + per-role select rows)

## Key files

- `src/utils/unbox-workspace-state.ts`
- `src/lib/receiving/receiving-modes.ts`
- `src/lib/receiving/unbox-extra-tabs.ts`
- `src/components/station/ReceivingLinesTable.tsx`
- `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx`
- `src/components/receiving/unbox/UnboxAddListPopover.tsx`
- `src/lib/schemas/staff-preferences.ts`
