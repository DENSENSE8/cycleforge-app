'use client';

/** The compound cell bodies — the ONLY implementation, for every table. */

import { forwardRef, useRef, useState, type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import Image from 'next/image';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Hash,
  CalendarClock,
  MoreHorizontal,
  Package,
  PackageSearch,
  PackingModeStandard,
  Pencil,
  ShippingModeScanOut,
} from '@/components/Icons';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import { pinLineMoneyAfterQty } from '@/lib/tables/slot-table-line-money';
import { pinLineQtyFirst } from '@/lib/tables/slot-table-line-qty';
import {
  compoundSlotAgeFace,
  compoundSlotFaceFor,
  compoundSlotInstantFace,
} from './compound-slot-face';
import { StaffAvatar } from '@/components/identity';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { cornerClass } from '@/design-system/tokens/radius';
import { ITEM_RECORD_MOBILE_STAGE } from '@/design-system/tokens/item-record-mobile';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  GridRowCheckbox,
  GridSelectSquareFace,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OutOfStockHoverCard } from '@/components/tables/compound/OutOfStockHoverCard';
import { KitCompositionHoverCard } from '@/components/tables/compound/KitCompositionHoverCard';
import {
  CopyChipHoverMenu,
  type CopyChipHoverMenuItem,
} from '@/components/ui/CopyChipHoverMenu';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { copyToClipboard } from '@/utils/_dom';
import { cn } from '@/utils/_cn';
import { CompoundSelectStatusFace } from './CompoundSelectStatusFace';
import type { CompoundSelectStatus } from './compound-select-status';
import { useSlotLayoutReorder } from '@/components/tables/SlotLayoutReorderContext';
import { useSubtitlePointerReorder } from './useSubtitlePointerReorder';
import { CompoundSubtitleTextEditor } from './CompoundSubtitleTextEditor';
import { CompoundCell, CompoundLine } from './CompoundCell';
import { StruckLabel } from '@/design-system/components/StruckLabel';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { ProductTitleLink } from './ProductTitleLink';
import {
  COMPOUND_GUTTER_MARK_TOP_PIN_CLASS,
  COMPOUND_GUTTER_PX,
  COMPOUND_GUTTER_RAIL_INSET_CLASS,
  COMPOUND_ROW_PX,
} from './compound-row-chrome';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { EMPTY_META_DASH } from '@/lib/conditions';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import {
  canAssignCompoundStage,
  compoundDatesHoverLabel,
  formatCompoundDelayAgeFace,
  formatCompoundStageStampFace,
  formatCompoundStageStepLine,
  type CompoundOrderedAtEdit,
  type CompoundRowAction,
  type CompoundRowView,
  type CompoundShipByEdit,
  type CompoundSlotValue,
  type CompoundStageAssign,
  type CompoundStageStepFacts,
  type CompoundStateTone,
  type CompoundSubtitlePart,
  type CompoundSubtitleSelect,
  type CompoundSubtitleEdit,
} from './compound-row-model';
import { StageStaffAssignPopover } from './StageStaffAssignPopover';
import { CompoundStaffRosterButton } from './CompoundStaffRosterButton';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';

/** Column 4 — the photo, EDGE TO EDGE. Hover enlarges it; click opens it full screen. */
export function CompoundThumb({ view }: { view: CompoundRowView }) {
  return (
    <PhotoHoverPeek
      src={view.thumbUrl}
      alt={view.title || 'Item photo'}
      className={cn('block h-full w-full overflow-hidden', view.thumbUrl ? 'bg-surface-card' : 'bg-surface-sunken')}
    >
      {view.thumbUrl ? (
        <Image
          src={view.thumbUrl}
          alt=""
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
        <span className="flex h-full w-full items-center justify-center text-text-faint">
          <Package className="h-4 w-4" aria-hidden />
        </span>
      )}
    </PhotoHoverPeek>
  );
}

/**
 * Column 1 — the SELECTION mark, edge to edge, and never blank.
 * ## Two altitudes in one 16px box (operator 2026-09-15)
 * the operator retired on 2026-09-04.
 */

