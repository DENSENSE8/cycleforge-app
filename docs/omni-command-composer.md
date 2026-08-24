# Omni-Command Composer

A hybrid of a rich-text editor and a command palette, optimized for high-speed
triage. It is the **permanent find/command waist** of the Warehouse OS HUD —
the one field on the default screen — not a notes/chat composer, and not a
replacement for ⌘K.

**Host:** Warehouse OS feed composer in [`src/shell/AssistantFeed.tsx`](../src/shell/AssistantFeed.tsx),
served on **`:3051`**. The Electron desktop shell attaches to that server
(`pnpm desktop:dev` probes `:3051` then `:3050`). Native is the product (T30).

## 1. Core mechanics

1. **Trigger mapping.** The input is a global listener. Prefix keys halt plain
   text and mount a contextual typeahead:
   - `#` — orders
   - `@` — users (trigger reserved; staff lookup is a follow-on)
   - `/` — actions (same destinations as the ⌘K launcher)
   Bare identifiers (scanner or typed) are the default **order** route — no
   prefix required.
2. **Pattern-based routing.** Real-time regex classifies the token and scopes
   the query. Existing shapes in [`src/utils/order-platform.ts`](../src/utils/order-platform.ts):
   - `/^\d{2}-\d+-\d+$/` → eBay
   - `/^\d{3}-\d+-\d+$/` → Amazon
   - `/^\d{15}$/` → Walmart, `/^\d{4}$/` → Ecwid, `FBA` → FBA

   Cycle Forge does **not** have separate eBay/Amazon tables. Platform is a
   derived property on one orders corpus. Routing **filters/boosts**
   `entity_search_docs` / `/api/orders/lookup`; it does not fan out to
   marketplace-specific tables.
3. **Deterministic auto-commit.** If the query is a **complete identifier** and
   the lookup returns exactly one canonical hit, the raw token mutates into an
   entity chip with no Tab/Enter.

   **Safety rule:** do not auto-commit on unique *prefix* (`04-` matching one
   row). That would race the operator. Auto-commit fires only for a complete
   platform-shaped id, an exact order/tracking/serial match, or a finished
   wedge burst.
4. **Contextual hydration.** The chip stores the full resolved object.
   Hover/click/commit hydrates the feed (summary block) and opens the orders
   tile / inspection payload via `commitIdentifierFind` and
   `dispatchOpenShippedDetails` — not a new navigation scheme.

## 2. Why this shape

- **Unbroken triage flow.** One always-visible composer. The feed stays mounted
  when the right-side inspection panel or a ticket tile is open.
- **Hardware synergy.** A Tera/Zebra wedge burst is indistinguishable from
  instant typing. Auto-commit means a unique scan paints the order with no
  keyboard. Field-scoped wedge detection already lives in
  [`src/hooks/useFindFieldScan.ts`](../src/hooks/useFindFieldScan.ts).
- **Cognitive offloading.** Pattern routing picks the channel; the operator
  never clicks “eBay” first.

## 3. Placement (what this is not)

| Surface | Stays | Why |
|---|---|---|
| ⌘K launcher ([`src/shell/Launcher.tsx`](../src/shell/Launcher.tsx)) | Nav / launch overlay | `/` in the composer reuses the same destinations; it does not steal ⌘K |
| [`OmnichannelComposerDock`](../src/design-system/primitives/OmnichannelComposerDock.tsx) | Notes / Support chat | Different write target; textarea is correct there |
| Warehouse OS Phase 7 “one composer” | Notes collapse (`postThreadMessage`) | This feature is the **find/command waist**, not that phase |

The typeahead is an attached listbox of the same control (combobox), not a
floating instrument near the beam.

## 4. Stack

| Layer | Tool | Role |
|---|---|---|
| Core UI | React + TypeScript | `type: 'text'` vs `type: 'entity_chip'` nodes |
| Editor | Lexical (`lexical` + `@lexical/react`) | Chips + caret. Lazy-loaded into the feed. |
| Search / DB | Existing Postgres + `pg_trgm` | `entity_search_docs` + `/api/orders/lookup`. No new Supabase client. |
| Motion | Instant mount in the well | Warehouse OS M1 — nothing animates geometry. Opacity-only elsewhere. |
| Styling | Shell tokens (`shell.css`) | High-density feed composer; chips fit the well. |

## 5. Electron / `:3051`

The Warehouse OS worktree’s Next server is **`:3051`**. Electron never spawns
it (attach-only).

```
pnpm desktop:dev          # probes http://127.0.0.1:3051 then :3050
ELECTRON_START_URL=…      # pin a host
```

Claude launch entry `warehouse-os-worktree` attaches to `http://localhost:3051`.

## 6. Out of scope

- Reconstructing deleted design-law guards / SoT doctrine
- Collapsing notes composers (Warehouse OS Phase 7)
- New `pg_trgm` indexes or a Supabase SDK
- Starting/restarting the operator’s `:3050` / `:3051` dev server
- `@` staff typeahead (trigger is reserved)
