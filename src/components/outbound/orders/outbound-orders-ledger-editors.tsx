'use client';

/** Industrial ledger inline editors — ship-by, pick / pack assign, condition and quantity. */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useAppendOrderNote } from '@/hooks/useOrderNotes';
import { toast } from '@/lib/toast';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { usePlatformAccountCatalog, usePlatformCatalog, useStoreLinks } from '@/hooks/useCatalog';
import { orderPlatformChoices } from '@/lib/platform-display';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { ToolbarListboxOption } from '@/design-system/primitives/ToolbarListbox';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { ExternalLinkActionIcon } from '@/design-system/components/ExternalLinkActionIcon';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import type { StageStaffLane } from '@/components/tables/compound/staff-stage-lane';
import {
  formatCompoundStageStepLine,
  type CompoundSlotValue,
  type CompoundStageStepFacts,
} from '@/components/tables/compound/compound-row-model';
import { Check, Copy, Pencil, ResizeCorner, Tag } from '@/components/Icons';
import { conditionGradeTextClass, conditionGradeTone, orderRowQtyTone } from '@/lib/condition-tone';
import {
  conditionGradeTableLabel,
  conditionOptions,
  EMPTY_META_DASH,
  resolveConditionGrade,
} from '@/lib/conditions';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  RECORD_CONDITION_CHIP_CLASS,
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_QTY_BADGE_CLASS,
  RECORD_RECESS_CLASS,
  RECORD_TRAILING_ACTION_CLASS,
  RECORD_TRAILING_GLYPH_INSET_CLASS,
} from '@/design-system/tokens/industrial-record';
import { LEDGER_HIT_CLASS } from './outbound-orders-ledger-geometry';

/** Stops a control's click from reaching the row's open target. */
export function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/**
 * The empty staff slot beside a stage stamp — a dashed outline the size of an
 * `xs` record mark, on the mode's control corner so it matches the mark it
 * stands in for (square on the Floor, rounded in triage).
 */
export const UNASSIGNED_MARK_CLASS = 'h-5 w-5 shrink-0 rounded-mode-control border border-dashed border-mode-edge';

const CONDITION_OPTIONS = conditionOptions('table').map((opt) => ({
  value: opt.value as string,
  label: opt.label,
  toneClass: conditionGradeTextClass(opt.value),
}));

export function stageFacts(value: CompoundSlotValue | null): CompoundStageStepFacts | null {
  return value && value.kind === 'stage_event' ? value : null;
}

/**
 * The listing — a first-class fact, not a hover menu item (owner 2026-09-24).
 * the record's first band, right end, beside the ship-by (owner 2026-09-25); `value` — `<item #> ↗`
 */
export { RecordListingLink as LedgerListingLink } from '@/design-system/components/record-ledger/RecordIdentity';

// ── Inline editors (instant commit, 32px hit, never open the row) ───────────

export function LedgerShipBy({
  dateKey,
  overdueDays,
  dueToday,
  tip,
  onCommit,
}: {
  dateKey: string | null;
  overdueDays: number;
  dueToday: boolean;
  tip?: string;
  onCommit: (dateKey: string) => void;
}) {
  const current = (dateKey ?? '').trim();
  // Due today reads in ink; the face itself is shared with the phone record.
  const face = formatShipByFace(current, overdueDays);
  return (
    <HoverTooltip label={tip ?? 'Ship by'} asChild>
      <div className="h-full w-full" onClick={stop} onPointerDown={stop}>
        <DateRangePickerField
          variant="compact"
          ariaLabel="Ship by"
          clickCursor
          value={dateKeyToLocalDate(current)}
          faceLabel={face}
          onChange={(day) => {
            const key = localDateToDateKey(day);
            if (!key || key === current) return;
            onCommit(key);
          }}
          className={cn(
            'h-full min-h-mode-hit w-full gap-1 rounded-mode-control border-0 bg-transparent px-2 py-0 shadow-none',
            'hover:border-0 hover:bg-mode-hover',
            RECORD_LABEL_CLASS,
            overdueDays > 0 ? STATE_TONE_CLASSES.danger.text : dueToday ? 'text-mode-ink' : 'text-mode-muted',
          )}
        />
      </div>
    </HoverTooltip>
  );
}

