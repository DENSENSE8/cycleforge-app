# Unbox push-column close `→|` — column alignment — **RESOLVED 2026-08-02**

The `→|` was **~8px right of the gutter** on three of the four push occupants,
and ~8px right of the display card's own left border on the fourth. The E2E that
asserted alignment was correct about what it measured and measured the wrong two
things. Both are fixed and pinned.

Keep this file until the doc catalog is regenerated; it is the record of why the
band's padding is `pl-2` and not `px-4`.

---

## Paste this into a new session

> Read `docs/todo/unbox-push-close-column-alignment-HANDOFF.md`. The `→|`
> alignment is **RESOLVED and pinned** — do not re-open it, and do not "tidy"
> `UNBOX_PUSH_TOP_BAND` back to `px-4` or drop `-ml-2` from
> `DISPLAYS_STRIP_HEADER_CLASS`. The band is deliberately the one row in the
> column that is not `px-4`: a glyph in a 28px box whose BOX sits on the content
> edge draws its MARK ~9px inside it (`source-of-truth.md` → Right-rail modality
> → the band's `→|` sits on the occupant's CONTENT gutter).
>
> Only two things are genuinely open, and neither is required:
>
> 1. **§4 — the right side.** `-mr-4` chases the ring, and the ⋮ and the ring
>    can never share an INK column (dot-column glyph vs a glyph that fills its
>    box). They agree only as svg boxes. Deciding whether the ⋮ should instead
>    return to the content gutter is a **separate ruling** and needs the
>    operator, because §5's "the ring cannot move" still stands.
> 2. **The Ticket occupant was never measured in the runner.** Claim and the
>    tool bodies were; Ticket was reasoned about **from source only**, because
>    the fixture cannot link a ticket. `SupportChatHeader` compact is
>    `px-2.5 py-1.5` (verified), so its content edge is ~11 against the band's
>    17, and an avatar's ink IS its box. The fix strictly improves it (25→17
>    against 11, so 14px off → 6px) but does not land it. Either measure it and
>    close the last 6px, or rule that the Ticket header should adopt the
>    column's `px-4` gutter like the other three — the second is the better
>    shape, since `px-2.5` is Support-chat density leaking into a station column.
>
> Also still open and untouched by this work: the pre-existing
> `unbox-displays-column.spec.ts:113` failure (waits for
> `unbox-push-expand-strip`, which needs `ticketId != null`; the fixture creates
> a bare carton). Left deliberately — deleting the assertion would destroy the
> signal if ticket-linking has genuinely broken.
>
> Verify on `:3050` — **attach, never start/restart/kill** — and assert on the
> QA org (`--project=qa-desktop`).

---

## 1. The answer to §3 (the open question)

**Two blind spots, one root cause.**

**Root cause — a box on the gutter is not a mark on the gutter.** The band put
its BOX on the `px-4` content edge. That arithmetic was right and the reference
was wrong: an `sm` (28px) `IconButton` around a 14px glyph insets its box by 7px,
and a lucide glyph draws ~2px inside its own viewBox, so the mark the operator
sees landed **~9px right of the gutter the box was sitting on**. Everything an
occupant puts under that band — a heading, an avatar, a card border — is ink AT
the gutter, because for text and borders box *is* ink.

**Blind spot 1 — the wrong occupant (this was §3B, and it was the live one).**
Displays is the only one of the four whose first row is *also* a glyph in a box
(`ICON_CELL_COMPACT_CLASS`, 26px around 14px). It was indented by the same ~8px,
so the two rows agreed with each other while **both missed the card border below
them**. The band lives in the shared shell, so it shipped tuned to the single
surface where the defect cancels — and Displays was the only surface anyone
measured.

