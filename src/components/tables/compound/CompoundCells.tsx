'use client';

/**
 * The compound cell bodies — the ONLY implementation, for every table.
 *
 * Each takes a {@link CompoundRowView} (a family's adapter output) rather than
 * a family row type, which is what lets Receiving, Orders and Incoming share
 * one layout instead of three that drift. A new table supplies a mapper; it
 * never copies a cell.
 *
 * These render the cell BODY. The surrounding `<div>` — grid cell class,
 * `data-col`, row box, frozen offset — is {@link CompoundGridCell}, which is
 * where every family enters. Nothing outside this directory composes these
 * bodies directly.
 *
 * The wrapper used to be each family's job, on the reasoning that per-staff
 * column display and the frozen-pane token resolve from the family's own model.
 * That was wrong in a way worth remembering: the wrapper decides a cell's
 * POSITION, so leaving it per-family forked the layout in the one place nobody
 * compares. Receiving pinned the photo track at the wrong offset and Orders did
 * not pin it at all — from the same `frozen: true`. Both prefs are resolved
 * from the MOUNTED columns now, which every family already passes.
 */

import Image from 'next/image';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  Check,
  ChevronRight,
  MoreHorizontal,
  Package,
  PackageSearch,
  PackingModeStandard,
  ShippingModeScanOut,
} from '@/components/Icons';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import { StaffAvatar } from '@/components/identity';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { GridClickSelectFace, GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { cn } from '@/utils/_cn';
import { CompoundCell, CompoundLine } from './CompoundCell';
import { COMPOUND_GUTTER_PX, COMPOUND_ROW_PX } from './compound-row-chrome';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import {
  formatCompoundStageStepLine,
  type CompoundRowAction,
  type CompoundRowView,
  type CompoundSlotValue,
  type CompoundStageStepFacts,
  type CompoundStateTone,
  type CompoundSubtitlePart,
  type CompoundSubtitleSelect,
} from './compound-row-model';

/**
 * Column 2 — the photo, EDGE TO EDGE.
 *
 * It fills its cell corner to corner: no inset, no border, no centring slack.
 * The cell is a square of the row box (`COMPOUND_GUTTER_TRACK_REM`).
 *
 * Very nearly a true square: the airtable skin paints a 1px bottom rule on every
 * direct child of a row, and the cell is border-box, so the painted area is
 * 48×47. That last pixel is the row SEAM, not padding — removing it for these
 * two tracks would break the continuous hairline down the grid — so a square
 * source is scaled by 48/S and loses half a pixel top and bottom. Named here
 * because "square" is the kind of claim that quietly stops being true.
 *
 * It used to be a 32px chip with a hairline border floating in a 64px track —
 * 9px of gap on three sides and 25px on the fourth, which read as a column of
 * postage stamps rather than a strip of product. The operator's ask was
 * literally "full width, no padding, edge to edge", and a photo is the one cell
 * content that gains from every pixel: it is what an operator matches against
 * the box in their hands.
 *
 * `object-cover` (not `contain`): a non-square source fills the square and
 * crops rather than letterboxing, because a band of empty ground inside the
 * cell would reintroduce exactly the inset this removes. The image can still
 * never set the row's height — the cell's height is fixed by
 * {@link COMPOUND_ROW_PX} and clips.
 */
export function CompoundThumb({ view }: { view: CompoundRowView }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-sunken">
      {view.thumbUrl ? (
        <Image
          src={view.thumbUrl}
          alt={view.title || 'Item photo'}
          // Intrinsic hint only — the painted size is `h-full w-full`, so a
          // density-scaled track still fills.
          width={COMPOUND_GUTTER_PX}
          height={COMPOUND_ROW_PX}
          className="h-full w-full object-cover"
          // The title beside it already names the item, so a slow photo must
          // never hold up the row paint.
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-faint">
          <Package className="h-4 w-4" aria-hidden />
        </div>
      )}
    </div>
  );
}

