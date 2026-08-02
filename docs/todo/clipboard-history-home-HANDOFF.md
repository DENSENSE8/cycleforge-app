# Handoff — Decide the home for Clipboard history (chrome-altitude D5)

**Copy everything below the line into a fresh Claude Code / Cursor session.**
Repo: `cycleforge-app` · stay on the checkout's branch · attach to the user's
dev server on `:3050` (never start/restart/kill it).
**Do not edit this handoff file** as part of the implementation.

**This is a DECISION first and an implementation second.** The 2026-08-01
chrome-altitude brief ruled *"Clipboard history → command palette only"* (D5).
That ruling was not executed, because the destination it names cannot host the
thing it moves — see *Why D5 stalled* below. Do not implement D5 literally
without re-deciding it.

---

You are an agent in the Cycle Forge monorepo with **fresh context**.

## Mission

Decide where **Clipboard history** lives, then implement that decision and
record it in the SoT. The 2026-08-01 pass got clipboard history *off* the
persistent GlobalHeader rail (that part is settled and should not be reopened);
what is unsettled is which of the remaining homes it should have.

## Prior art — already landed, do not re-build

- **The header rail is down to three icons** — `search · notifications · AI`,
  one per kind (find · be told · ask). Clipboard history, the phone sign-in QR
  and the kiosk preview moved to the spine account overflow
  (`StaffAccountFooter` ⋯). SoT: `.claude/rules/source-of-truth.md` → the
  `Header pin stations` row. **Putting clipboard back on the rail is out of
  scope** — the frequency rule it failed has not changed.
- **Clipboard history works today and is reachable.** Desktop:
  `StaffAccountFooter` ⋯ → *Clipboard history*. Mobile: its own header icon
  (mobile has no spine, so it has no overflow to move into). Nothing is broken;
  this is an altitude question, not a bug.
- Two sibling rulings from the same pass were **rejected on the merits** and
  are the reasoning template here — read them before deciding:
  `InboxQueueLinks.tsx` docblock (D8, spine queue counts) and
  `header-mode.guard.test.ts` → *assistant Sparkles sits far-right* (D3).
  Both were rejected because the proposed destination's **shape** did not match
  the thing being moved. D5 has the same smell.

## Why D5 stalled — the evidence

**The command palette is navigate-only, by construction.** Every row in
`src/components/CommandBar.tsx` resolves to `router.push(item.href)`. Its row
kinds are pages, L2 modes, global-search hits, and an "Ask AI" deep-link —
there is no "run a command in place" affordance anywhere in it.

**A clipboard entry is not one command.** `ClipboardHistoryPopover` gives each
row **three** actions plus a multi-step sub-flow:

| Action | Mechanism |
|---|---|
| Copy again | `copyToClipboard(entry.value, { recordHistory: true, … })` |
| Send to staff | opens `StaffRecipientList` (fetches `/api/auth/staff-picker`), then `POST /api/staff-messages` |
| Remove / Clear | `removeClipboardEntry(id)` / `clearClipboardHistory()` |

So D5 as written asks a one-command-per-row, navigate-only surface to host a
three-action panel with its own selection state. That is the mismatch.

**Do not "fix" this by making the palette navigate to a clipboard page** unless
you are also deciding that clipboard history deserves a route — it has never
had one, and its store is client-side (below).

## What the feature actually is

- **Capture is ambient and high-volume; the panel is the rare part.**
  `copyToClipboard` records history **by default** (`recordHistory !== false`
  in `src/utils/_dom.ts`), and `useCopyChip` records every chip copy — so every
  serial / tracking / FNSKU / order-ID copy across the app lands here. The
  operator fills this constantly without thinking about it and opens the panel
  occasionally. **Weigh the capture and the panel separately**: a rarely-opened
  panel is not a rarely-used feature, and the "frequency" argument that moved it
  off the rail applies to the panel, not to the capture.
- **The store is client-side** (`src/lib/clipboard-history.ts` — `recordCopy` /
  `useClipboardHistory` / `removeClipboardEntry` / `clearClipboardHistory`), so
  history is per-device and does not survive a different browser. Any option
  that implies durability (a route, a shareable surface) is really a *second*
  decision about promoting the store — call that out rather than smuggling it in.

## The options

Pick one, or propose a better one and say why. **A recommendation is required
in the write-up — do not hand back a menu.**