export function LedgerStageAssign({
  verb,
  doneVerb,
  role,
  facts,
  selectedStaffId,
  assignedName,
  onCommit,
  showStamp = false,
}: {
  verb: string;
  doneVerb: string;
  /** Staff list lane: Pick / Pack functional roles, or `all` (QC — no floor role). */
  role: StageStaffLane;
  facts: CompoundStageStepFacts | null;
  selectedStaffId: number | null;
  /** Assignee face (`---` = nobody) — shown until the step is stamped. */
  assignedName: string;
  /** Absent ⇒ read-only (the paperwork walk shows who and when, it does not assign). */
  onCommit?: (staffId: number | null, staffName: string | null) => void;
  /**
   * Paint the step's date + time beneath the status face. Compact mounts may
   * leave it off and retain the same full stamp in the hover label.
   */
  showStamp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const done = Boolean(facts?.at);
  // Assign chrome only while armed and unstamped (`canAssignCompoundStage`).
  const assignable = Boolean(onCommit) && !done;
  const actorId = facts?.whoStaffId ?? selectedStaffId;
  const actorName =
    (facts?.who ?? '').trim() ||
    (selectedStaffId && assignedName !== '---' ? assignedName : '') ||
    null;
  const hasActor = Boolean(actorId || actorName);
  const tip = formatCompoundStageStepLine(facts);

  // Label muted, value ink (BRIEF §4): the verb is the label; the operator's
  // name is the value, so it reads in ink. Only the empty `—` stays muted.
  const who = (
    <>
      <span className={cn(RECORD_LABEL_CLASS, done ? 'text-mode-ink' : 'text-mode-muted')}>
        {done ? doneVerb : verb}
      </span>
      <span className={cn('min-w-0 truncate text-role-caption', actorName ? 'text-mode-ink' : 'text-mode-muted')}>
        {actorName ?? (hasActor ? '' : '—')}
      </span>
    </>
  );
  const face = (
    <>
      {hasActor ? (
        <StaffAvatar staffId={actorId} name={actorName} avatarPhotoId={null} size="xs" colorRing face="record" alt={actorName ?? undefined} />
      ) : (
        <span aria-hidden className={UNASSIGNED_MARK_CLASS} />
      )}
      {showStamp ? (
        <span className="flex min-w-0 flex-col py-1">
          <span className="flex min-w-0 items-center gap-1.5">{who}</span>
          <span
            data-testid={`ledger-stage-stamp-${role}`}
            // The execution band is one 32px ledger line:
            className={cn(
              'whitespace-nowrap font-mono text-[9px] leading-none tracking-[-0.02em] tabular-nums',
              done ? 'text-mode-ink' : 'text-mode-muted',
            )}
          >
            {facts?.at ?? 'Not yet'}
          </span>
        </span>
      ) : (
        who
      )}
    </>
  );

  const body = assignable ? (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={hasActor ? `Reassign ${verb}` : `Assign ${verb}`}
      data-testid={`ledger-assign-${role}`}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((v) => !v);
      }}
      onPointerDown={stop}
      className={cn(
        'ds-raw-button flex h-full w-full min-w-0 items-center gap-1.5 px-1 text-left hover:bg-mode-hover',
        LEDGER_HIT_CLASS,
        focusRing('cell'),
      )}
    >
      {face}
    </button>
  ) : (
    <span className={cn('flex h-full w-full min-w-0 items-center gap-1.5 px-1', LEDGER_HIT_CLASS)}>{face}</span>
  );

  return (
    <>
      {tip && !assignable && !showStamp ? (
        <HoverTooltip label={tip} asChild>
          {body}
        </HoverTooltip>
      ) : (
        body
      )}
      {assignable && onCommit ? (
        <StageStaffAssignPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          label={verb}
          role={role}
          selectedStaffId={selectedStaffId}
          onCommit={onCommit}
        />
      ) : null}
    </>
  );
}

/**
 * Condition, click to set.
 * (owner 2026-09-25) — inside a full-height 32px hit area. No grade → the same
 */