/**
 * Column 1 — the SELECTION mark, edge to edge, and never blank.
 *
 * A full-bleed square that always paints a checkmark: faded when the row is not
 * selected, solid on an accent ground when it is. That is the whole affordance
 * — an operator can see at a glance that the leftmost column is a checkmark
 * column, and can read straight down it to see what is ticked.
 *
 * **One face, no chrome flag.** The flat spreadsheets still choose between
 * `'always'` / `'selected-only'` / `'sheets'` gutter chrome; the compound row
 * does not, because it has one display method by rule. The face here is fixed.
 *
 * ## Interactive vs decorative is the presence of `onToggle`
 *
 * With a handler this is a real `role="checkbox"` button whose hit plane is the
 * entire 48px cell — an operator never has to aim at a glyph, and Playwright's
 * `.check()` keeps working. Without one it is the same face, `aria-hidden`,
 * for the surfaces where the ROW owns the toggle (click-select) — the row's own
 * `role="checkbox"` is the control there, and a second one would be a duplicate
 * a screen reader has to disambiguate.
 *
 * What the tick MEANS is the caller's business: bulk membership on Receiving,
 * Incoming and To-Ship; "this task is done" on Tasks. Same control, same
 * picture, different handler.
 */
export function CompoundSelect({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean | 'mixed';
  /** Present ⇒ a real checkbox. Absent ⇒ a decorative face (row owns toggle). */
  onToggle?: () => void;
  label: string;
  disabled?: boolean;
}) {
  if (!onToggle) {
    return <GridClickSelectFace checked={checked} className="absolute inset-0" />;
  }
  return (
    <GridRowCheckbox
      checked={checked}
      onToggle={onToggle}
      label={label}
      disabled={disabled}
      chrome="flush"
    />
  );
}

/**
 * TITLE column — what it is, over what somebody said about it.
 *
 * The note is the second line by rule: a code under a title is a duplicate of
 * the IDS column two tracks away, whereas a note is the only place a row can
 * say something the schema has no field for.
 *
 * ## The note line is READ-ONLY
 *
 * It used to edit in place when a family passed `onCommitNote`. The editor went
 * with the display layer on 2026-08-29; the TRIGGER did not, and for a while
 * this cell rendered a button with `hover:underline` and
 * `aria-label="Edit note: …"` that set an `editing` flag nothing read. A
 * control that looks live and does nothing is worse than a plain line of text,
 * so the trigger is gone too.
 *
 * `commitReceivingLineNote` is still in the domain layer — the write survives,
 * it just has no cell-level caller. Note editing belongs on the record plane
 * now, like every other correction.
 *
 * ## A bound subtitle PART can edit in place — by capability, not by mode
 *
 * A family passes {@link CompoundSubtitleSelect} editors in `subtitleSelects`
 * and the matching part (by `key`) becomes a click-only menu trigger over the
 * options the family resolved from its own SoT; every other part — and the
 * same part on a mount that passes no editor — is the identical read-only
 * span. This is a scalar-field PATCH affordance (To-ship condition), not a
 * lifecycle transition; picking an option commits, Esc closes without saving
 * — the same contract the flat grid's condition editor had.
 *
 * The ROW owns Enter/Space (open / select), so the trigger is `tabIndex={-1}`
 * and opens on click only — same law as the ⋮ actions button and the old
 * note-editor trigger before it.
 */
