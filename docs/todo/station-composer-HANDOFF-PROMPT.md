# IMPLEMENTATION PROMPT — Station composer (Unbox dock)

**Paste everything below the horizontal rule into a fresh agent session.**  
Repo: `cycleforge-app` on **`main`**.  
Surface: Unbox-family scan-station dock (`StationComposerHost` via `WorkspaceNotesCard` / `LineNotesCard`) — **not** Warehouse OS `AssistantFeed`, not the in-row PO-line capture composer.

Related (separate): [`po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md`](./po-line-capture-composer-collapse-IMPLEMENTATION-PROMPT.md).

**Next ship (Ticket Telegram UX):** [`station-composer-ticket-telegram-PLAN.md`](./station-composer-ticket-telegram-PLAN.md) · [`station-composer-ticket-telegram-IMPLEMENTATION-PROMPT.md`](./station-composer-ticket-telegram-IMPLEMENTATION-PROMPT.md) · [`station-composer-ticket-telegram-VERIFY.md`](./station-composer-ticket-telegram-VERIFY.md).

---

You are continuing the **station Omnichannel composer** chrome. Most of the anatomy is landed; treat the locks below as **hard rules**, not suggestions. Do not invent a second dock. Work on **`main`** only; operator owns commits; do not restart `:3050` / `usav-dev`.

## Anatomy (locked)

```
┌──────────────────────────────────────────────────┐
│  textarea… (auto-grows with Shift+Enter)         │  ← INSIDE rounded outline
│ [+]                 [Location] [↵?] [Print?]     │     flex-col · action bar bottom
└──────────────────────────────────────────────────┘
[ Unbox ] [ Ticket ]                        ( ◠ )   ← BELOW outline (HARD RULE)
```

| Zone | Owns | Never |
|------|------|--------|
| **Inside outline** | Column shell: auto-grow textarea on top; bottom action bar with `+` left and **Location** / gray Enter / Print·Receive right (`justify-between`) | Mode faces, procedure ring, blue Enter bubble, separate ⓘ, dropdown, single-row `items-center` layout |
| **Below outline** | **Unbox + Ticket** clustered leftmost (icon always left of label); `ScanStationProgressRing` far right | Anything that belongs in the bordered shell |

**Hard rule:** mode faces + procedure ring live **only** below the composer outline. The bordered shell is always `flex-col` — never a single horizontal axis for + / field / CTAs.

## Face locks

1. **Modes = Unbox | Ticket only.** Default = Unbox. Legacy `?composerMode=label` aliases to Unbox. Location is a pill inside the outline — not a mode.
2. **No mode dropdown** — both faces always shown under the outline, leftmost cluster.
3. **Unbox glyph** = `PackageOpen` + `text-blue-600`. **Ticket glyph** = `text-orange-500`.
4. **Enter** = bare gray icon; on Unbox with Print, Enter is condensed into Print.
5. **ⓘ** folded into the procedure ring.
6. Cycle `Ctrl+Tab`; jump `⌥1` Unbox / `⌥2` Ticket; Shift+Tab refused.


## Key files

| Path | Role |
|------|------|
| `src/components/composer/StationComposerHost.tsx` | Host: dock + below-outline mode row |
| `src/components/composer/ComposerModeRow.tsx` | Mode trigger + procedure ring (below outline) |
| `src/components/composer/useStationComposerMode.ts` | URL + session mode |
| `src/lib/composer/station-composer-mode.ts` | Modes, cycle, key classifier, placeholders |
| `src/components/station/ScanStationProgressRing.tsx` | Procedure progress ring (ported back) |
| `src/design-system/primitives/OmnichannelComposerDock.tsx` | Shell; compact grow; gray Enter when `commitGlyph="enter"` |
| `src/design-system/tokens/dock-clearance.ts` | Shared float bottom pad |
| `src/design-system/tokens/radius.ts` | `COMPOSER_SHELL_CORNER` |
| `src/components/receiving/workspace/line-edit/LineNotesCard.tsx` | Wires insert tools, ticket/location, ring click (Info folded in) |
| `src/components/receiving/workspace/line-edit/WorkspaceNotesCard.tsx` | Station adapter |
| `src/components/receiving/workspace/LineEditPanel.tsx` | Procedure %, checklist open, Print trailing |
| `src/components/composer/StationTicketPane.tsx` | Ticket middle above dock |
| `src/components/composer/ComposerTicketContextTools.tsx` | Ticket chips / what-happened |
| `src/components/composer/ComposerContextRing.tsx` | Legacy hollow session ring — **do not** put back on the station mode row |

Tests: `src/components/composer/composer-mode-row.test.tsx`, `src/lib/composer/station-composer-mode.test.ts`.

## Done when (verify this session’s work / next polish)

- [ ] Visual: one rounded field row; mode + ring **below** outline only; nearly flush to screen bottom (no fat dead pad).
- [ ] Ticket mode: orange ticket icon; gray Enter (no blue pill); no ⓘ in the field; ring far-right below opens right rail.
- [ ] Notes mode: Print·Receive owns trailing; Enter key still commits print+receive; ring fill moves as steps complete.
- [ ] Field auto-grows on Shift+Enter / wrap; `+` and Print stay on the last line (`items-end`).
- [ ] `npm run verify` (or `verify:fast` in the inner loop) green.
- [ ] Browser Unbox signed-in smoke: Notes / Ticket / Location cycle; ring opens checklist Displays.

## Likely next polish (only if operator asks)

- Align placeholder vertically with `+` / Print on the compact row (optical baseline).
- Ring click matrix: checklist vs Timeline vs replay `headerAction` precedence (today Info jobs fold into ring in `LineNotesCard`).
- Testing / Arrival parity if they share `WorkspaceNotesCard` without procedure %.
- Do **not** reintroduce mode/ring inside the outline.

## Non-goals

- In-row PO-line Serial capture composer (other prompt)
- Warehouse OS `AssistantFeed` Lexical port
- Pack / Shipping / `/support` Omnichannel forks
- Creating a branch; committing without being asked; restarting `:3050` / `usav-dev`
- Re-adding house-law regex guards over source text

## Interaction budget

Primary info ≤ 2 interactions from page open; primary action ≤ 3 (confirmation included). Mode switch via `Ctrl+Tab` / ⌥N counts as one. Deep-link `?composerMode=` preferred over nested modals.