export function LedgerCondition({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = resolveConditionGrade(value);
  const label = conditionGradeTableLabel(value);
  const empty = label === EMPTY_META_DASH;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Condition, ${empty ? 'not set' : label}`}
          title={empty ? 'Set condition' : label}
          data-testid="ledger-condition"
          onClick={stop}
          onPointerDown={stop}
          className={cn(
            'ds-raw-button flex h-full w-full items-center px-1 hover:bg-mode-hover',
            LEDGER_HIT_CLASS,
            focusRing('cell'),
          )}
        >
          <span
            aria-hidden
            data-testid="ledger-condition-chip"
            className={cn(
              RECORD_CONDITION_CHIP_CLASS,
              empty ? 'bg-mode-well text-mode-muted' : conditionGradeTone(value).solid,
            )}
          >
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate">{empty ? '—' : label}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={0} className="w-48 rounded-mode p-0.5" onClick={stop}>
        <ul role="listbox" aria-label="Condition" className="flex flex-col">
          {CONDITION_OPTIONS.map((opt, index) => (
            <li key={opt.value}>
              <ToolbarListboxOption
                index={index}
                selected={current === opt.value}
                checkAlign="end"
                onClick={() => {
                  setOpen(false);
                  if (current !== opt.value) onCommit(opt.value);
                }}
              >
                <span className={opt.toneClass}>{opt.label}</span>
              </ToolbarListboxOption>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Quantity, click to edit. `bare` — the number alone, left-set, where a fact
 * row already says "Quantity" (evidence column); the row face keeps `QTY n`.
 */
export function LedgerQty({
  value,
  onCommit,
  bare = false,
}: {
  value: number;
  onCommit: (value: string) => void;
  bare?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n === value) return;
    onCommit(String(n));
  };
  if (editing) {
    return (
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        autoFocus
        aria-label="Quantity"
        data-testid="ledger-qty-input"
        value={draft}
        onClick={stop}
        onPointerDown={stop}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setEditing(false);
        }}
        className={cn(
          'h-full w-full rounded-mode-control border-0 bg-mode-panel px-2 outline outline-2 -outline-offset-2 outline-mode-ink',
          bare ? 'text-left' : 'text-right',
          RECORD_ID_CLASS,
        )}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Quantity ${value}, edit`}
      data-testid="ledger-qty"
      onClick={(event) => {
        event.stopPropagation();
        setDraft(String(value));
        setEditing(true);
      }}
      onPointerDown={stop}
      className={cn(
        'ds-raw-button flex h-full w-full items-center gap-1 hover:bg-mode-hover',
        bare ? 'justify-start px-0' : 'justify-end px-2',
        LEDGER_HIT_CLASS,
        focusRing('cell'),
      )}
    >
      {bare ? null : <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Qty</span>}
      <span className={cn(bare ? RECORD_ID_CLASS : RECORD_QTY_BADGE_CLASS, orderRowQtyTone(value))}>{value}</span>
    </button>
  );
}

/**
 * Evidence-column pickers read as a plain fact value (no card, no rule), like
 * Ship by; the ⌄ sits on the trailing-cell axis with every other right-edge glyph.
 */
const INLINE_PICKER_CLASS = cn(
  '-ml-2 h-8 w-[calc(100%+0.5rem)] rounded-mode-control border-0 bg-transparent pl-2 hover:bg-mode-hover',
  RECORD_TRAILING_GLYPH_INSET_CLASS,
);

/** Platform correction in the evidence column: */
export function LedgerPlatformPicker({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (accountSource: string) => void;
}) {
  const { rows: platforms, options: builtin, isLoading } = usePlatformCatalog();
  const { rows: accounts } = usePlatformAccountCatalog();
  const { rows: links, isLoading: linksLoading } = useStoreLinks();
  const options = useMemo(
    () =>
      platforms.length === 0
        ? builtin.map((o) => ({ value: o.value, label: o.label }))
        : orderPlatformChoices(platforms, accounts, links),
    [accounts, builtin, links, platforms],
  );
  const current = String(value ?? '').trim().toLowerCase();
  const selected =
    options.find((o) => String(o.value).toLowerCase() === current)?.value ??
    options.find((o) => o.label.toLowerCase() === current)?.value ??
    null;
  return (
    <SearchableSelectField
      value={selected}
      onChange={(next) => {
        if (next == null || next === selected) return;
        onCommit(String(next));
      }}
      options={options}
      loading={isLoading || linksLoading}
      appearance="flush"
      placeholder={value?.trim() || 'Set platform'}
      searchPlaceholder="Platform or connection…"
      emptyMessage="No matching platform"
      ariaLabel="Change platform"
      testId="evidence-platform-picker"
      className={INLINE_PICKER_CLASS}
    />
  );
}

