/**
 * The compound row's fixed geometry — ONE display method, no operator setting.
 *
 * The two-row cell is deliberately not adjustable right now: getting every
 * table onto one layout is the job, and a density control multiplies the states
 * each surface has to be verified in. The repo already carries a
 * `table-density` SoT (`comfortable`/`compact`) for the FLAT rows; wiring the
 * compound row to it is a later pass, and when it happens these constants are
 * the single place that has to learn about it.
 *
 * Why px constants rather than Tailwind classes: three consumers must agree on
 * the row box or the grid tears — the cell's height (paint), the gutter cells'
 * full-bleed contents, and `LedgerGrid`'s `rowEstimate` (the virtualizer's
 * scroll math). A class string can only answer the first.
 */

/** Row box in px — the compound cell's height and the virtualizer estimate. */
export const COMPOUND_ROW_PX = 48;

/**
 * Expanded leaf = product row + detail band (two {@link COMPOUND_ROW_PX} boxes).
 * Idle compound face stays 48; only the inserted detail leaf adds the second 48.
 * Callers: CompoundRowDetailBand / VirtualGroupedSections estimate when open.
 */
export const COMPOUND_ROW_DETAIL_EXPANDED_PX = COMPOUND_ROW_PX * 2;

/**
 * The GUTTER track — `select` and `thumb` — in rem. **A SQUARE of the row box.**
 *
 * The PHOTO gutter. This was one constant for both gutters until 2026-09-04,
 * when the select track shrank to {@link COMPOUND_SELECT_TRACK_REM} — see there
 * for why the equality was retired rather than broken by accident.
 *
 * **Why 3rem and not 4.** It is {@link COMPOUND_ROW_PX} expressed in rem, so
 * each gutter cell is 48×48 and a square source photo fills it corner to corner
 * with nothing cropped. A wider track would make the cell 64×48, and
 * `object-cover` would then quietly eat ~25% off the top and bottom of every
 * product photo — which is the opposite of showing the operator more of it.
 *
 * **Not operator-resizable.** The data tracks beside it stay draggable; the two
 * gutters are chrome.
 */
export const COMPOUND_GUTTER_TRACK_REM = COMPOUND_ROW_PX / 16;

/**
 * The SELECT gutter — narrower than the photo gutter, and deliberately not a
 * square.
 *
 * ## Why it split from {@link COMPOUND_GUTTER_TRACK_REM} (2026-09-04)
 *
 * The two gutters were one constant because they were doing the same visual
 * job: two full-bleed 48px squares, a checkmark column and a photo column, and
 * neighbouring tracks doing the same job at different widths read as a mistake.
 *
 * They stopped doing the same job. The photo is still content that gains from
 * every pixel — 48×48 is what lets a square source fill the cell with nothing
 * cropped by `object-cover`. The select gutter now holds a 16px control that
 * appears on row hover, and a 16px mark centred in a 48px track is 16px of
 * padding on each side: three times the control's own width, spent on the
 * column an operator's eye passes first. Operator 2026-09-04: smaller in width,
 * not a box or square, hard against the left edge with minimal padding.
 *
 * **1.5rem = 24px**: the 16px face plus 4px of slack a side — the least a
 * bordered control can take without its box touching the table's edge on one
 * side and the photo on the other. The cell keeps ZERO inset of its own
 * (`inset: 'none'`); those 4px are centring slack in the track, not padding.
 *
 * Still not operator-resizable — `isGridColumnResizable` refuses `select`
 * unconditionally. It is a fixed control, not content.
 */
export const COMPOUND_SELECT_TRACK_REM = 1.5;

/**
 * The leading edge RAIL — width, and the matching inset for everything that
 * centres beside it.
 *
 * The rail is chrome painted ON the select gutter (`CompoundEdgeRail`), so a
 * control centred in the raw 24px track is not centred in the track an
 * operator can actually SEE: with 4px of slack a side, a 3px bar leaves 1px on
 * the left and 4px on the right, and the mark reads as shoved against the bar.
 * Measured 2026-09-15 on a marked row: 16px square at 2px from the rail, 5px
 * from the right edge. Operator: "displayed centered in the middle".
 *
 * So gutter CONTENT — the check, the resting status glyph, the detail chevron —
 * insets by the rail's own width and centres HORIZONTALLY in what is left.
 * Applied on EVERY row, marked or not: a 3px shift that only happened on urgent
 * rows would make the column of marks jitter, and a straight read down that
 * column is the reason the gutter exists. VERTICALLY the mark is pinned to the
 * top — see {@link COMPOUND_GUTTER_MARK_TOP_PIN_CLASS}.
 *
 * Two exports, one number: the bar paints {@link COMPOUND_EDGE_RAIL_CLASS} and
 * the content reserves {@link COMPOUND_GUTTER_RAIL_INSET_CLASS}. Arbitrary
 * values rather than a spacing token because this is not a spacing CHOICE — it
 * is one measurement, used twice, and a 2px or 4px token would put the bar and
 * the gap back out of agreement.
 */
