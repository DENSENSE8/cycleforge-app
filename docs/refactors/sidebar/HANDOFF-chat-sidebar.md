# HANDOFF — Chat on the contextual sidebar: recent sessions, New chat, Chat first

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.
Related: `HANDOFF-sidebar-foundations.md` (roots), `HANDOFF-outbound-sidebar-verify.md`
(sign-in + Playwright probe recipe, "Read first" §4).

---

You are porting the AI chat's sidebar onto the contextual sidebar and moving
Chat to the top of the page map. Rule of this repo's sidebar work: **upgrade the
root, then every page follows.** Chat may only DECLARE data; it gets no sidebar
component, row renderer or styles of its own.

Probe only `http://localhost:3050` (`AGENTS.md`). Do not edit the chat body
(`src/components/session/**`, `src/components/ai/**`, `src/components/composer/**`) —
other sessions own them. Read `node tools/design-mcp/ds.mjs contract "left sidebar"`
and `… contract "sidebar head order"` before touching the host.

## 0. Why now — a regression to close first

On 2026-09-27 the desktop column became ONE host (`ContextualSidebar`, law
`ONE HOST` in `src/design-system/pinned.json`); `MasterNav` / `DashboardSidebar`
survive only in the phone-width drawer. Two Chat features lived ONLY in
MasterNav and are therefore gone from desktop today:

- the **New chat `+`** trailing the Chat row
  (`src/components/sidebar/master-nav/SidebarNavList.tsx:547-560`, dispatches
  `AI_CHAT_NEW_EVENT` then opens `/ai-chat?new=1`);
- the **recent sessions list** under the Chat row while on `/ai-chat`
  (`SidebarNavList.tsx:562-571` → `ChatSessionsNav`,
  `src/components/sidebar/master-nav/ChatSessionsNav.tsx`).

Restore both through the contract. Do NOT remount MasterNav or
`ChatSessionsNav` in the desktop column.

## 1. What exists (reuse, don't rebuild)

| Concern | Existing piece |
|---|---|
| Session list data | `useChatSessions` (`src/lib/assistant/use-chat-sessions.ts`) → `GET /api/ai/chat-sessions` (keyset paged, `nextBefore`) |
| Grouping | `groupSessionsByRecency` (`src/lib/assistant/session-groups.ts`): today · yesterday · week · month · older |
| Titles | `displaySessionTitle` (`src/lib/ai/session-title-text.ts`); live thread title/id from `useSessionHeader` |
| Rename / delete / restore | `useSessionActions` (`src/lib/assistant/use-session-actions.ts`) |
| Sidebar recents slot | `NavContext.recents { endpoint, surface }` → `NavRecentsList`; surfaces in `src/lib/nav/recents/surfaces.ts` (`NavRecentRow`: title · subtitle · status · at · href) |
| Page surfaces | `NAV_PAGE_DECLS` in `src/lib/nav/context/pages.ts` (search, recents, actions) |
| Head order law | ⌘K band → Find `F` → `‹` → modes (`ContextualSidebar` SIDEBAR HEAD ORDER) |
| Find well | `FindField` (`src/design-system/components/FindField.tsx`, rest "Find", hint roll on hover/focus, paste key) |

Chat today: `ai-chat` is an `APP_SIDEBAR_NAV` top row only
(`src/lib/sidebar-navigation.ts:291`), not a `SIDEBAR_PAGE_NAV` page, so
`/ai-chat` resolves `scope: 'top'` — the page map with Chat lit, no panel.

## 2. Decisions to build

### 2.1 Chat first in the page map
- Move the `ai-chat` row to the TOP of the top rows (above Daily) in
  `APP_SIDEBAR_NAV` (`sidebar-navigation.ts:284-291`). The resolver's
  `laneMap` and ⌘K both read that order — no second list.
- Update the pins: `src/lib/nav/command-bar-nav-groups.test.ts:66`
  (`['home','search','ops-photos','plans-live','ai-chat',…]`), any
  `spine-slots` / `sidebar-navigation` test that pins top-row order, and run
  the **Nav names** gate (`pnpm verify:fast`).