/**
 * The SKU's home bin, set from the evidence column (owner 2026-09-24): pick a
 * location and it becomes `sku_stock.location` for this SKU. Bin PAIRING by
 * scan stays the phone verb; this is the desk's typed correction.
 */
export function LedgerSkuBinPicker({
  sku,
  current,
  onCommit,
}: {
  sku: string | null;
  current: string | null;
  onCommit: (locationBarcode: string) => void;
}) {
  // Just in time: the bin list loads on the first open, not with the record.
  const [wanted, setWanted] = useState(false);
  const { options, loading } = useLocationPickerOptions({ enabled: wanted });
  return (
    <SearchableSelectField
      value={null}
      onChange={(next) => {
        if (next == null) return;
        onCommit(String(next));
      }}
      options={options}
      loading={loading}
      disabled={!sku}
      appearance="flush"
      placeholder={sku ? (current ? 'Change SKU bin' : 'Set SKU bin') : 'No SKU'}
      searchPlaceholder="Bin code, name or room…"
      emptyMessage="No matching location"
      ariaLabel={sku ? `Set the bin for SKU ${sku}` : 'Set bin (no SKU)'}
      testId="evidence-sku-bin-picker"
      onOpenChange={(open) => {
        if (open) setWanted(true);
      }}
      className={INLINE_PICKER_CLASS}
    />
  );
}

/**
 * The open action beside an identifier in the details panel (order #,
 * tracking #). The identifier copies; this opens.
 */
export function LedgerOpenAction({ href, label }: { href: string | null; label: string }) {
  return (
    <ExternalLinkActionIcon
      href={href}
      ariaLabel={`Open ${label}`}
      title={`Open ${label}`}
      radius="control"
      className={cn(RECORD_TRAILING_ACTION_CLASS, focusRing('control'))}
    />
  );
}

/**
 * Copy as the row's secondary action, far right — for a value whose own
 * click opens something (the listing link), so copy cannot live on the value.
 */
export function LedgerCopyAction({ value, label }: { value: string | null; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied: nothing to undo.
    }
  };
  return (
    <HoverTooltip label={copied ? 'Copied' : `Copy ${label}`} asChild placement="above">
      <button
        type="button"
        disabled={!value}
        onClick={copy}
        aria-label={`Copy ${label}`}
        data-testid="evidence-copy-action"
        className={cn('ds-raw-button disabled:opacity-35', RECORD_TRAILING_ACTION_CLASS, focusRing('control'))}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </HoverTooltip>
  );
}

/**
 * Replace the order's carrier tracking # from the evidence column. Writes the
 * primary tracking through the assign waist (`shippingTrackingNumber` →
 * `upsertOrderTracking`), the same path Add TRK# uses.
 */
export function LedgerTrackingReplace({
  current,
  onCommit,
}: {
  current: string | null;
  onCommit: (tracking: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="evidence-tracking-replace"
          onClick={stop}
          aria-label={current ? 'Replace tracking number' : 'Add tracking number'}
          title={current ? 'Replace tracking number' : 'Add tracking number'}
          className={cn('ds-raw-button', RECORD_TRAILING_ACTION_CLASS, focusRing('control'))}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={0} className="w-72 rounded-mode p-2" onClick={stop}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (!next || next === current) return;
            onCommit(next);
            setOpen(false);
          }}
        >
          {current ? <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Replaces {current}</p> : null}
          <input
            autoFocus
            aria-label="New tracking number"
            data-testid="evidence-tracking-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className={cn(RECORD_ID_CLASS, 'w-full rounded-mode-control border border-mode-control bg-mode-panel p-2 text-mode-ink')}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={cn(
              'ds-raw-button self-end bg-mode-ink px-3 text-mode-bar disabled:opacity-50',
              LEDGER_HIT_CLASS,
              RECORD_LABEL_CLASS,
              focusRing('control'),
            )}
          >
            {current ? 'Replace tracking' : 'Add tracking'}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const NOTE_MIN_PX = 32;
