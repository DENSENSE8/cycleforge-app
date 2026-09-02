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

import { useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Package,
  PackageSearch,
  PackingModeStandard,
  Pencil,
  ShippingModeScanOut,
} from '@/components/Icons';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import { StaffAvatar } from '@/components/identity';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { cornerClass } from '@/design-system/tokens/radius';
import { ITEM_RECORD_MOBILE_STAGE } from '@/design-system/tokens/item-record-mobile';
import { GridClickSelectFace, GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
import { useSlotLayoutReorder } from '@/components/tables/SlotLayoutReorderContext';
import { useSubtitlePointerReorder } from './useSubtitlePointerReorder';
import { CompoundCell, CompoundLine } from './CompoundCell';
import { ProductTitleLink } from './ProductTitleLink';
import { COMPOUND_GUTTER_PX, COMPOUND_ROW_PX } from './compound-row-chrome';
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
  formatCompoundDelayFace,
  formatCompoundStageStepLine,
  type CompoundRowAction,
  type CompoundRowView,
  type CompoundShipByEdit,
  type CompoundSlotValue,
  type CompoundStageAssign,
  type CompoundStaffRoster,
  type CompoundStageStepFacts,
  type CompoundStateTone,
  type CompoundSubtitlePart,
  type CompoundSubtitleSelect,
  type CompoundSubtitleEdit,
} from './compound-row-model';
import { StageStaffAssignPopover } from './StageStaffAssignPopover';
import { CompoundStaffRosterButton } from './CompoundStaffRosterButton';

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
  /** Receives the click's modifier state so shift-click can extend a range. */
  onToggle?: (event: { shiftKey: boolean }) => void;
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
/**
 * A subtitle part being retyped.
 *
 * Opens on click, commits on Enter or blur, abandons on Escape — the shape an
 * operator already knows from a spreadsheet, and the reason this is a bare
 * input rather than the DS `InlineEditableValue` (which is a controlled
 * per-keystroke component with no consumers, so adopting it here would mean
 * owning its state anyway plus a second editing grammar on one line).
 *
 * It writes only on a real change. An editor that opens and closes untouched
 * firing a mutation is how a queue gets audit rows nobody caused.
 */
function CompoundSubtitleTextEditor({
  part,
  edit,
  face,
  skipClick,
}: {
  part: CompoundSubtitlePart;
  edit: CompoundSubtitleEdit;
  face: ReactNode;
  skipClick?: () => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(edit.value);

  const open = () => {
    setDraft(edit.value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === edit.value.trim()) return;
    edit.onCommit(next.length > 0 ? next : null);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        inputMode={edit.kind === 'numeric' ? 'numeric' : undefined}
        placeholder={edit.placeholder}
        aria-label={edit.label}
        size={part.widthCh ?? 2}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className={cn(
          // Caret only — no padded box, no border, no focus ring. The idle
          // face is the quantity on the caption track; editing is typing into
          // that same run.
          'm-0 appearance-none border-0 bg-transparent p-0 shadow-none',
          'h-3 tabular-nums leading-none outline-none',
          part.toneClass ?? 'text-text-muted',
        )}
        style={part.widthCh != null ? { width: `${part.widthCh}ch` } : { width: '2ch' }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={`Edit ${edit.label.toLowerCase()}: ${part.text}`}
      onClick={(event) => {
        event.stopPropagation();
        if (skipClick?.()) return;
        open();
      }}
      className={cn(
        'ds-raw-button inline-flex h-3 min-w-0 items-center leading-none text-left',
        'hover:underline decoration-dotted underline-offset-2',
        part.toneClass ?? 'text-text-muted',
        focusRing('control'),
      )}
    >
      {face}
    </span>
  );
}

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

/**
 * Condition (and any other subtitle select) — click opens, hold-and-move
 * reorders. Radix DropdownMenuTrigger toggles on pointerdown, which is the
 * same press that starts a drag, so this menu is controlled and forced shut
 * while the line is being reordered.
 */
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
  );
}