| # | Option | Cost | Trade |
|---|---|---|---|
| **A** | **Leave it in the account overflow** (status quo) | none | Honest and already shipped. But it sits beside phone history / kiosk preview — a *session-setup* neighbourhood — while clipboard is *work* chrome. Two clicks from anywhere. |
| **B** | **Palette LAUNCHES it** — one palette row ("Clipboard history") that opens the existing popover | small | Satisfies D5's intent (the palette is the entry point) without breaking its contract. Needs a row kind that runs a callback instead of an href — the smallest possible version of option C. |
| **C** | **Give the palette real command rows** — a general action-row concept | medium | The principled fix if the palette should own commands at all. Changes an app-global contract; needs its own ruling, and probably more than one consumer to justify it. |
| **D** | **A dedicated chord** (e.g. ⌘⇧V) opening the popover | small–medium | `cmdk-owner.guard.test.ts` is scoped to ⌘K only, so a different chord does not violate it. **But** `useQuickAccessHotkey` is retired and the guard enforces that it stays retired, so this needs fresh single-owner wiring — and the guard also bans advertising a chord you do not own, so the label and the binding must ship together. |
| **E** | **Retire clipboard history** | small | The option nobody lists. Only defensible if the panel is genuinely unused — and note the capture argument above before reaching for it. |

**Starting recommendation (not binding): B, falling back to A.** B is the
smallest change that honours D5's intent, and it keeps the palette's
navigate-only contract intact by making the clipboard panel a *destination the
palette opens* rather than content the palette renders. A is correct if the
answer is "this is fine, stop moving it."

## Hard laws

- **Do not re-add clipboard to the desktop header rail.** Three icons, one per
  kind; a fourth displaces one of them or names a new kind.
- **⌘K has exactly one owner** (`CommandBar`), and no surface may advertise a
  chord it does not bind. Guard: `src/components/layout/cmdk-owner.guard.test.ts`.
- **Compose the existing panel** — `ClipboardHistoryPopover` is the one
  clipboard UI. Do not fork a palette-local list of copies.
- **Mobile keeps its own icon** regardless of what desktop does; it has no spine
  and therefore no overflow.
- **`npm run verify` green** before done; never raise a DS / knip baseline.
- User manages commits; no `git stash`; stay on the checkout's branch.

## Read before writing code

| File | Why |
|---|---|
| `src/components/CommandBar.tsx` | The palette. Note `router.push(item.href)` — the navigate-only contract you must either respect or deliberately change |
| `src/components/layout/cmdk-owner.guard.test.ts` | One ⌘K owner; no lying shortcut labels |
| `src/components/quick-access/ClipboardHistoryPopover.tsx` | The panel + its three actions and the send sub-flow |
| `src/lib/clipboard-history.ts` | The client-side store (`recordCopy` / `useClipboardHistory` / clear) |
| `src/utils/_dom.ts` → `copyToClipboard` | Why history fills passively (`recordHistory` defaults on) |
| `src/components/sidebar/master-nav/StaffAccountFooter.tsx` | Today's desktop home (the ⋯ overflow) |
| `src/components/layout/GlobalHeaderActions.tsx` | The three-icon rail + the mobile-only cluster |
| `.claude/rules/source-of-truth.md` → `Header pin stations` row | The frequency rule and what moved where |
| `src/components/quick-access/InboxQueueLinks.tsx` | Reasoning template: how a same-shaped relocation was decided and recorded |

## Done means

1. A decision, with the reasoning written where the next agent will find it —
   the component docblock plus a line in `.claude/rules/source-of-truth.md`.
   If the answer is **A**, say so explicitly in the SoT so this does not get
   re-litigated a third time.
2. The implementation, if the decision is not A.
3. If a control moved: it is reachable from its new home **and** the old entry
   is gone — no two doors onto one panel (that duplication is exactly what the
   Fields → table-lip migration had to unwind).
4. E2E coverage if a new entry point shipped. Follow
   `tests/e2e/inbox-queue-links.spec.ts` — assert against live state, not
   hardcoded labels, and run `--project=qa-desktop`.
5. `npm run verify` green (note any pre-existing failures from a parallel
   session rather than inheriting them — `.claude/rules/verify.md`).

## Out of scope

- The header rail's composition (settled).
- D3 (assistant → search expand) — **rejected**, see `header-mode.guard.test.ts`.
- D8 (queue counts → spine) — **rejected**, see `InboxQueueLinks.tsx`.
- Promoting the clipboard store to the server. If your chosen option needs
  durability, stop and raise it as its own decision.