const NOTE_MAX_PX = 480;

type NoteSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Only a save in flight or its result speaks; an idle field says nothing (owner 2026-09-27: no "Autosaves"). */
const NOTE_STATUS_FACE: Readonly<Record<NoteSaveStatus, string>> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

/** The order note, edited in place — one field for the row's NOTE overlay and the record's Notes group, so both write the same way. Its host titles it; the field carries no caption of its own. */
export function LedgerNoteField({
  orderId,
  note,
  onSaved,
  onDone,
}: {
  orderId: number;
  note: string | null;
  onSaved?: (note: string) => void;
  /**
   * Enter / Escape finished the edit (already saved). An overlay host closes
   * itself here; without it the field just blurs, which saves the same way.
   */
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState(note ?? '');
  const [height, setHeight] = useState<number | null>(null);
  const [status, setStatus] = useState<NoteSaveStatus>('idle');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(note ?? '');
  const committedRef = useRef((note ?? '').trim());
  const onSavedRef = useRef(onSaved);
  const { mutateAsync } = useAppendOrderNote(orderId);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  // A refreshed note face lands while the field is idle; never under the caret.
  useEffect(() => {
    committedRef.current = (note ?? '').trim();
    if (document.activeElement === areaRef.current) return;
    draftRef.current = note ?? '';
    setDraft(note ?? '');
  }, [note]);

  const commit = useCallback(() => {
    const next = draftRef.current.trim();
    const previous = committedRef.current;
    if (!next || next === previous) return;
    committedRef.current = next;
    setStatus('saving');
    mutateAsync(next).then(
      () => {
        setStatus('saved');
        toast.success('Note saved');
        onSavedRef.current?.(next);
      },
      () => {
        committedRef.current = previous;
        setStatus('error');
        toast.error('Could not save the note');
      },
    );
  }, [mutateAsync]);

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  useEffect(() => () => commitRef.current(), []);

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const area = areaRef.current;
    if (!area) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startHeight = area.getBoundingClientRect().height;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      setHeight(Math.min(NOTE_MAX_PX, Math.max(NOTE_MIN_PX, startHeight + moveEvent.clientY - startY)));
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const statusId = useId();
  const finish = () => {
    commit();
    if (onDone) onDone();
    else areaRef.current?.blur();
  };

  const statusFace = (
    <span
      id={statusId}
      data-testid="ledger-note-status"
      className={cn(RECORD_LABEL_CLASS, status === 'error' ? 'text-mode-warn' : 'text-mode-muted')}
    >
      {NOTE_STATUS_FACE[status]}
    </span>
  );

  return (
    <span className="flex w-full flex-col gap-1" onClick={stop} onPointerDown={stop}>
      <span className="relative block w-full">
        <textarea
          ref={areaRef}
          value={draft}
          onChange={(event) => {
            draftRef.current = event.target.value;
            setDraft(event.target.value);
            if (status !== 'saving') setStatus('idle');
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              finish();
            }
          }}
          rows={2}
          placeholder="Add a note"
          aria-label="Order note"
          aria-describedby={statusId}
          data-testid="ledger-note-field"
          style={height == null ? undefined : { height }}
          className={cn(
            'block min-h-mode-hit w-full resize-none rounded-mode-control bg-mode-well p-1.5 text-role-caption text-mode-ink',
            RECORD_RECESS_CLASS,
            focusRing('field'),
          )}
        />
        <span
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize note"
          data-testid="ledger-note-resize"
          onPointerDown={startResize}
          className="absolute bottom-px right-px flex h-3.5 w-3.5 rounded-br-mode-control cursor-ns-resize touch-none items-center justify-center bg-mode-well text-mode-muted hover:text-mode-ink"
        >
          <ResizeCorner className="h-3.5 w-3.5" />
        </span>
      </span>
      {/* Idle says nothing; the status id stays in the DOM for aria-describedby. */}
      {status === 'idle' ? <span id={statusId} hidden /> : <span className="flex justify-end">{statusFace}</span>}
    </span>
  );
}