/**
 * The NOTE at the end of the subtitle line.
 *
 * Empty → the FileText glyph (a click target that does not invent prose).
 * Written → the note itself as muted caption text, truncated so qty /
 * condition / listing stay put. Click opens the editor, which always seeds
 * from the note that is already there.
 *
 * The editor opens below the trigger and grows to the RIGHT (`side="bottom"`
 * `align="start"`). The facts sit under the title on the left; `align="end"`
 * would throw the 16rem panel left into the select gutter. Collision
 * flipping stays off so a tight viewport cannot send it bottom-left.
 */
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

  const glyph = (
    <FileText className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
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
        <span
          role="button"
          tabIndex={-1}
          aria-label={has ? `Edit note: ${body}` : 'Add a note'}
          title={has ? body : 'Add a note'}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'ds-raw-button inline-flex h-3 items-center leading-none',
            has ? 'min-w-0 max-w-[12rem]' : 'shrink-0',
            focusRing('control'),
          )}
        >
          {face}
        </span>
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
}) {
  // Bound subtitles REPLACE the note line: parts in binding order, sitting
  // LEFT under the title. Item number is intentionally not painted here; its
  // actions live on the product title hover surface. Notes stay in that
  // cluster. Absent parts ⇒ the legacy note fallback.
  const parts = view.subtitleParts;
  const selectFor = (part: CompoundSubtitlePart): CompoundSubtitleSelect | undefined =>
    part.key ? subtitleSelects?.find((s) => s.partKey === part.key) : undefined;

  const editFor = (part: CompoundSubtitlePart): CompoundSubtitleEdit | undefined =>
    part.key ? subtitleEdits?.find((e) => e.partKey === part.key) : undefined;
  const itemNumberPart = parts?.find((part) => isItemNumberSubtitlePart(part.key));
  const itemNumberEdit = subtitleEdits?.find((edit) => isItemNumberSubtitlePart(edit.partKey));
  const itemNumberValue = String(itemNumberPart?.text ?? itemNumberEdit?.value ?? '').trim();
  const listingHref = String(view.titleHref ?? '').trim() || null;
  const [editingItemNumber, setEditingItemNumber] = useState(false);

  /*
   * Click-and-hold reorder of the under-title facts.
   *
   * Headers still use HTML5 drag (an empty `select-none` cell). This line
   * cannot: nested editors, a Radix menu that opens on pointerdown, and
   * 1–2ch of selectable text all steal the native drag. Pointer tracking
   * on `window` is the display method — same write (`onReorderByDrop`),
   * destination named by field id. Notes stay in the left cluster and are
   * not a drop target. See `useSubtitlePointerReorder`.
   */
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
          part.widthCh != null && 'tabular-nums',
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
          reorderable && (draggingKey ? 'cursor-grabbing' : 'cursor-grab'),
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

  /*
   * Notes stay in the left cluster (after qty / condition). They
   * used to pin right, which is what made the under-title facts look like
   * they belonged to the identity column. The editor still opens to the
   * bottom-right of the glyph — that is a menu placement, not a face.
   */
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

  const flagMark = view.flagMark ?? null;
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

  const titleLine = view.title ? (
    <ProductTitleLink title={view.title} href={listingHref} />
  ) : (
    <span className="text-text-faint">Untitled</span>
  );
  const titleWithActions = titleActions.length > 0 ? (
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
            {titleWithActions}
          </span>
        ) : (
          titleWithActions
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
 * To-ship Label is an extraItems row: it opens the paperwork walk (table XOR
 * {@link PaperworkWalkHost}), it does not paint a second chip or an in-row band.
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
  const carrierDot = view.tracking
    ? carrierBrandDotPaint(resolveCarrierBrand(view.tracking, view.carrier))
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
 * The second line is WHEN the row must ship (civil day), not a relative
 * "On time" / "1d late" that hides the date. Lateness is tone + a suffix.
 * Families that never supplied a date keep the relative face.
 *
 * Editable ship-by is {@link DateRangePickerField} `variant="compact"` —
 * one day, calendar only, click commits. Never a range filter, never a
 * native date input, never a click-to-retype caption.
 */
export function CompoundState({
  view,
  shipByEdit,
}: {
  view: CompoundRowView;
  shipByEdit?: CompoundShipByEdit;
}) {
  const tone = STATE_TONE_CLASS[view.stateTone];
  const face = formatCompoundDelayFace(view.delay, {
    editable: Boolean(shipByEdit),
    missingText: EMPTY_META_DASH,
  });
  const delayNode = shipByEdit ? (
    <div
      className="min-w-0 w-full self-stretch"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DateRangePickerField
        variant="compact"
        value={dateKeyToLocalDate(shipByEdit.value)}
        onChange={(day) => {
          const key = localDateToDateKey(day);
          if (!key || key === shipByEdit.value.trim()) return;
          shipByEdit.onCommit(key);
        }}
        className={cn(
          'h-full min-h-0 w-full gap-1 border-0 bg-transparent px-0 py-0 shadow-none',
          'hover:border-0 hover:bg-transparent',
          'text-role-caption font-medium',
          face.toneClass,
        )}
      />
    </div>
  ) : (
    <CompoundLine className={face.toneClass}>{face.text}</CompoundLine>
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

  const delayWrapped =
    view.delayTip && !shipByEdit ? (
      <HoverTooltip label={view.delayTip} asChild>
        {delayNode}
      </HoverTooltip>
    ) : (
      delayNode
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
      secondary={delayWrapped}
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
 * - **The verb marks what HAPPENED; nothing-yet is dotted empty + dash.**
 *   The done face ("Tested" / "Picked" / "Packed") paints once the event's
 *   timestamp lands. Before that the line keeps the step's glyph (the column
 *   identity survives) with {@link ITEM_RECORD_MOBILE_STAGE.empty} (dashed
 *   circle + pill corner) where the avatar would be, and the house
 *   {@link GridCellDash} beside the glyph. The catalog's `pending` face
 *   survives as the circle's accessible name only, so AT still hears the
 *   state. An assigned-but-undone row keeps the assignee's mark beside the
 *   dash — "this is Michael's" is still the actionable read. When
 *   {@link CompoundStageAssign} is present and the step has no `at`, the
 *   empty dashed mark (and the pending claimed mark) is the combo trigger:
 *   click opens {@link StageStaffAssignPopover}. Stamped steps stay
 *   read-only. Bulk assign stays the column-foot person icons. Full roster;
 *   no WorkOrder grid.
 * - **The name lives in the tooltip.** Names are ragged; the mark is 28px
 *   always. The full `who · time · station` line rides the hover, and the
 *   mark's `alt` names the actor for screen readers.
 * - **Past-tense second line is the stamp.** Once `at` is set the verb paints
 *   on the primary (PICKED / PACKED) and the secondary is the exact date/time
 *   — never the word Assigned. Pending + assignee paints the catalog pending
 *   verb (PICK / PACK) with Assigned underneath — never a dash.
 *
 * The two text lines stay {@link CompoundCell}'s fixed tracks, so the verb
 * baseline still locks to the state/item columns — the avatar is a leading
 * flex sibling, never a third row.
 *
 * An unclaimed / unstamped step paints an empty circle in the mark's slot
 * (same 28px as the `sm` avatar) and a dash next to the glyph — Pick and
 * Packed share this face; neither invents a blank cell. That empty face is
 * the assign combo when the host armed {@link CompoundStageAssign}.
 */
export function CompoundStageStep({
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
  const stampLine = filled ? (facts?.at ?? null) : null;

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
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-default">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <CompoundLine>{labels.done}</CompoundLine>
          </span>
        ) : showAssigned ? (
          // Claimed but not stamped: keep the column verb (PICK / PACK), not a dash.
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
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
          onSetLaneRole={assign.onSetLaneRole}
        />
      ) : null}
    </>
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
 * control on every row would double the tab stops in a 500-row grid. The
 * keyboard path is the row's, not this button's — a focused row opens this menu
 * with Shift+F10 or the Menu key, and a right-click opens it too, both through
 * `compound-row-actions.ts`. (That module exists because this docblock used to
 * claim the context-menu path as a fact while no row in the product bound one.)
 *
 * Renders nothing when a family passes neither an open handler nor actions — an
 * affordance that looks clickable and does nothing is worse than an empty track.
 */
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
  staffRoster?: CompoundStaffRoster;
}) {
  const items: CompoundRowAction[] = [
    ...(onOpen ? [{ key: 'open', label: 'Open', onSelect: onOpen }] : []),
    ...(actions ?? []),
  ];
  if (items.length === 0 && !staffRoster) return null;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {staffRoster ? <CompoundStaffRosterButton roster={staffRoster} label={label} /> : null}
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
                'opacity-0 transition-opacity group-hover/row:opacity-100',
                'data-[state=open]:opacity-100',
                'hover:text-text-default focus-visible:opacity-100',
                focusRing('control'),
              )}
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
      ) : null}
    </div>
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