export function CompoundSelect({
  checked,
  onToggle,
  label,
  disabled = false,
  chrome = 'hover',
  statuses,
}: {
  checked: boolean | 'mixed';
  /** Present ⇒ a real checkbox. Absent ⇒ a decorative face (row owns toggle). */
  /** Receives the click's modifier state so shift-click can extend a range. */
  onToggle?: (event: { shiftKey: boolean }) => void;
  label: string;
  disabled?: boolean;
  /**
   * Leaf compound rows stay `'hover'`. Order-group parent chrome passes
   * `'always'` so the fold checkbox is findable without hunting a hover.
   */
  chrome?: GridSelectGutterChrome;
  /**
   * The row's resting marks from {@link compoundSelectStatusMarks}, hottest
   * first. Paints only where the square is hover-revealed and nothing is
   * ticked; several marks take turns in the box.
   */
  statuses?: readonly CompoundSelectStatus[];
}) {
  const resting =
    statuses && statuses.length > 0 && chrome === 'hover' && checked === false ? statuses : null;
  // BOTH faces share one box, pinned to the TOP of the gutter and inset past
  // the rail (operator 2026-09-04 "most top of the column per rows", reaffirmed
  const faceCentring = cn(COMPOUND_GUTTER_MARK_TOP_PIN_CLASS, COMPOUND_GUTTER_RAIL_INSET_CLASS);
  // Decorative face — the ROW owns the toggle on click-select surfaces. Same
  // square the real control paints, so the two planes cannot look different.
  if (!onToggle) {
    return (
      <span className={cn('relative flex h-full w-full justify-center', faceCentring)}>
        {resting ? <CompoundSelectStatusFace statuses={resting} className={faceCentring} /> : null}
        <GridSelectSquareFace checked={checked} />
      </span>
    );
  }
  return (
    <span className="relative flex h-full w-full">
      {resting ? <CompoundSelectStatusFace statuses={resting} className={faceCentring} /> : null}
      <GridRowCheckbox
        checked={checked}
        onToggle={onToggle}
        label={label}
        disabled={disabled}
        chrome={chrome}
        // Keeps GridRowCheckbox's own top pin (`items-start pt-1`) and adds the rail reservation — the compound gutter differs from a flat grid in…
        className={faceCentring}
      />
    </span>
  );
}

/** TITLE column — what it is, over what somebody said about it. */
function isItemNumberSubtitlePart(key: string | undefined): boolean {
  return Boolean(key?.endsWith('.item_number'));
}