export const COMPOUND_EDGE_RAIL_CLASS = 'w-[3px]';
export const COMPOUND_GUTTER_RAIL_INSET_CLASS = 'pl-[3px]';

/**
 * The MARK's vertical pin: the checklist square and the resting status glyph
 * sit at the TOP of the select gutter, 4px off the row's top edge.
 *
 * This is the 2026-09-04 ruling ("most top of the column per rows") and it was
 * NOT retired. A 2026-09-15 pass read "displayed centered in the middle" as the
 * middle of the 48px row and floated the mark there; the operator's correction
 * is explicit — the checklist icon is pinned to the top and the drop-down sits
 * BELOW it. "Centered in the middle" was about the horizontal track (see
 * {@link COMPOUND_GUTTER_RAIL_INSET_CLASS}), which is why the same words also
 * produced a 3px rail inset.
 *
 * 4px (`pt-1`, spacingScale.1) is the same slack the narrow select track
 * already budgets horizontally, so the 16px square does not sit on the row
 * rule. One constant for both faces: the square and the status glyph share the
 * box and swap on reach, so a 1px disagreement in their pin would make the
 * glyph jump under the pointer. Measured: both land on cy = rowTop + 12.
 */
export const COMPOUND_GUTTER_MARK_TOP_PIN_CLASS = 'items-start pt-1';

/**
 * The CHEVRON BAND — the detail / fold affordance's own track, the bottom HALF
 * of the select gutter, under the top-pinned mark.
 *
 * ## Why a band and not the two-line stack it replaced
 *
 * A gutter with `view.detail` (on Orders: every row) used to paint
 * `COMPOUND_TWO_LINE_CLASS` — check in the top grid track, chevron in the
 * bottom. That boxed the CHECK inside a 23.5px half, so its alignment was a
 * statement about the half rather than about the row, and the mark plane could
 * not also be the checkbox's full hit plane (`GridRowCheckbox`: "the hit plane
 * is still the entire cell"). Now the mark plane IS the cell — `CompoundSelect`
 * is `h-full`, pinned top — and the chevron leaves the flow into this band.
 * `COMPOUND_TWO_LINE_CLASS` stays the right answer for TEXT (identity over
 * subtitle); it was the wrong answer for one glyph.
 *
 * ## The numbers
 *
 * The cell's content box is {@link COMPOUND_ROW_PX} minus the 1px row rule =
 * 47px. `h-6` is half the row box, so the band is the bottom 24px of it and a
 * 16px glyph centres at cy = rowTop + 36 — where the stack's bottom track put
 * it, so band and leaf still read as one column and the chevron keeps a
 * 24×24 hit plane. The mark above it ends at rowTop + 20, so the two glyphs
 * never touch. `bottom-0` measures from the padding box, so the band ends ABOVE
 * the row rule and clears the fold hairline
 * ({@link SLOT_TABLE_GROUP_FOLD_INNER_CLASS}) on a group's last child.
 */
export const COMPOUND_GUTTER_CHEVRON_BAND_CLASS = 'absolute inset-x-0 bottom-0 h-6';

/** The chevron's reveal box — the same 16px box the mark above it wears. */
export const COMPOUND_GUTTER_CHEVRON_GLYPH_CLASS = 'flex h-4 w-4 items-center justify-center';

/**
 * The same gutter track in px, at a 16px root.
 *
 * Used only as the intrinsic-size hint for `next/image`. The painted size comes
 * from `h-full w-full`, so a density-scaled rem track still fills correctly —
 * this number just stops the image being decoded at the wrong scale. (At a
 * non-default `--cf-density` the track scales while the row box does not, so
 * the cell stops being exactly square; the image still fills it.)
 */
export const COMPOUND_GUTTER_PX = COMPOUND_ROW_PX;

