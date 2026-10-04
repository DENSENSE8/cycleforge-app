# Design-system delete and simplification ledger

The machine-readable source of truth is
[`consolidation-ledger.json`](./consolidation-ledger.json). This page explains
how to update it. Root `AGENTS.md`, design-system discovery, and
`pnpm verify:fast` all point to the same ledger.

## The ownership split

- A page owns domain facts: selected records, available verbs, labels, permission
  gates, and mutation handlers.
- The table engine owns contextual placement: selected count, Clear, header
  replacement, and overflow location.
- `RecordActionStrip` owns action ordering and the three-visible-then-`⋮`
  partition. A destructive verb is last and uses `tone: 'danger'`.
- `ArmedDangerButton` owns two-press confirmation. Feature code never creates a
  second timer, armed label, or danger colour.
- The mutation owner provides optimistic remove, rollback, and the exact server
  refusal reason. `AppToaster` already places that feedback bottom-right.

This is why the same table can move to another page without changing its
display: the page supplies contextual data; the shared renderer supplies the
face.

## How to update the list

1. Search before adding: `rg` the intended job and run
   `node tools/design-mcp/ds.mjs contract "<job>" --limit 12`.
2. If a canonical primitive exists, use it. Do not wrap it merely to change
   spacing, ordering, colour, or confirmation behavior.
3. If two implementations still exist, add a `queued` entry to the JSON before
   adding another consumer. Name every `currentPath`, the intended
   `replacementPath`, the problem, and an observable `exitCriteria`.
4. Change the entry to `in_progress` while migrating consumers. Keep the page's
   domain logic local; move only repeated presentation or state-machine logic
   into the canonical component.
5. Prove the replacement in the application at `http://localhost:3050`, run
   `ds_critique` on the changed files, and run `pnpm verify:fast`.
6. After the final consumer is gone, change the entry to `retired`, record the
   `deletedPaths`, and add precise `forbiddenSource` strings. The guard then
   prevents the fork from returning.

Use `exception` only when the interaction is genuinely different, not because
the page has different spacing. State the difference in `problem` and give the
exception an exit criterion so it can be revisited.

## Entry fields

| Field | Meaning |
|---|---|
| `id` | Stable kebab-case identity used in reviews and handoffs. |
| `state` | `queued`, `in_progress`, `exception`, or `retired`. |
| `category` | The capability family, such as `table-actions`. |
| `problem` | The user-visible or architectural inconsistency. |
| `currentPaths` | Existing sources that still own the fork. Required until retired. |
| `replacementPaths` | Canonical components or contracts. They must exist. |
| `exitCriteria` | Observable definition of done, not “clean up later.” |
| `deletedPaths` | Files that must stay absent after retirement. |
| `forbiddenSource` | Exact source strings that must never return under `src/`. |

## Review question

Every new table or destructive action should be answerable in one sentence:

> Which existing component owns this display, and what domain facts am I
> supplying to it?

If the answer is “this page renders it itself,” update the ledger before adding
the component.