export function CompoundItem({
  view,
  subtitleSelects,
}: {
  view: CompoundRowView;
  /** Present ⇒ the parts these claim (by key) edit in place. */
  subtitleSelects?: readonly CompoundSubtitleSelect[];
}) {
  // Bound subtitles (an explicit org/staff layout choice) REPLACE the note
  // line: parts in binding order, ` · ` separated, each carrying the tone its
  // family SoT resolved (qty count tone, condition grade tone). Absent ⇒ the
  // legacy note fallback.
  const parts = view.subtitleParts;
  const selectFor = (part: CompoundSubtitlePart): CompoundSubtitleSelect | undefined =>
    part.key ? subtitleSelects?.find((s) => s.partKey === part.key) : undefined;

  const renderPart = (part: CompoundSubtitlePart, i: number) => {
    const select = selectFor(part);
    const face = <span className={part.toneClass}>{part.text}</span>;
    return (
      <span key={part.key ?? i}>
        {i > 0 ? <span className="text-text-faint">{' · '}</span> : null}
        {select ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Edit ${select.label.toLowerCase()}: ${part.text}`}
                // The row's own click would select or open — this is "edit".
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  'ds-raw-button inline-flex min-w-0 items-center text-left',
                  'hover:underline decoration-dotted underline-offset-2',
                  focusRing('control'),
                )}
              >
                {face}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
              {select.options.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  title={option.description}
                  onSelect={() => select.onCommit(option.value)}
                  className={cn(
                    'font-semibold uppercase tracking-wide',
                    option.toneClass,
                    option.current && option.currentClass,
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{option.label}</span>
                    {option.current ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  </span>
                </DropdownMenuItem>
              ))}
              {select.clearLabel ? (
                <DropdownMenuItem
                  onSelect={() => select.onCommit(null)}
                  className="border-t border-border-hairline text-text-muted"
                >
                  {select.clearLabel}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          face
        )}
      </span>
    );
  };

  const noteLine = parts ? (
    parts.length > 0 ? (
      <CompoundLine>{parts.map(renderPart)}</CompoundLine>
    ) : null
  ) : view.note ? (
    <HoverTooltip label={view.note} asChild>
      <CompoundLine>{view.note}</CompoundLine>
    </HoverTooltip>
  ) : null;

  const flagMark = view.flagMark ?? null;
  const titleLine = view.title ? (
    <HoverTooltip label={view.title} asChild>
      <CompoundLine>{view.title}</CompoundLine>
    </HoverTooltip>
  ) : (
    <span className="text-text-faint">Untitled</span>
  );

  return (
    <CompoundCell
      primary={
        flagMark ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <HoverTooltip label={flagMark.tip} focusable={false}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', flagMark.dotClass)}>
                <span className="sr-only">{`Flagged ${flagMark.label}`}</span>
              </span>
            </HoverTooltip>
            {titleLine}
          </span>
        ) : (
          titleLine
        )
      }
      secondary={noteLine}
    />
  );
}

/**
 * Column 3 — the row's IDENTITY: order number over its tracking number.
 *
 * **The leading mark is the brand DOT, never the type glyph.** That is the
 * house identity law (`AGENTS.md`), and it is why this cell composes
 * `BrandIdentityDot` + `OrderNumberMenuChip plain` / `TrackingNumberMenuChip
 * showIcon={false}` — exactly what Unbox History's `ReceivingOrderCell` and
 * `ReceivingTrackingCell` render.
 *
 * This shipped wrong once: it used `OrderIdChip` / `TrackingChip`, whose
 * default faces carry the `#` hash and the MapPin. Two tables then answered
 * "glyph or dot?" by two different rules — a fork hiding inside the SHARED
 * renderer, which is the worst place for one because it looks unified.
 *
 * **The dot's SHAPE says which identifier it marks:** filled for the order
 * handle, a ring for the carrier tracking number. Colour alone could not do it.
 * Both chips drop their own type mark on the stated promise that "the header
 * already labels ORDER / TRACK", and this cell stacks both under one header —
 * so an operator was left inferring the type from a brand palette, and on a row
 * whose order id and tracking number are the same digits (Incoming does this
 * routinely) there was nothing to infer from at all.
 *
 * Copy / Open / Edit verbs are not hand-rolled — the two menu chips own them.
 */
export function CompoundFulfillment({ view }: { view: CompoundRowView }) {
  const orderMeta = resolveMarketplacePlatformMeta(view.orderId, view.platformValue);
  const platformDot = platformMetaBrandDot(orderMeta);
  const orderOpenHref = view.orderId
    ? marketplaceOrderUrl(view.orderId, view.platformValue)
    : null;
  const carrierDot = view.tracking
    ? carrierBrandDotPaint(resolveCarrierBrand(view.tracking, view.carrier))
    : null;

  return (
    <CompoundCell
      primary={
        view.orderId ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot className={platformDot.className} style={platformDot.style} />
            <OrderNumberMenuChip
              value={view.orderId}
              platformLabel={orderMeta.value ? orderMeta.label : null}
              openHref={orderOpenHref}
              plain
              dense
            />
          </span>
        ) : (
          <GridCellDash />
        )
      }
      secondary={
        view.tracking && carrierDot ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot
              className={carrierDot.className}
              style={carrierDot.style}
              // RING = tracking. The filled dot on the line above is the order.
              variant="ring"
            />
            <TrackingNumberMenuChip
              value={view.tracking}
              carrierHint={view.carrier}
              showIcon={false}
              dense
            />
          </span>
        ) : (
          <GridCellDash />
        )
      }
    />
  );
}

/**
 * Tone → pill paint. Neutral by default: on a WMS floor most states are
 * unremarkable progress, and a grid where every row is coloured has no signal
 * left for the one row that needs a human. Saturated paint is reserved for
 * `alert` (hold / exception), which is the brief's "avoid red/yellow/green
 * unless it's a hard error" expressed as a rule rather than a palette.
 */
const STATE_TONE_CLASS: Record<CompoundStateTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-sunken text-text-muted', dot: 'bg-text-faint' },
  done: { pill: 'bg-surface-sunken text-text-default', dot: 'bg-emerald-500' },
  alert: { pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

/**
 * STATUS column — the state pill over the DELAY.
 *
 * The second line is late-ness, by rule, because that is the fact that reorders
 * an operator's queue. On time renders as a quiet "On time" rather than an
 * empty line: blank is ambiguous (no deadline? not computed? on time?), and a
 * floor reading a hundred rows should never have to resolve that ambiguity.
 */
export function CompoundState({ view }: { view: CompoundRowView }) {
  const tone = STATE_TONE_CLASS[view.stateTone];
  const delay = view.delay;
  const delayNode =
    delay && delay.overdue ? (
      <CompoundLine className="font-semibold text-rose-600">
        {delay.days}d late
      </CompoundLine>
    ) : (
      <CompoundLine className="text-text-faint">On time</CompoundLine>
    );

  const pill = (
    <span
      className={cn(
        // Flush-square: ops chrome carries no radius (kinetic-ledger law).
        'inline-flex min-w-0 items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone.pill,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      <CompoundLine>{view.stateLabel}</CompoundLine>
    </span>
  );

  return (
    <CompoundCell
      primary={
        view.stateTip ? (
          <HoverTooltip label={view.stateTip} asChild>
            {pill}
          </HoverTooltip>
        ) : (
          pill
        )
      }
      secondary={
        view.delayTip ? (
          <HoverTooltip label={view.delayTip} asChild>
            {delayNode}
          </HoverTooltip>
        ) : (
          delayNode
        )
      }
    />
  );
}

/**
 * Lifecycle STEP column — the media-object row every dense person-tool uses:
 * the ACTOR's mark on the left spanning both lines, the STATE VERB + stamp
 * stacked to its right.
 *
 * ```text
 * ( MG )  🔧 TESTED
 *         Jul 13, 4:15 PM · Bench 2
 * ```
 *
 * Three rules carry the design:
 * - **Person is a MARK, state is a WORD.** The avatar (photo → initials on
 *   the staffer's colour, {@link StaffAvatar}) is the identity channel; the
 *   verb keeps the quiet state tones. Staff colour never repaints the verb —
 *   a staffer who picks red must not make every row they test read as an
 *   error. A colour ring keeps the assigned colour scannable once a photo
 *   uploads. Round mark = person; the square edge-to-edge image stays the
 *   product photo's alone.
 * - **The verb marks what HAPPENED; nothing-yet is the ICON over a DASH.**
 *   The done face ("Tested") paints once the event's timestamp lands. Before
 *   that the line keeps the step's glyph (the column identity survives) with
 *   the house blank-cell dash where the verb would be (operator ruling
 *   2026-08-30: a step that has not happened is a blank, not an instruction).
 *   The catalog's `pending` face survives as the dash's accessible name only,
 *   so AT still hears the state. An assigned-but-undone row keeps the
 *   assignee's mark beside it — "this is Michael's" is still the actionable
 *   read.
 * - **The name lives in the tooltip.** Names are ragged; the mark is 28px
 *   always. The full `who · time · station` line rides the hover, and the
 *   mark's `alt` names the actor for screen readers.
 *
 * The two text lines stay {@link CompoundCell}'s fixed tracks, so the verb
 * baseline still locks to the state/item columns — the avatar is a leading
 * flex sibling, never a third row.
 *
 * An unclaimed step paints a dashed empty circle in the mark's slot (the
 * universal "no owner yet" face) so TEST and TESTED align identically.
 */
export function CompoundStageStep({
  labels,
  Icon,
  facts,
}: {
  labels: Readonly<{ done: string; pending: string }>;
  Icon: (props: { className?: string }) => JSX.Element;
  facts: CompoundStageStepFacts | null;
}) {
  const tip = formatCompoundStageStepLine(facts);
  const filled = Boolean(facts?.at);
  const stampLine = [facts?.at, facts?.station]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  const hasActor = Boolean(facts && (facts.whoStaffId || facts.who));

  const body = (
    <div className="flex h-full min-w-0 items-center gap-1.5">
      {hasActor ? (
        <StaffAvatar
          staffId={facts?.whoStaffId ?? null}
          name={facts?.who}
          size="sm"
          colorRing
          alt={facts?.who ?? undefined}
        />
      ) : (
        // Unclaimed: same 28px slot as the `sm` mark, dashed — "no owner yet",
        // and the text column starts at the same x on every row.
        <span
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-full border border-dashed border-border-default"
        />
      )}
      <CompoundCell
        className="flex-1"
        primary={
          filled ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-default">
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <CompoundLine>{labels.done}</CompoundLine>
            </span>
          ) : (
            // Not happened yet ⇒ the step's glyph over the house blank-cell
            // dash, never a verb (operator ruling 2026-08-30: the icon keeps
            // the column identity, the dash says nothing landed). The dash is
            // aria-hidden, so the pending face carries the state for AT.
            <span className="inline-flex min-w-0 items-center gap-1 text-text-muted">
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <GridCellDash />
              <span className="sr-only">{labels.pending}</span>
            </span>
          )
        }
        // No stamp ⇒ a BLANK second line (operator ruling 2026-08-30) — the
        // top row's dash already says nothing landed; a second dash under it
        // was the same fact twice.
        secondary={stampLine ? <CompoundLine>{stampLine}</CompoundLine> : null}
      />
    </div>
  );

  return tip ? (
    <HoverTooltip label={tip} asChild>
      {body}
    </HoverTooltip>
  ) : (
    body
  );
}

/**
 * Slot glyphs by catalog `iconKey`. Semantic aliases on purpose: PackageSearch
 * = pick from inventory, `PackingModeStandard` the pack bench,
 * `ShippingModeScanOut` the carrier-handoff scan. Unknown keys fall back to
 * the neutral carton.
 */
const SLOT_STEP_ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  picked: PackageSearch,
  packed: PackingModeStandard,
  scanned_out: ShippingModeScanOut,
};

/**
 * The materialized SLOT cell body — one component for every bound track.
 *
 * Branches on the field's DISPLAY TYPE (never its id): `stage_event` paints
 * the two-line step above; everything else paints the resolved value over an
 * empty line (the header already labels the fact). The value arrives on
 * `view.slots[trackKey]`, resolved once per row by the family adapter.
 */
export function CompoundSlotCell({
  trackKey,
  label,
  iconKey,
  displayType,
  stageLabels,
  view,
}: {
  trackKey: string;
  label: string;
  iconKey?: string;
  displayType?: FieldDisplayType;
  /** Verb faces from the catalog field; falls back to the header label. */
  stageLabels?: Readonly<{ done: string; pending: string }>;
  view: CompoundRowView;
}) {
  const value: CompoundSlotValue | undefined = view.slots?.[trackKey];
  if (displayType === 'stage_event') {
    const facts = value?.kind === 'stage_event' ? value : null;
    const Icon = SLOT_STEP_ICONS[iconKey ?? ''] ?? Package;
    return (
      <CompoundStageStep
        labels={stageLabels ?? { done: label, pending: label }}
        Icon={Icon}
        facts={facts}
      />
    );
  }
  const text = value?.kind === 'value' ? value.text : null;
  return (
    <CompoundCell
      primary={
        text ? (
          <HoverTooltip label={text} asChild>
            <CompoundLine>{text}</CompoundLine>
          </HoverTooltip>
        ) : (
          <GridCellDash />
        )
      }
      secondary={null}
    />
  );
}

/**
 * AMOUNT column — the money, end-aligned, over the arithmetic behind it.
 *
 * End-aligned and `tabular-nums` because that is what a money column is FOR: a
 * digit lines up under a digit, so an operator scanning a cart or a queue can
 * see which row is the big one without reading any of them. Left-aligned
 * currency in a ragged column defeats the only reason to have the column.
 *
 * A CREDIT (a trade-in, a refund) paints differently as well as carrying its
 * minus sign. One character of difference at the head of a tabular figure is
 * exactly the thing a tired eye slides over, and mistaking a −$120 trade-in for
 * a $120 sale is the expensive direction to be wrong in.
 *
 * `null` renders an empty track. A checklist item has no money, and an empty
 * cell is the honest answer — a `$0.00` would be a number nobody entered.
 */
export function CompoundAmount({ view }: { view: CompoundRowView }) {
  return (
    <CompoundCell
      align="end"
      primary={
        view.amount ? (
          <CompoundLine
            mono
            className={cn(
              'font-semibold',
              view.amountCredit ? 'text-text-success' : 'text-text-default',
            )}
          >
            {view.amount}
          </CompoundLine>
        ) : null
      }
      secondary={
        view.amountNote ? <CompoundLine mono>{view.amountNote}</CompoundLine> : null
      }
    />
  );
}

/**
 * ACTIONS column — the row's ⋮ menu.
 *
 * Replaces the bare chevron that used to sit here. The chevron could say only
 * one thing ("open"), so every other per-row verb had to live somewhere else:
 * Receiving hid its triage verbs behind a right-click context menu that nothing
 * on screen advertised, and the kiosk cart grew a naked ✕ that voided a line the
 * customer had already been shown. A ⋮ is discoverable, holds as many verbs as
 * a family has, and keeps "Open" as its first item so nothing regressed.
 *
 * `tabIndex={-1}`: the ROW is already the keyboard target, so a focusable
 * control on every row would double the tab stops in a 500-row grid. The menu
 * is reachable from the row's own context menu and from the record plane.
 *
 * Renders nothing when a family passes neither an open handler nor actions — an
 * affordance that looks clickable and does nothing is worse than an empty track.
 */
export function CompoundActions({
  onOpen,
  actions,
  label,
}: {
  onOpen?: () => void;
  actions?: readonly CompoundRowAction[];
  /** Names WHICH row the menu belongs to, for screen readers. */
  label?: string;
}) {
  const items: CompoundRowAction[] = [
    ...(onOpen ? [{ key: 'open', label: 'Open', onSelect: onOpen }] : []),
    ...(actions ?? []),
  ];
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={label ? `Actions for ${label}` : 'Row actions'}
          data-row-actions
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center text-text-faint',
            // Quiet until the row is hovered — a column of ⋮ on every row is
            // ink competing with the data. Opacity composites off the main
            // thread, so this costs no layout on a scrolling grid.
            'opacity-0 transition-opacity group-hover/row:opacity-100',
            'hover:text-text-default focus-visible:opacity-100',
            focusRing('control'),
          )}
          // The row's own click would select or open — this is "show me the
          // verbs", which is a third thing.
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((action) => (
          <DropdownMenuItem
            key={action.key}
            disabled={action.disabled}
            onSelect={() => action.onSelect()}
            className={cn(action.tone === 'danger' && 'text-text-danger')}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Column 5 — the record affordance.
 *
 * `tabIndex={-1}`: the ROW is already the keyboard target, so a focusable
 * chevron on every row would double the tab stops in a 500-row grid for no new
 * capability. Renders nothing without an `onOpen` — a chevron that looks
 * clickable and does nothing is worse than an empty track.
 */
export function CompoundOpen({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center text-text-faint opacity-0 transition-opacity',
        'group-hover/row:opacity-100 hover:text-text-default',
      )}
      onClick={(event) => {
        // The row's own click would toggle selection — this is "open".
        event.stopPropagation();
        onOpen();
      }}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}