/**
 * The TWO marks on a multi-line fold — one for MEMBERSHIP, one for the CLOSE.
 *
 * ## What a group needs to say, and where each mark says it
 *
 * A fold has to answer two different questions. *"Do these rows belong to the
 * row above?"* is answered while the fold is OPEN, by
 * {@link SLOT_TABLE_GROUP_CHILD_RAIL_CLASS} — a soft vertical rail down the
 * children. *"Where does this group end?"* is answered in BOTH states by the
 * bottom rule below, which is why it is painted on the FOLD and not on the leaf
 * block (operator 2026-09-14: "it must display when it's opened or closed, to
 * display to the user that it's a multi-line item row"): collapsed → under the
 * title band; expanded → under the last leaf.
 *
 * Splitting the two is what let the rule stop shouting. It used to carry BOTH
 * jobs alone, in the body-text INK (`bg-text-default` = `#0f172a`), *"black and
 * more visible than the other bottom hairlines"* (operator 2026-09-14) —
 * because with no membership mark the close was the only evidence a group
 * existed. **That ruling is superseded (operator 2026-09-15: a softer mark,
 * "instead of a black line displaying below the line").** A full-bleed 1px line
 * in text ink is the spreadsheet TOTALS idiom: it reads "this block is footed",
 * not "these rows belong together". The close is now `bg-border-default`
 * (`#cbd5e1`, ~1.6:1 on card) — still a step above the near-invisible row rules
 * (`--cf-grid-line` = border-hairline), still legible collapsed, no longer the
 * loudest horizontal element on the desk.
 *
 * Both earlier treatments stay RETIRED — do not restore them: the 4-side
 * ENVELOPE ring read as "a full square around it", and the nested INNER box
 * competed with it as a box-in-a-box cage.
 *
 * Overlay mechanics (why an absolute last child, not a wrapper border): a
 * `border` on the wrapper shifts layout and shears frozen columns, and the
 * wrapper's own decorative paint lands UNDER the opaque leaves; a
 * `pointer-events-none` last child at `z-sticky` (above `z-raised` frozen
 * cells, below the `z-header` grid header) paints over every row without a
 * hit area. The RailRow accent bar (absolute + z) is the house precedent.
 */
export const SLOT_TABLE_GROUP_FOLD_INNER_CLASS =
  'pointer-events-none absolute inset-x-0 bottom-0 z-sticky h-px bg-border-default';

/**
 * The CHILD RAIL — a 2px vertical hairline down a group child, on the IDENTITY
 * track's leading edge. This is how membership is spoken (operator 2026-09-15).
 *
 * ## Why the identity track and not the select gutter
 *
 * The obvious place is the row's left edge — and it is taken. The select gutter
 * is 24px and its first 3px are {@link COMPOUND_EDGE_RAIL_CLASS}, the TRIAGE
 * rail. Measured on a live fold (5 children, all `Urgent`): the triage bar
 * occupies x 0–3 of every one of them, so a child rail in that slot is painted
 * over and invisible. Worse, the two marks have different lifetimes — triage is
 * PER-ROW and CONDITIONAL (marked rows only, and it pulses), a child rail is
 * STRUCTURAL (every child, static). Sharing one 3px column makes it mean
 * "urgent" on one row and "child" on the next, alternating down a mixed group.
 *
 * The rail sits on the IDENTITY track's leading edge — the first DATA track
 * after the gutters — so it is a column boundary away from the triage bar
 * instead of sharing its slot. Measured on To-ship: triage 224–227, rail
 * 272–274, i.e. 45px of clear air, and both still inside the frozen prefix, so
 * the rail cannot shear away from its rows under horizontal scroll.
 *
 * `w-0.5` + a border token is the vocabulary the nav spine already uses for
 * exactly this fact (`spineRailLineClass`: *"a hairline on the left of all the
 * child components"*), so the desk and the nav say "child" the same way rather
 * than inventing a table-only dialect. Absolute + `inset-y-0` rather than a
 * `border-l`: a border would shift the identity cell's content 2px and put the
 * frozen columns out of register with the header.
 *
 * Gate it on DATA (`CompoundRowView.quietIdentity` — the group-child marker),
 * never on a family name: every `PRODUCT_TABLES` peer that folds (To-ship,
 * Unbox, Incoming) gets it from the one mount in `renderCompoundGridCell`.
 */
export const SLOT_TABLE_GROUP_CHILD_RAIL_CLASS =
  'pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-border-default';
