# SpaceX topic plate four-edge chrome — HANDOFF

**Created 2026-08-05.** Next agent after the failed “four-edge hairline”
slice that used the wrong border token.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits.

**Verify:** run `npm run verify` before done. Do not raise DS ratchet baselines.

---

## What went wrong (do not repeat)

Operator ask: *“this tabs component should have a hairline for all four
edges”* (Unbox Displays topic plate — Ticket · Photos · … · ⋮).

First pass changed the icon-rail row from:

```ts
border-b border-border-default
```

to:

```ts
border border-border-hairline
```

That matched `TabDisplay` `appearance="segment"` literally, but **failed
visually**. In this DS:

| Token | Light value | Job |
|---|---|---|
| `border-hairline` | `#f1f5f9` (≈ gray-100) | **Near-invisible** internal row/cell dividers |
| `border-default` | `#cbd5e1` | Readable 1px chrome rule (“hairline” in operator speech) |
| `border-soft` | subtle | Canvas / work-edge strokes (`appWorkCanvasEdgeClass`) |

SoT note: [`app-surface.ts`](../../src/design-system/tokens/app-surface.ts) —
do **not** use `border-hairline` for chrome joins; it is for internal
dividers only. Operator “hairline” ≠ token `border-hairline`.

**Symptom in the screenshot:** Ticket cell read as a box with faint
top/left/bottom and a heavy dark right seam (selection underline + cell
divide fighting `border-transparent` / `border-text-default` on all sides).
The outer four-edge frame did not read as a closed instrument plate.

---

## What shipped (this fix — lock these)

In [`SectionTabsSlider.tsx`](../../src/design-system/components/SectionTabsSlider.tsx)
`density="icon"` header row:

| Lock | Class / rule |
|---|---|
| Outer frame | `border border-border-default bg-surface-card` (all four edges) |
| Cell divides | `divide-x divide-border-default` |
| ⋮ peer seam | `border-l border-border-default` |
| Active underline | `border-b-2 border-b-text-default` (**bottom color only**) |
| Idle reserve | `border-b-2 border-b-transparent` (not `border-transparent`) |
| Flush / height | still `-mx-4`, `h-10`, `gap-0` under plate — do not reopen |

Guard: [`tab-display-displays-hosts.guard.test.ts`](../../src/design-system/components/tab-display-displays-hosts.guard.test.ts)
— asserts four-edge `border-border-default`, forbids outer `border-hairline`,
requires `border-b-text-default`.

SoT: [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md)
§ Section tabs.

---

## Smoke check (human)

1. Unbox → open Displays → **Ticket**.
2. Topic plate is a **closed rectangle**: readable 1px on **top, left, bottom,
   and right** (right = after ⋮ / column edge, not only the Ticket|Photos seam).
3. Internal Ticket|Photos|… seams match the outer frame weight.
4. Active Ticket still has a **heavier bottom underline** (`border-b-2`); that
   is selection, not the plate frame.
5. Chat·Claim still sits `gap-0` flush under the plate.

---

## If it still looks wrong

1. **L/R outer edges missing** while T/B show — suspect
   `overflow-hidden` on
   [`ReceivingDisplaysPushStack`](../../src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx)
   clipping the `-mx-4` plate. Fix with inset paint
   (`ring-1 ring-inset ring-border-default`) or restructure so the strip is
   outside the `px-4` host — do **not** go back to `border-hairline`.
2. **Only Ticket looks boxed** — confirm active/idle still use `border-b-*`
   color utilities; all-side `border-transparent` / `border-text-default`
   must not return.
3. Do **not** restyle nested Chat·Claim / New·Link / ScrollSpyNav for this
   bug unless the user asks.

---

## Paste this into a new Claude Code / Cursor session

```
Read docs/todo/spacex-topic-plate-four-edge-HANDOFF.md end-to-end before editing.

CONTEXT
Unbox Displays topic plate (SectionTabsSlider density="icon") needed a
four-edge 1px chrome frame. A prior pass used border-border-hairline — that
token is near-invisible and is wrong for outer chrome. Fix should already be
on the branch:

- Outer: border border-border-default
- Divides: divide-border-default
- Active underline: border-b-text-default (bottom only)
- Guard + station-workbench SoT updated

Lane: attach to :3050; never start/restart/kill the dev server. User owns commits.

GOAL
Smoke Unbox → Displays → Ticket. If the plate is a closed readable rectangle
on all four outer edges, stop. If L/R still clip, apply the overflow/-mx-4
remediation in the handoff — never revert to border-hairline for the outer frame.

HARD LAWS
- Compose from SectionTabsSlider / TabDisplay SoT — no page-local tab fork.
- Operator “hairline” on chrome = border-default (or soft), not border-hairline.
- npm run verify before done; DS ratchets down only.

DO NOT
- Re-open h-10 / -mx-4 / gap-0 host contracts unless a guard fails.
- Soft TabSwitch pills on Displays chrome.
```