**Blind spot 2 — boxes, not ink (this was §3A.1, and it was bigger than "real
but sub-pixel").** The spec read `getBoundingClientRect()` on the `<svg>`, which
is the 14px element box. §3A was right that the glyph-source asymmetry is
sub-pixel; what it missed is that the *control padding* is not. The two stack.

Measured @1440, 420px column. Gutter = 1px surface border + `px-4` = **17**.

| Mark | box | **glyph ink** |
|---|---|---|
| `→|` — before (`px-4`) | 16 | **25.0** |
| `→|` — after (`pl-2`) | 8 | **17.0** |
| Displays first tab — before | 17 | **24.2** |
| Displays first tab — after (`-ml-2`) | 9 | **16.2** |
| Claim's "FILE A CLAIM" heading | 17 | **17.0** |
| Displays' body card border | 17 | **17.0** |

Before, on Claim: `→|` at 25.0 over a heading at 17.0 — visible at 1×, obvious at
3×. On Ticket (`SupportChatHeader`, `px-2.5` + an avatar, whose ink is its box)
the gap was wider still.

## 2. The fix

| Change | File |
|---|---|
| Band `px-4` → **`pl-2` pr-4** — the 8px is the control's optical inset, and `pl-2` is density-aware so it tracks the box it corrects for | `UnboxPushColumn.tsx` (`UNBOX_PUSH_TOP_BAND`) |
| Strip `-mr-4` → **`-ml-2` -mr-4** — the strip pays the same 8px so the two rows stay together | `ReceivingDisplaysPushStack.tsx` (`DISPLAYS_STRIP_HEADER_CLASS`) |

`-ml-px` **survives and its job is unchanged**: it reconciles the shell's 28px
control with the strip's 26px cell, which `IconButton` has no size to express.
Both now resolve onto the gutter within a pixel.

**The trade, stated:** the button's box — and the selected tab's
`bg-surface-sunken` wash — now overhang the gutter by 8px. That is the point,
and it is the same trade the trailing `-mr-4` already made: **a hit box may
bleed past the content edge; the mark the operator reads may not sit off it.**

## 3. What pins it

- `tests/e2e/unbox-displays-column.spec.ts` → **"the shell band's dismiss sits on
  the occupant's own content gutter"** — measures **ink** (`getBBox()` less half
  the stroke, scaled) against the occupant's first heading, **on Claim, not
  Displays**. Verified to fail on the old geometry with the exact numbers
  (`→| ink 25.0` vs `"File a claim" 17.0`) and pass after. 2px tolerance: the
  gutter is shared by a stroked glyph, a text box and a 1px border.
- The existing *"both header rows share the same left and right gutter columns"*
  test is unchanged and still green — its docblock now says plainly that it
  measures svg **boxes** on **one** occupant, and that believing it was
  sufficient is what let this ship.

Guard `unbox-right-edge-chrome.guard.test.ts`: 18/18 green (it never pinned the
band's padding).

## 4. Not changed — and why

- **The right side.** `-mr-4` stays. Worth recording for whoever reads this next:
  the ⋮ and the ring **can never share an ink column**. `MoreVertical` is a
  3.5-unit dot column in a 24 viewBox (ink 12.7 from the edge); the ring's glyph
  nearly fills its box (ink 7.0). No gutter reconciles them — they matched only
  as svg boxes. Re-opening that is a separate ruling, and §5's "the ring cannot
  move" still holds.
- **§3C density.** `pl-2` / `-ml-2` are scale tokens, so the correction now
  tracks `--cf-density` instead of drifting. Only the 1px `-ml-px` is fixed, and
  a 1px error is what it exists to remove.

## 5. Repo state

`npm run verify` is still red from **other lanes** (unchanged from the previous
handoff: `OrdersGridView`/`LedgerGridSurface` typecheck against a mid-edit
`GridColumnDetailsTrigger`, `WorkbenchTrailingCluster`/`SidebarNavList` unit,
Support-lane knip, stale doc catalog). Lint + typecheck + the spacing guard are
clean on the files this work touched.

`tests/e2e/unbox-displays-column.spec.ts` runs **10/11**. The one failure is the
same pre-existing `:113` case the previous handoff documented — it waits for
`unbox-push-expand-strip`, which requires `ticketId != null`, and the fixture
creates a bare carton. Still left deliberately.