function CompoundItemNumberEditor({
  edit,
  onClose,
}: {
  edit: CompoundSubtitleEdit;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(edit.value);

  const commit = () => {
    onClose();
    const next = draft.trim();
    if (next === edit.value.trim()) return;
    edit.onCommit(next.length > 0 ? next : null);
  };

  return (
    <input
      autoFocus
      value={draft}
      aria-label={edit.label}
      placeholder={edit.placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      className={cn(
        'm-0 h-3 min-w-0 appearance-none border-0 bg-transparent p-0',
        'text-role-caption text-text-default shadow-none outline-none',
      )}
      size={Math.max(edit.value.length, 8)}
    />
  );
}

/** Condition (and any other subtitle select) — click opens, hold-and-move reorders. */
function CompoundSubtitleSelectMenu({
  part,
  select,
  face,
  dragging,
  skipClick,
}: {
  part: CompoundSubtitlePart;
  select: CompoundSubtitleSelect;
  face: ReactNode;
  dragging: boolean;
  skipClick?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open && !dragging}
      onOpenChange={(next) => {
        if (next && (dragging || skipClick?.())) return;
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Edit ${select.label.toLowerCase()}: ${part.text}`}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'ds-raw-button inline-flex h-3 min-w-0 items-center leading-none text-left',
            'hover:underline decoration-dotted underline-offset-2',
            part.toneClass ?? 'text-text-muted',
            focusRing('control'),
          )}
        >
          {face}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
        {select.options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            title={option.description}
            onSelect={() => select.onCommit(option.value)}
            className={cn(
              'font-semibold',
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
  );
}

/** The NOTE at the end of the subtitle line. */
function CompoundSubtitleNote({
  text,
  edit,
}: {
  text: string;
  edit?: CompoundSubtitleEdit;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(text);
  const body = text.trim();
  const has = body.length > 0;

  /*
   * With a note written, the glyph is a fact and is always painted.
   * always occupies its box (operator 2026-09-04 asked for the icon on row
   */
  const glyph = (
    <FileText
      className={cn(
        'h-3 w-3 shrink-0 text-text-faint',
        !text.trim() &&
          'opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100',
      )}
      aria-hidden
    />
  );
  const face = has ? (
    <span className="min-w-0 truncate text-text-muted">{body}</span>
  ) : (
    glyph
  );

  if (!edit) {
    return has ? (
      <HoverTooltip label={body} asChild>
        <span className="inline-flex min-w-0 max-w-[12rem] items-center">{face}</span>
      </HoverTooltip>
    ) : (
      <span className="inline-flex shrink-0 items-center">{face}</span>
    );
  }

  const commit = () => {
    setOpen(false);
    const next = draft.trim();
    if (next === body) return;
    edit.onCommit(next.length > 0 ? next : null);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(text);
        else commit();
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <HoverTooltip label={has ? body : 'Add a note'} asChild focusable={false}><span
          role="button"
          tabIndex={-1}
          aria-label={has ? `Edit note: ${body}` : 'Add a note'}
         
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'ds-raw-button inline-flex h-3 items-center leading-none',
            has ? 'min-w-0 max-w-[12rem]' : 'shrink-0',
            focusRing('control'),
          )}
        >
          {face}
        </span></HoverTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={4}
        avoidCollisions={false}
        className="w-64 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <textarea
          autoFocus
          rows={3}
          value={draft}
          aria-label={edit.label}
          placeholder="Add a note…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(text);
              setOpen(false);
            }
          }}
          className={cn(
            'w-full resize-none bg-transparent px-1 py-0.5 text-role-caption text-text-default',
            'outline-none',
          )}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CompoundItem({
  view,
  subtitleSelects,
  subtitleEdits,
  subtitleNoteKey,
  noteText,
  onReorderSubtitle,
  extraTitleActions,
}: {
  view: CompoundRowView;
  /** Present ⇒ the parts these claim (by key) edit in place. */
  subtitleSelects?: readonly CompoundSubtitleSelect[];
  /** Present ⇒ the parts these claim retype in place (free text / number). */
  subtitleEdits?: readonly CompoundSubtitleEdit[];
  /** Part key of the NOTE fact — pinned right as a glyph instead of inline. */
  subtitleNoteKey?: string;
  /** The note's full text (the part's face may be truncated or a placeholder). */
  noteText?: string | null;
  /**
   * Test override for under-title reorder. Production reads the same
   * `onReorderByDrop` DataTable provides to header drags (field id onto
   * field id). See `docs/todo/subtitle-band-reorder-PLAN.md`.
   */
  onReorderSubtitle?: (dragKey: string, dropKey: string) => void;
  /** Row verbs that used to live on a ⋮ track — listing, void, open. */
  extraTitleActions?: readonly CopyChipHoverMenuItem[];
}) {
  // Bound subtitles REPLACE the note line:
  const parts = view.subtitleParts
    ? pinLineMoneyAfterQty(pinLineQtyFirst(view.subtitleParts))
    : view.subtitleParts;
  const selectFor = (part: CompoundSubtitlePart): CompoundSubtitleSelect | undefined =>
    part.key ? subtitleSelects?.find((s) => s.partKey === part.key) : undefined;

  const editFor = (part: CompoundSubtitlePart): CompoundSubtitleEdit | undefined =>
    part.key ? subtitleEdits?.find((e) => e.partKey === part.key) : undefined;
  const itemNumberPart = parts?.find((part) => isItemNumberSubtitlePart(part.key));
  const itemNumberEdit = subtitleEdits?.find((edit) => isItemNumberSubtitlePart(edit.partKey));
  const itemNumberValue = String(itemNumberPart?.text ?? itemNumberEdit?.value ?? '').trim();
  const listingHref = String(view.titleHref ?? '').trim() || null;
  const [editingItemNumber, setEditingItemNumber] = useState(false);

  /* Click-and-hold reorder of the under-title facts. */
  const contextReorder = useSlotLayoutReorder();
  const reorder = onReorderSubtitle ?? contextReorder;
  const { draggingKey, overKey, skipClick, bindPart, enabled: reorderable } =
    useSubtitlePointerReorder(reorder);

  const renderPart = (part: CompoundSubtitlePart, i: number) => {
    const select = selectFor(part);
    const edit = editFor(part);
    const face = (
      <span
        className={cn(
          // Same box as the notes FileText (`h-3`): caption size, no extra
          // line-height, so qty / condition sit on the glyph's centre line.
          'inline-flex h-3 items-center leading-none',
          part.toneClass,
          // A reserved box is a box: tabular figures so digits sit on the same
          // stems down the column, and `overflow-hidden` so a value longer than
          // the reservation clips instead of running over the fact beside it.
          part.widthCh != null && 'tabular-nums overflow-hidden',
        )}
        style={part.widthCh != null ? { width: `${part.widthCh}ch` } : undefined}
      >
        {part.text}
      </span>
    );
    const partKey = part.key;
    const dragBind = partKey && reorderable ? bindPart(partKey) : {};
    return (
      <span
        key={partKey ?? i}
        data-subtitle-part={partKey}
        {...dragBind}
        className={cn(
          'inline-flex h-3 min-w-0 select-none items-center [&_svg]:pointer-events-none',
          reorderable && !edit?.scrub && (draggingKey ? 'cursor-grabbing' : 'cursor-grab'),
          overKey === partKey && 'bg-surface-sunken',
        )}
      >
        {edit ? (
          <CompoundSubtitleTextEditor
            part={part}
            edit={edit}
            face={face}
            skipClick={skipClick}
          />
        ) : select ? (
          <CompoundSubtitleSelectMenu
            part={part}
            select={select}
            face={face}
            dragging={Boolean(draggingKey)}
            skipClick={skipClick}
          />
        ) : (
          face
        )}
      </span>
    );
  };

  /* Notes stay in the left cluster (after qty / condition). */
  const noteKey = subtitleNoteKey;
  const inlineParts = parts?.filter(
    (p) => p.key !== noteKey && !isItemNumberSubtitlePart(p.key),
  );
  const notePart = noteKey ? parts?.find((p) => p.key === noteKey) : undefined;
  const noteEdit = noteKey ? subtitleEdits?.find((e) => e.partKey === noteKey) : undefined;
  const noteBody = (() => {
    const fromRow = String(noteText ?? '').trim();
    if (fromRow) return fromRow;
    const fromPart = String(notePart?.text ?? '').trim();
    return fromPart && fromPart !== '--' ? fromPart : '';
  })();
  const noteGlyph = notePart ? (
    <CompoundSubtitleNote text={noteBody} edit={noteEdit} />
  ) : view.note ? (
    <CompoundSubtitleNote text={view.note} />
  ) : null;

  /*
   * LEFT under the title: qty, condition, and notes glyph.
   * Same `h-3` box, no middle dots. `justify-start` — a trailing cluster
   * was the wrong reading of "open the note to the bottom right".
   */
  const itemNumberEditor = editingItemNumber && itemNumberEdit ? (
    <CompoundItemNumberEditor edit={itemNumberEdit} onClose={() => setEditingItemNumber(false)} />
  ) : null;
  const noteLine = parts ? (
    inlineParts && (inlineParts.length > 0 || noteGlyph || itemNumberEditor) ? (
      <span
        className="flex h-3 min-w-0 items-center justify-start gap-1 whitespace-nowrap leading-none"
        data-subtitle-reorder={reorderable ? 'true' : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {inlineParts.map(renderPart)}
        {itemNumberEditor}
        {noteGlyph ? (
          <span className="flex h-3 shrink-0 items-center">{noteGlyph}</span>
        ) : null}
      </span>
    ) : null
  ) : view.note ? (
    <HoverTooltip label={view.note} asChild>
      <CompoundLine>{view.note}</CompoundLine>
    </HoverTooltip>
  ) : null;

  const kitFace = view.kitFace ?? null;
  const kitFaceLine = kitFace ? (
    <HoverTooltip label={<KitCompositionHoverCard face={kitFace} />} chrome="plain" focusable={false} asChild>
      <span
        className="inline-flex h-3 max-w-full items-center truncate text-role-micro font-medium text-text-muted"
        data-testid="kit-face-chip"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {kitFace.label}
      </span>
    </HoverTooltip>
  ) : null;

  const secondaryLine =
    noteLine || kitFaceLine ? (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        {noteLine}
        {kitFaceLine}
      </span>
    ) : null;

  const flagMark = view.flagMark ?? null;
  const itemStatus = view.itemStatus ?? null;
  const titleActions: CopyChipHoverMenuItem[] = [];
  if (itemNumberEdit) {
    titleActions.push({
      id: 'edit-item-number',
      label: 'Edit item number',
      icon: <Pencil />,
      onSelect: () => setEditingItemNumber(true),
    });
  }
  if (itemNumberPart || itemNumberEdit || listingHref) {
    titleActions.push({
      id: 'open-listing',
      label: 'Open listing',
      icon: <ExternalLink />,
      tone: 'accent',
      disabled: !listingHref,
      onSelect: () => {
        if (listingHref) window.open(listingHref, '_blank', 'noopener,noreferrer');
      },
    });
  }
  if (itemNumberValue) {
    titleActions.push({
      id: 'copy-item-number',
      label: 'Copy item number',
      icon: <Copy />,
      onSelect: () => {
        void copyToClipboard(itemNumberValue, {
          historyKind: 'sku',
          historyDisplay: itemNumberValue,
        });
      },
    });
  }
  if (extraTitleActions && extraTitleActions.length > 0) {
    titleActions.push(...extraTitleActions);
  }

  const titleLine = view.title ? (
    <ProductTitleLink title={view.title} href={listingHref} />
  ) : (
    <span className="text-text-faint">Untitled</span>
  );
  const titleFace = titleActions.length > 0 ? (
    <CopyChipHoverMenu
      menuLabel="Item number actions"
      items={titleActions}
      denseLabel
      className="min-w-0"
    >
      {titleLine}
    </CopyChipHoverMenu>
  ) : (
    titleLine
  );
  // The strike HOST only exists for a family that declared the field — see
  // `CompoundRowView.titleStruck`. Absent ⇒ the title is the same node it was.
  const titleWithActions =
    view.titleStruck == null ? (
      titleFace
    ) : (
      <StruckLabel struck={view.titleStruck}>{titleFace}</StruckLabel>
    );

  return (
    <CompoundCell
      primary={
        <>
          {itemStatus ? (
            <HoverTooltip
              label={
                itemStatus.card ? (
                  <OutOfStockHoverCard
                    thumbUrl={itemStatus.card.thumbUrl}
                    sku={itemStatus.card.sku}
                    title={itemStatus.card.title}
                    qtyShort={itemStatus.card.qtyShort}
                    kind={itemStatus.card.kind}
                    rollupSkus={itemStatus.card.rollupSkus}
                    pipelineLabel={itemStatus.card.pipelineLabel}
                  />
                ) : (
                  itemStatus.tip
                )
              }
              chrome={itemStatus.card ? 'plain' : 'inverse'}
              focusable={false}
              asChild
            >
              <span className="inline-flex size-[1em] shrink-0 items-center justify-center text-rose-600">
                <AlertTriangle className="size-full" aria-hidden />
                <span className="sr-only">{itemStatus.label}</span>
              </span>
            </HoverTooltip>
          ) : null}
          {flagMark ? (
            <HoverTooltip label={flagMark.tip} focusable={false}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', flagMark.dotClass)}>
                <span className="sr-only">{`Flagged ${flagMark.label}`}</span>
              </span>
            </HoverTooltip>
          ) : null}
          {titleWithActions}
        </>
      }
      secondary={secondaryLine}
    />
  );
}

/**
 * Column 3 — the row's IDENTITY:
 * Frozen in the left pane with select and the photo (operator 2026-09-04).
 */

export function CompoundFulfillment({
  view,
  onOpenLabels,
}: {
  view: CompoundRowView;
  onOpenLabels?: () => void;
}) {
  const orderMeta = resolveMarketplacePlatformMeta(view.orderId, view.platformValue);
  const platformDot = platformMetaBrandDot(orderMeta);
  const orderOpenHref = view.orderId
    ? marketplaceOrderUrl(view.orderId, view.platformValue)
    : null;
  const trackings =
    view.trackings && view.trackings.length > 0
      ? view.trackings
      : view.tracking
        ? [view.tracking]
        : [];
  const leafTracking = view.tracking ?? trackings[0] ?? null;
  const carrierDot = leafTracking
    ? carrierBrandDotPaint(resolveCarrierBrand(leafTracking, view.carrier))
    : null;
  const labelItems: CopyChipHoverMenuItem[] | undefined = onOpenLabels
    ? [
        {
          id: 'open-labels',
          label: 'Label',
          icon: <FileText />,
          onSelect: onOpenLabels,
        },
      ]
    : undefined;

  const trackingFace =
    leafTracking && carrierDot ? (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <BrandIdentityDot
          className={carrierDot.className}
          style={carrierDot.style}
          variant="ring"
        />
        <TrackingNumberMenuChip
          value={leafTracking}
          carrierHint={view.carrier}
          showIcon={false}
          dense
          extraItems={labelItems}
        />
      </span>
    ) : onOpenLabels && labelItems ? (
      <CopyChipHoverMenu
        menuLabel="Tracking actions"
        items={labelItems}
        denseLabel
      >
        <GridCellDash />
      </CopyChipHoverMenu>
    ) : (
      <GridCellDash />
    );

  // Operator 2026-09-14:
  // Operator 2026-09-14: the order number displays on EVERY row — expanded
  const identity = view.identityFace ?? null;
  // …and its second-line twin.
  const identitySub = view.identitySubFace ?? null;

  return (
    <CompoundCell
      primary={
        identity ? (
          <HoverTooltip label={identity.label} asChild>
            <CompoundLine mono>
              <CopyableCellValue value={identity.value} dense />
            </CompoundLine>
          </HoverTooltip>
        ) : view.orderId ? (
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
        identitySub ? (
          <HoverTooltip label={identitySub.label} asChild>
            <CompoundLine mono>
              <CopyableCellValue value={identitySub.value} dense />
            </CompoundLine>
          </HoverTooltip>
        ) : (
          trackingFace
        )
      }
    />
  );
}

/** Tone → pill paint. */
const STATE_TONE_CLASS: Record<CompoundStateTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-sunken text-text-muted', dot: 'bg-text-faint' },
  done: { pill: 'bg-surface-sunken text-text-default', dot: 'bg-fill-success' },
  alert: { pill: 'bg-surface-danger text-text-danger', dot: 'bg-fill-danger' },
};

/**
 * DATES column — when it STARTED over how late it IS.
 * (operator 2026-09-04: *"must use the exact same display for the days date the
 * every row a subtraction (operator 2026-09-04). The date is not lost: it is
 */
export function CompoundDates({
  view,
  shipByEdit,
  orderedAtEdit,
}: {
  view: CompoundRowView;
  shipByEdit?: CompoundShipByEdit;
  orderedAtEdit?: CompoundOrderedAtEdit;
}) {
  const face = formatCompoundDelayAgeFace(view.delay, { missingText: EMPTY_META_DASH });

  const dueNode = (
    <CompoundDateField
      dateKey={shipByEdit?.value ?? view.delay?.dateKey ?? null}
      faceLabel={face.text}
      toneClass={face.toneClass}
      onCommit={shipByEdit?.onCommit}
      label="Due date"
      glyph={CalendarClock}
    />
  );

  const dueWrapped = (
    <HoverTooltip label={compoundDatesHoverLabel('due', view.delayTip)} asChild>
      {dueNode}
    </HoverTooltip>
  );

  const startedNode = (
    <CompoundDateField
      dateKey={orderedAtEdit?.value ?? view.orderedAt?.dateKey ?? null}
      faceLabel={view.orderedAt?.label || EMPTY_META_DASH}
      // Quiet ink: the start date is context for the deadline under it, never
      // the thing being triaged on.
      toneClass="text-text-muted"
      onCommit={orderedAtEdit?.onCommit}
      label="Start date"
      glyph={Hash}
    />
  );

  const startedWrapped = (
    <HoverTooltip
      label={compoundDatesHoverLabel('start', view.startedHover ?? view.orderedAt?.tip)}
      asChild
    >
      {startedNode}
    </HoverTooltip>
  );

  return <CompoundCell primary={startedWrapped} secondary={dueWrapped} />;
}

/** One line of the DATES cell — also the To-ship index's Fulfill by cell. */
export const CompoundDateField = forwardRef<
  HTMLDivElement,
  {
    dateKey: string | null;
    faceLabel: string;
    toneClass: string;
    onCommit?: (dateKey: string | null) => void;
    label: string;
    glyph: ComponentType<{ className?: string }>;
  } & HTMLAttributes<HTMLDivElement>
>(function CompoundDateField(
  { dateKey, faceLabel, toneClass, onCommit, label, glyph: Glyph, onClick, onPointerDown, ...rest },
  ref,
) {
  const current = (dateKey ?? '').trim();
  return (
    <div
      ref={ref}
      className="min-w-0 w-full self-stretch"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      {...rest}
    >
      <DateRangePickerField
        variant="compact"
        ariaLabel={label}
        leadingGlyph={Glyph}
        clickCursor
        value={dateKeyToLocalDate(current)}
        faceLabel={faceLabel}
        disabled={!onCommit}
        onChange={(day) => {
          const key = localDateToDateKey(day);
          if (!key || key === current) return;
          onCommit?.(key);
        }}
        className={cn(
          'h-full min-h-0 w-full gap-1 border-0 bg-transparent px-0 py-0 shadow-none',
          'hover:border-0 hover:bg-transparent',
          'disabled:opacity-100 disabled:cursor-pointer',
          'text-role-caption font-medium',
          toneClass,
        )}
      />
    </div>
  );
});

/** Next-step face → paint. Same three tones the pill uses, one line down. */
const NEXT_STEP_TONE_CLASS = {
  next: 'text-text-muted',
  done: 'text-text-default',
  blocked: 'text-text-danger',
} as const;

/** STATUS column — the state pill over the NEXT STEP. */
export function CompoundState({
  view,
  onOpen,
}: {
  view: CompoundRowView;
  /** Present ⇒ the cell opens the carrier trail (orders desks). */
  onOpen?: () => void;
}) {
  const tone = STATE_TONE_CLASS[view.stateTone];
  // A lifecycle state's dot wears its LIFECYCLE colour (packed purple, shipped green).
  const dot = view.stateLifecycle ? LIFECYCLE_CLASSES[view.stateLifecycle].dot : tone.dot;
  const next = view.nextStep ?? null;

  const nextNode = next ? (
    <CompoundLine
      className={
        next.done
          ? NEXT_STEP_TONE_CLASS.done
          : next.blocked
            ? NEXT_STEP_TONE_CLASS.blocked
            : NEXT_STEP_TONE_CLASS.next
      }
    >
      {next.label}
    </CompoundLine>
  ) : null;

  const pill = (
    <span
      className={cn(
        // Flush-square: ops chrome carries no radius (kinetic-ledger law).
        'inline-flex min-w-0 items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold',
        tone.pill,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      <CompoundLine>{view.stateLabel}</CompoundLine>
    </span>
  );

  const nextWrapped =
    next?.tip && nextNode ? (
      <HoverTooltip label={next.tip} asChild>
        {nextNode}
      </HoverTooltip>
    ) : (
      nextNode
    );

  return (
    <div className="relative flex h-full min-w-0 w-full items-stretch">
      <CompoundCell
        primary={
          view.stateTip && !onOpen ? (
            <HoverTooltip label={view.stateTip} asChild>
              {pill}
            </HoverTooltip>
          ) : (
            pill
          )
        }
        secondary={nextWrapped}
      />
      {onOpen ? (
        <HoverTooltip
          label={view.stateTip || `${view.stateLabel}, open carrier trail`}
          asChild
        >
          <button
            type="button"
            className={cn('absolute inset-0 cursor-pointer', focusRing('cell'))}
            aria-label={`${view.stateLabel}, open carrier trail`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          />
        </HoverTooltip>
      ) : null}
    </div>
  );
}

/** Lifecycle STEP column — the media-object row every dense person-tool uses: */
function CompoundStageStep({
  labels,
  Icon,
  facts,
  assign,
}: {
  labels: Readonly<{ done: string; pending: string }>;
  Icon: (props: { className?: string }) => JSX.Element;
  facts: CompoundStageStepFacts | null;
  /** Present ⇒ pending mark is the assign trigger; done stages ignore it. */
  assign?: CompoundStageAssign;
}) {
  const tip = formatCompoundStageStepLine(facts);
  const filled = Boolean(facts?.at);
  const assignable = canAssignCompoundStage(assign, facts?.at);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const assignedStaffId =
    assign?.selectedStaffId != null && assign.selectedStaffId > 0
      ? assign.selectedStaffId
      : null;
  const actorId = facts?.whoStaffId ?? assignedStaffId;
  const actorName = (facts?.who ?? '').trim() || null;
  const hasActor = Boolean(actorId || actorName);
  // Past tense → exact stamp on the secondary. Pending claim → "Assigned".
  // Stamp also rides the hover tip via `tip`. Pending cells with a host
  // handler open the staff combo on the mark itself.
  const showAssigned = !filled && hasActor;
  const stampLine = filled ? formatCompoundStageStampFace(facts) : null;

  const markFace = hasActor ? (
    <StaffAvatar
      staffId={actorId}
      name={actorName}
      // Stage marks read as colour + initials — a photo often collapses to a
      // white speck at 28px (operator 2026-09-01). Same as phone stage marks.
      avatarPhotoId={null}
      size="sm"
      colorRing
      alt={actorName ?? undefined}
    />
  ) : (
    <span
      aria-hidden
      className={cn(ITEM_RECORD_MOBILE_STAGE.empty, cornerClass('pill'), 'h-7 w-7')}
    />
  );

  const lines = (
    <CompoundCell
      className="flex-1"
      primary={
        filled ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-text-default">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <CompoundLine>{labels.done}</CompoundLine>
          </span>
        ) : showAssigned ? (
          // Claimed but not stamped: keep the column verb (PICK / PACK), not a dash.
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <CompoundLine>{labels.pending}</CompoundLine>
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 text-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <GridCellDash />
            <span className="sr-only">{labels.pending}</span>
          </span>
        )
      }
      secondary={
        stampLine ? (
          <CompoundLine className="text-text-muted" mono>
            {stampLine}
          </CompoundLine>
        ) : showAssigned ? (
          <CompoundLine className="text-text-muted">Assigned</CompoundLine>
        ) : null
      }
    />
  );

  const face = (
    <div className="flex h-full min-w-0 items-center gap-1.5">
      {markFace}
      {lines}
    </div>
  );

  const trigger =
    assignable && assign ? (
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'flex h-full min-w-0 w-full items-center gap-1.5 text-left',
          'hover:bg-surface-hover',
          focusRing,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={hasActor ? `Reassign ${assign.label}` : `Assign ${assign.label}`}
        data-testid="compound-stage-assign-trigger"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((next) => !next);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {markFace}
        {lines}
      </button>
    ) : (
      face
    );

  const body =
    tip && !assignable ? (
      <HoverTooltip label={tip} asChild>
        {trigger}
      </HoverTooltip>
    ) : (
      trigger
    );

  return (
    <>
      {body}
      {assignable && assign ? (
        <StageStaffAssignPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          label={assign.label}
          role={assign.role}
          selectedStaffId={assign.selectedStaffId}
          onCommit={assign.onCommit}
        />
      ) : null}
    </>
  );
}

/** Slot glyphs by catalog `iconKey`. */
const SLOT_STEP_ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  picked: PackageSearch,
  packed: PackingModeStandard,
  scanned_out: ShippingModeScanOut,
};

/** The materialized SLOT cell body — one component for every bound track. */
export function CompoundSlotCell({
  trackKey,
  label,
  iconKey,
  displayType,
  stageLabels,
  view,
  assign,
}: {
  trackKey: string;
  label: string;
  iconKey?: string;
  displayType?: FieldDisplayType;
  /** Verb faces from the catalog field; falls back to the header label. */
  stageLabels?: Readonly<{ done: string; pending: string }>;
  view: CompoundRowView;
  /** Present ⇒ pending stage mark opens assign; done stays read-only. */
  assign?: CompoundStageAssign;
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
        assign={assign}
      />
    );
  }
  if (displayType === 'person' || value?.kind === 'person') {
    const person = value?.kind === 'person' ? value : null;
    const name = String(person?.name ?? '').trim() || null;
    const staffId = person?.staffId ?? null;
    if (!name && staffId == null) {
      return <CompoundCell primary={<GridCellDash />} secondary={null} />;
    }
    return (
      <CompoundCell
        primary={
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <StaffAvatar staffId={staffId} name={name} size="xs" alt="" />
            <HoverTooltip label={name ?? 'Staff'} asChild>
              <CompoundLine className="min-w-0 truncate">{name ?? '—'}</CompoundLine>
            </HoverTooltip>
          </span>
        }
        secondary={null}
      />
    );
  }
  const text = value?.kind === 'value' ? value.text : null;
  return <CompoundCell primary={compoundSlotPrimary(displayType, text)} secondary={null} />;
}

/** The slot body for a plain resolved fact — chosen by the field's DISPLAY TYPE, never by its id. */
function compoundSlotPrimary(
  displayType: FieldDisplayType | undefined,
  text: string | null,
): ReactNode {
  if (!text) return <GridCellDash />;
  switch (compoundSlotFaceFor(displayType)) {
    case 'age': {
      const face = compoundSlotAgeFace(text);
      // Not an instant after all (a civil day, a free string): paint it as-is
      // rather than dashing a fact the resolver did hand over.
      if (!face) break;
      return (
        <HoverTooltip label={compoundSlotInstantFace(text) ?? text} asChild>
          <CompoundLine className="text-text-faint">{face}</CompoundLine>
        </HoverTooltip>
      );
    }
    case 'tag':
      return (
        <HoverTooltip label={text} asChild>
          <span className="inline-flex min-w-0 max-w-full items-center truncate rounded-mode-control bg-surface-sunken px-1.5 py-0.5 font-sans text-role-micro text-text-muted industrial:font-mono">
            {text}
          </span>
        </HoverTooltip>
      );
    case 'code':
      return (
        <HoverTooltip label={text} asChild>
          <CompoundLine>
            <CopyableCellValue value={text} className="min-w-0 text-role-data" />
          </CompoundLine>
        </HoverTooltip>
      );
    default:
      break;
  }
  return (
    <HoverTooltip label={text} asChild>
      <CompoundLine>{text}</CompoundLine>
    </HoverTooltip>
  );
}

/** ACTIONS column — the row's ⋮ menu. */
export function CompoundActions({
  onOpen,
  actions,
  label,
  staffRoster,
}: {
  onOpen?: () => void;
  actions?: readonly CompoundRowAction[];
  /** Names WHICH row the menu belongs to, for screen readers. */
  label?: string;
  /** Present ⇒ the actions track mounts the all-staff Picker / Packer roster. */
  staffRoster?: boolean;
}) {
  const items: CompoundRowAction[] = [
    ...(onOpen ? [{ key: 'open', label: 'Open', onSelect: onOpen }] : []),
    ...(actions ?? []),
  ];
  if (items.length === 0 && !staffRoster) return null;

  return (
    <div className="flex items-center justify-start gap-0.5">
      {staffRoster ? <CompoundStaffRosterButton label={label} /> : null}
      {items.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-label={label ? `Actions for ${label}` : 'Row actions'}
              data-row-actions
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center text-text-faint',
                'hover:text-text-default focus-visible:opacity-100',
                focusRing('control'),
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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
      ) : null}
    </div>
  );
}

/** Column 5 — the record affordance. */
function CompoundOpen({ onOpen }: { onOpen?: () => void }) {
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
