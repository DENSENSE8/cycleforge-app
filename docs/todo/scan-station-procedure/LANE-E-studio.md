# Lane E — Studio: authoring the procedure

**Index:** [`INDEX.md`](./INDEX.md) · inherits **S1 · S2 · S3**
**Owns:** `src/components/studio/**` · `src/lib/workflow/**` · `SURFACE_REGISTRY`
**Starts after:** A-1 + D-2

---

## The job

Studio already **reads** the procedure — `StationProcedurePanel`, `StudioStationPreview`
and `procedureForNodeType` all resolve through `resolveProcedureSteps`, which is exactly
why the reconciliation merge was worth doing. What Studio cannot do is **author** one.
Today a step exists because someone opened a PR.

This lane makes the procedure a definition an owner shapes: which steps their operation
performs, in what order, with which evidence required — behind the Canvas contract's
draft → publish gate.

---

## The line this lane must not cross

> **An owner authors WHICH STEPS EXIST. Never THAT A STEP IS DONE.**

Completion stays derived from facts (S2). This is not a stylistic preference — it is the
lesson that deleted `checklist_templates` and its CRUD on 2026-08-01: *a box got ticked
because someone remembered to tick it, not because the photo existed.* An authoring UI is
one design meeting away from re-creating that, wearing a nicer name.

The second line, from Lane D:

> **An owner cannot delete a step whose gate a server control depends on.**

`arrival_check` reads the evidence `require_one` counts. An org that deletes it has not
turned the control off — it has hidden it, and the operator meets it as a blocked receive
at the end of the carton with no explanation. `authored: false` (A-1) is the enforcement,
and it is a **type-level** ban, not a UI affordance that hides a button.

---

## E-1 — the lens tells the truth about what is authored

Before adding authoring, make the read surface honest about the distinction it is about to
introduce. `ProcedureStep` already carries `composed: true/false` for exactly this reason —
*a map that quietly omits the code-only steps is a worse SOP than a document, because it
reads as complete.*

`authored` is a third state on the same axis, and the lens must draw all three:

| State | Means |
|---|---|
| `composed` | the station registry really drives it |
| code-only | hand-coded UI over a hand-coded route; declared, honest, not editable |
| `authored: false` | structural — a server control depends on it and no org may remove it |

**Ship E-1 alone and look at it.** A Studio lens that renders the real vocabulary across
five registered procedures (A-2) is worth having even if authoring never lands, and it is
the cheapest possible check that A's declarations describe the benches accurately.

---

## E-2 — authoring, behind draft → publish

The Canvas contract already owns this and it must not be re-invented:

- Published definitions are **read-only**. `canManage` + an explicit *Edit as draft*
  creates a draft; mutations flow **up** to the shell, which holds the canonical draft.
- `saveDraft` / `publish` / `discardDraft` (confirm-then-commit) are the only persistence.
- **Per-node lint, not a hard fail.** A malformed procedure surfaces `Diagnostic`s that
  teach the owner what to fix — and publish is gated on them.
- Simulate is a pure client-side dry-run: **zero engine writes**.

### What the diagnostics must catch, at minimum

1. A step whose gate has no writer — an un-completable step, which is the worst possible
   authoring outcome because the bench stalls on it with no explanation.
2. A removed `authored: false` step (should be impossible by type; assert it anyway).
3. A reorder that puts a step before the fact it depends on — `serial` before the unit
   exists, `label` before `contents`.
4. An org policy that makes a step un-completable — the `requiredItemPhotoAspects`
   precedent: a six-shot minimum makes the step unreachable for a two-person reseller.

**Publish is the only place these can be caught.** At the bench it is too late; in a PR
there is no PR.

---

## E-3 — per-org variation, and where it stops

The vocabulary already varies three ways, and two of them are org-shaped:

| Mechanism | Varies by | Exists |
|---|---|---|
| `onlyWhen` / `omitWhen` / `moveBefore` | carton shape (unfound · pickup · return) | yes |
| Settings Registry key | org policy (which item aspects are required) | yes |
| Authored definition | org's own procedure | **this lane** |

**The open question Lane C deferred here:** a *per-SKU* or *per-category* variant means the
procedure depends on data resolved **after** the scan. That is a real change to when the
vocabulary is knowable — the deck currently derives its whole step list at carton open — and
it deserves its own decision rather than arriving as a side effect of authoring.

**Do not build it in E-3.** Write the decision up, name what it costs (a vocabulary that
can change mid-carton, and a deck that must handle its own list changing under the
operator), and get it ruled before anyone builds it. A procedure that re-shapes itself
mid-carton is a scroll surface changing under a hand, which is the thing every other lane
is spending effort to prevent.

---

## Requests to other lanes

- **G:** the `StationDockDef` (G-1). E-3's dock authoring edits that declaration; it must
  not invent a second shape for the same band. **What E may author: which zones a station
  mounts, and which control a step's leading zone shows. What E may NEVER author: the
  composer's write target (a grain decision) or the trailing terminal (an authorable commit
  is an authorable state machine).**
- **A:** `authored` on the step (A-1), and A-2's registered procedures — E-1 has almost
  nothing to render until Testing is declared.
- **D:** the receipt shape (D-2). Studio's preview of a completed procedure reads it rather
  than deriving a second answer.

---

## Do not re-open

- **Completion is derived** (S2). Authoring never touches it.
- **The graph is the map; the inspector is the workspace.** Never crossfade or re-`key` the
  Canvas on a lens change — it destroys the owner's pan/zoom and node identity.
- **Focus/zoom/lens live in the URL**, not `useState` — a Studio view is shareable by
  contract.
- **A procedure is a Station-contract concept.** Do not offer authoring for `ops-queue` or
  `service-workspace` surfaces; they are pointer-driven pick-and-edit, not act-and-clear.
