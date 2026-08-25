# PLAN — the composer's contextual modes

**Status: PLAN, awaiting the operator's ruling. Nothing below is built.**

Written 2026-08-25 against the ruling in
[`HANDOFF-session-composer-ux.md`](HANDOFF-session-composer-ux.md) §8:

> "The composer would need to be comprehensively detailed, planned out,
> contextually based modes — not tools beneath the composer."

What is ALREADY done from that ruling: the `ToolsCombobox` row under the
field is deleted (tools live on the right rail and behind the beam's `⋯`,
per §5), and the row below the field carries only the context ring until
this plan is ruled on. Related queued task on the same commit path:
[`HANDOFF-order-in-composer.md`](HANDOFF-order-in-composer.md) — with no
session armed, an order search embeds in the composer instead of opening
tiles. Laws that bind everything here: **I4** (the
placeholder names the destination), **I5** (both axes of the 2×2 stay
modelled), **I8** (one composer, ever), **M1** (mode switches are
conditional renders, never tweens).

---

## 1 · The premise: a mode is DERIVED, never picked

The composer is the one input for everything (I8). What changes with
context is not the field — it is **what the field's contents mean and
where they land**. So a "mode" here is not a selector the operator sets;
it is a fact the shell already knows, and the row's whole job is to SAY
that fact where the operator's eyes already are (I4's argument, extended
from the placeholder to the row beneath it).

A picker would be a second mouth: the operator would have to keep it in
agreement with the shell state that already decides routing
(`onComposerCommit`'s precedence). Mode error is prevented by naming the
destination, not by memory — and not by a dropdown either.

## 2 · The honest map is TWO AXES, not four modes

Walking the four contexts the handoff names (scan-armed session · order
write-target · queue focus · no session) against the code, they do not
stack into four exclusive modes — they are two independent questions:

**Axis A — where does a SCAN land?** (the wedge path)

| Shell state | Destination | Row says |
|---|---|---|
| A block is armed | The armed block (its `SessionHeader` sits directly above the field) | nothing extra — the session header IS the readout |
| Nothing armed | Chip/typeahead lookup only; no session receives it | nothing — "no session" is the header's absence |

**Axis B — where does PROSE go?** (the words path, today's
`onComposerCommit` precedence, top wins)

| Prose shape / state | Destination | Placeholder (I4) |
|---|---|---|
| `filter: …` prefix | Narrows the focused (or only) filterable tile; bare `filter:` clears | — (the prefix IS the mode; the queue tile shows the readout chip) |
| An order write-target is set | Internal note on that order | `Note on #…8842 — ✕ returns prose to the assistant` |
| Otherwise | The assistant | `Message the assistant — # order · / action · filter: narrows` |

The two axes are fully independent: armed + write-target is a legal and
common state (scanning units while commenting on the order), and the
current code already routes it correctly. **Four modes would be a lie
about the state space; two axes with three prose destinations is the
truth.** (This is the handoff's own "fight this brief" §3 case: the map
collapses, and the small thing is what should ship.)

## 3 · What the row actually renders

One row, three slots, all derived, all conditional renders:

```
[ write-target chip (when set) ]  [ manual-scan toggle (armed only) ]  … [ context ring ]
```

1. **The write-target chip MOVES DOWN into this row** from its current
   perch above the field. It is the prose-destination readout, and the
   destination readout is exactly what this row is for. Its `✕` keeps
   releasing prose back to the assistant. (One row fewer above the field;
   the composer block becomes header · field · mode row.)
2. **The one real toggle: I5's `input` axis** (`auto | key`). `key` means
   "my typing counts as a scan" — hand-entering a damaged barcode into the
   armed session. It renders ONLY while a block is armed (there is no
   session to hand-enter into otherwise) and is the single genuine mode
   the operator can set. Placement here, not in the beam: it changes what
   the FIELD does. The `action` axis (`search | filter`) stays expressed
   through the `filter:` grammar rather than a toggle — a prefix you can
   see beats a latched state you must remember, which is I4 again.
3. **The context ring stays** at the right end, unchanged.

Nothing tool-shaped appears anywhere in the row, in any state.

## 4 · Placeholder per state (I4, the destination named)

| State | Placeholder |
|---|---|
| No session, no target | `Message the assistant — # order · / action` |
| Armed, no target | `Scan or type — scans land in <session title>` |
| Armed + manual (`key`) | `Hand-enter a barcode — it counts as a scan` |
| Write-target set | `Note on #<last-8> — prose lands on this order` |

(The `filter:` prefix needs no placeholder state — the operator is
already typing it.)

## 5 · Build cost and order

Small, and strictly after the ruling:

1. Move the write-target chip into the row (JSX move, no state change).
2. Add `scanMode.input` toggle to the row, armed-only; wire `key` mode
   into the field's scan claim path (`useFindFieldScan` already stamps
   sources — `key` mode treats a human submit as a scan commit).
3. Placeholder switching in `OmniCommandComposer` from the same derived
   facts.

## 6 · Open questions for the operator

1. **Does the write-target chip move down** into the mode row (this
   plan), or stay above the field where it is today?
2. **`filter:` visibility** — while a filter is live, the queue tile shows
   its readout chip. Does the composer row ALSO need a "filtering Orders"
   fact, or is one readout enough? (This plan says one is enough — the
   tile is where the narrowing is visible.)
3. **The manual-scan toggle's face** — a small `auto | key` segment, or a
   single `key` latch that reads "typing = scan" while active?