### 2.2 Chat gets a page panel (contract)
- Register `ai-chat` as a page the resolver can panel (a `SIDEBAR_PAGE_NAV`
  entry or the resolver's equivalent), `rollout: 'contextual'` in
  `NAV_CONTEXT_ROLLOUT`, parity rows in `NAV_PARITY` for: the New chat verb,
  the session list, rename/delete/restore, load more. `parityGaps('ai-chat')`
  must be empty or `resolve.ts` clamps it back to the map.
- `NAV_PAGE_DECLS['ai-chat']`:
  - `search`: `{ placeholder: 'Search chats', source: 'url-param' | 'desk-store' }`
    — Find narrows the session list (the painted face reads "Find chats").
  - `actions`: `[{ id: 'chat.new', label: 'New chat', intent: 'ai-chat:new' }]`
    (host dispatches `AI_CHAT_NEW_EVENT` + `/ai-chat?new=1`, exactly the old `+`).
  - `recents`: a new surface `assistant.sessions` (adapter source) whose
    endpoint returns `NavRecentRow` built from `/api/ai/chat-sessions`
    (`title` = `displaySessionTitle`, `at` = `updatedAt`, `href` =
    `/ai-chat?session=<id>`), permission `assistant.chat`.

### 2.3 Upgrade the recents ROOT (every recents page gets it)
`NavRecentsList` today is a flat list. Chat needs, and every recents surface
benefits from:
- **recency groups** (hairline + accessible group name, no text heading — the
  NavSectionList category law) via `groupSessionsByRecency`;
- **lit row** = the open record (`?session=` or the live header id), with the
  `NAV_BLOCK_PLATE_CLASS` plate;
- **load more** when the endpoint returns a cursor (extend the recents
  response with an optional `nextBefore`; schema change + resolver test);
- **row menu** (rename · delete · restore with undo) declared per surface
  (`rowActions` on the surface registry), never hard-coded for Chat;
- **the live thread** appears at the top before its first server row lands
  (what `ChatSessionsNav:182-198` does today).

Then delete `ChatSessionsNav` and the Chat branches in `SidebarNavList`
(`:547-571`) once the drawer also runs `ContextualSidebar` — or, if the drawer
stays on MasterNav for now, leave them and say so in the report.

### 2.4 Head and body on `/ai-chat`

```
Pinned head
  [collapse] [🔍 ⌘K Search]
  [🔍 F Find chats            📋]      ← FindField; rolls on hover/focus
  ‹ Chat                               ← back row (title weight, left)
Body
  [+ New chat]                         ← first body row (pressable block)
  ─── (today)
  Fix label printer mapping      ●     ← lit = open session
  Tracking backfill plan
  ─── (yesterday)
  …
  Load more
```

## 3. Guards (add to `src/lib/nav/context/resolve.test.ts` unless noted)
1. Chat is the first top row of the page map for every permission set that
   includes `assistant.chat`.
2. `/ai-chat` resolves `section` + `contextual` with `recents.surface ===
   'assistant.sessions'` and a `chat.new` action; parity gaps empty.
3. The `assistant.sessions` adapter maps a session row to a valid
   `NavRecentRow` (unit test beside the adapter).
4. No component outside `sidebar/contextual/` renders chat session rows on
   desktop (grep test).

## 4. Acceptance (on `:3050`, screenshots of each)
1. Page map: Chat is the first row; ⌘K lists Chat first in pages.
2. `/ai-chat`: panel matches §2.4; New chat opens a fresh thread
   (`/ai-chat?new=1`) and the live thread appears at the top of Today before
   its first reply finishes.
3. Clicking a session opens it and lights it; Find narrows the list.
4. Rename, delete (with undo/restore) work from the row menu.
5. Load more pages older sessions; counts never appear on nav items.
6. Other recents pages (Unbox, Packing, Labels) still render, now grouped.
7. `npx tsc --noEmit -p .` = 0; resolve / recents / sidebar-navigation /
   command-bar-nav-groups tests green; `pnpm verify:fast` green;
   `ds.mjs contract "chat sidebar recent sessions"` returns the updated
   `ContextualSidebar` / recents law.
8. Report: files per decision, probe evidence, screenshots.
