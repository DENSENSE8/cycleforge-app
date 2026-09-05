# PLAN — floating AI composer circle (mobile-first)

**Status: LIVE in code** (`AssistantFabHost`). Iterated 2026-09-02 from the
desk-Ask brief (table-foot button) after the operator ruled: **one circle,
every route, closed and open.**

## Ruling

A **floating circular control** is the assistant door on every signed-in,
`assistant.chat` surface — desks, scan stations, Studio, mobile.

| State | What the operator sees |
|---|---|
| **Closed** | One primary circle, Sparkles, bottom-right, thumb reach, safe-area |
| **Open** | The **same circle in the same corner**, now the open latch (X). The chat + context + `StationComposerHost` stack grows **up and left** from that corner |

⌘J and the header Sparkles still toggle the **same** `AssistantProvider` open
state. They do not mount a second mouth.

## What this is not

- Not a second Unbox/scan `StationComposerHost`. Floor mouths stay on the bench.
  The FAB Ask host is the **assistant** (questions / triage). Displays still
  dispatch `ASSISTANT_DOCK_CLOSE_EVENT` so Ticket/Displays and Ask do not fight.
- Not `RightRailHost` `id: 'assistant'`. That geometry was a full-height desktop
  column. The circle is the geometry on every breakpoint (Q5: keep the table).
- Not `TicketComposer`. Zendesk stays Ticket mode on the station host.
- Not a Dialog, not a FAB hex fork, not `FilterRefinementBar`.
- Not overlay-cohort. Do not append this to `SCAN_STATION_OVERLAY_COHORT`.

## Stack (open)

1. Read-only **context plate** (`PageContextSection` — what the model can see)
2. **Thread** + edits tray
3. **`StationComposerHost`** `showModeFaces={false}`, `chrome="raised"`,
   `forceMode="unbox"` so Send stays on the dock

Portal via **`Layer`** (`level="fab"` closed / `panel` open). Circle:
`IconButton` `size="touch"` `radius="pill"` + `BUTTON_VARIANTS.primary`.
Open card: `COMPOSER_SHELL_CORNER` + `elevationClass('overlay')`. No
`overflow-hidden` on the card (shears the dock shadow).

## Eval

- Mouth adapter: `pnpm run eval:station scan-out` if the host props change
- Machine gate: `cursor-eval --fast`
- Do not fold Queue/Viewed/History; do not delete overlay `visibility` /
  `zIndex.panel`
