# One entry band — de-fork every "type and send" surface

> **Directive (operator, 2026-08-22):** every bottom entry bubble in the app —
> the warehouse thread composer, the notes entry field, the ticket composer —
> must be ONE component. Remove the forks. This handoff is the scope, the
> inventory, and the acceptance bar.

---

## 1. Why this is one job and not three

Three surfaces let an operator type a message and send it. They were built at
different times against different hosts, so today they are three components
with three insets, three send affordances and three ideas of what "on record"
means. An operator moving between the Unbox bench, `/search` and a ticket is
retraining their hands for the same action three times.

The tell is that **`ThreadPanel` was forking its own entry band on a READING
prop.** Until 2026-08-22 the band read:

```tsx
<div className={cn('… py-3', dense ? 'px-3' : 'px-4')}>
  <ThreadNoteComposer … dense={dense} />
```

`dense` describes how tight the MESSAGE LIST should be — a side panel wants a
tighter read than a full centre column. It has nothing to say about the writing
half, and yet it moved the entry's inset by 4px and flipped the field's density
depending on which host mounted it. That one line is now un-forked (the band is
always `px-3 py-3`, the field always compact) — which fixed the reported
`/search` ↔ Unbox mismatch but is a patch, not the consolidation. **Start here
and finish the job.**

---

## 2. Inventory — what exists today

Run these first; the line numbers below WILL have moved.

```bash
rg -n "ThreadNoteComposer|NoteComposer|ticket.*composer" src --type ts --type tsx
rg -ln "textarea" src/components/threads src/components/support src/components/receiving/workspace
```

| Surface | Entry component | Host | Notes |
|---|---|---|---|
| Warehouse thread | `src/components/threads/ThreadNoteComposer.tsx` | `ThreadPanel` | The most complete: on-record toggle, external submit bridge, error line, `textareaRef`, focus/blur callbacks. **Presumed the base.** |
| Unbox Conversation tab | same, via `SupportContextHub variant="station"` → `SupportContextTeam` → `ThreadPanel dense` | terminal dock | Reaches the composer through three wrappers; verify none of them adds chrome. |
| Notes entry | `rg -n "NoteComposer" src/components/receiving/workspace` — `ShippedNotesComposer`, `NoteComposerInsertRail`, `note-composer-helpers.ts`, `LineNotesCard` | receiving / shipped | Almost certainly the biggest fork. Check whether it has its own send button and its own draft rules. |
| Ticket composer | `rg -n "composer" src/components/support` | support station | Has an external-vs-internal send distinction the thread expresses as "on record" — reconcile the VOCABULARY before the markup. |

Fill this table in for real before writing code. **Do not trust it as written —
it was assembled from grep, not from reading every file.**

---

## 3. The rule the SoT has to encode

- **One band, one inset.** `px-3 py-3`, `border-t border-border-hairline`,
  `bg-surface-card`, `shrink-0`. No host prop moves it.
- **Reading density and writing density are different questions.** A host may
  still tighten the list above. It may not tighten the entry.
- **The send affordance is the same control everywhere**, including its
  keyboard chord and its disabled/loading faces.
- **"On record" is one concept with one label.** If the ticket composer's
  internal/external split is genuinely different, it is a documented VARIANT of
  the one component, not a second component.
- **Capability is absence, not a flag.** A surface that cannot post mounts no
  entry band. Do not add `canPost` to the SoT and render a dead box.

---

## 4. Where it should live

`src/design-system/components/entry-band/` — sibling of
`design-system/components/item-record/`, which is the precedent this repo just
set for exactly this shape of consolidation (a station face lifted out of its
domain, callers reduced to thin adapters).

Copy that pattern deliberately, including its hardest lesson:

> **Do not give the SoT node slots for its own faces.** `ItemRecordRow` takes
> `{label, onClick}` cell affordances, never chip nodes, precisely so no caller
> can paint a different face and call it the same component. The entry band
> wants the same discipline: hosts pass BEHAVIOUR (what send does, what the
> draft is, whether on-record is offered), never markup.

---

## 5. Acceptance

1. `rg -c "border-t border-border-hairline bg-surface-card"` finds exactly one
   entry band definition.
2. Every surface in §2 mounts it; none of them wraps it in corrective padding.
3. Screenshot the Unbox Conversation tab, `/search?sel=order:`, the notes entry
   and the ticket composer at the same viewport. The entry boxes are
   pixel-identical.
4. `npm run verify` green.
5. `tests/e2e/search-station-layout.spec.ts` still passes — it asserts the
   `/search` composer position and is the closest thing to a guard on this.

---

## 6. Explicitly out of scope

- The message list, the connections strip, and the thread header.
- `ThreadPanel`'s data layer — this is a presentation consolidation.
- Adding new capability to any surface. If a fork has a feature the others lack,
  raise it; do not silently grant it to all four.

---

## 7. Read before starting

- `AGENTS.md` — no new house laws, guards or ratchets. If an invariant here is
  worth pinning, pin it as a mounted DOM test or a TS type, never a regex over
  source text.
- `docs/todo/forked-component-hunter-HANDOFF.md` and
  `docs/todo/component-sot-consolidation-HANDOFF.md` — prior art on this exact
  class of work; check whether either already claims part of this scope.
- `src/design-system/components/item-record/` — the worked example.
