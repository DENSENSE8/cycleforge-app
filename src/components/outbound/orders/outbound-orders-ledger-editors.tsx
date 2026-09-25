'use client';

/**
 * Industrial ledger inline editors — ship-by, pick / pack assign, condition
 * and quantity. Each is a 32px desk control that commits instantly
 * through the queue feed's one waist (`OrdersQueueCommits`) and stops its
 * click from reaching the row's open target. Shared by the ledger rows and
 * the evidence column so one fact has one editor.
 */

import { useMemo, useRef, useState } from 'react';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { usePlatformAccountCatalog, usePlatformCatalog } from '@/hooks/useCatalog';
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
import {
  canAssignCompoundStage,
  formatCompoundStageStepLine,
  type CompoundSlotValue,
  type CompoundStageStepFacts,
} from '@/components/tables/compound/compound-row-model';
import { ExternalLink, Pencil } from '@/components/Icons';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import {
  conditionGradeTableLabel,
  conditionOptions,
  resolveConditionGrade,
} from '@/lib/conditions';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';
import { formatShipByFace } from '@/lib/orders/ship-by-face';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_QTY_BADGE_CLASS,
} from '@/design-system/tokens/industrial-record';
import {
  LEDGER_HIT_CLASS,
} from './outbound-orders-ledger-geometry';

/** Stops a control's click from reaching the row's open target. */
export function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

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
 * Opens the marketplace listing in a new tab. Faces: `row` — `LISTING ↗` on
 * the facts band, immediately left of the next step; `value` — `<item #> ↗`
 * where a fact row already says "Listing" (evidence column). No listing → a
 * quiet dash, never a dead link. Never opens the row.
 */
export function LedgerListingLink({
  href,
  itemNumber,
  face = 'row',
}: {
  href: string | null;
  itemNumber: string | null;
  face?: 'row' | 'value';
}) {
  const item = (itemNumber ?? '').trim();
  if (!href) {
    return (
      <span
        className={cn(RECORD_LABEL_CLASS, LEDGER_HIT_CLASS, 'flex h-full items-center px-2 text-mode-faint')}
        title="No listing on this order"
      >
        {face === 'row' ? 'Listing —' : '—'}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      onPointerDown={stop}
      aria-label={item ? `Open listing ${item} in a new tab` : 'Open listing in a new tab'}
      title={item ? `Listing ${item}` : href}
      data-testid="ledger-listing-link"
      className={cn(
        'flex h-full min-w-0 items-center gap-1.5 px-2 text-mode-ink hover:bg-mode-hover',
        LEDGER_HIT_CLASS,
        focusRing('cell'),
      )}
    >
      {face === 'row' ? (
        <span className={RECORD_LABEL_CLASS}>Listing</span>
      ) : (
        <span className={cn(RECORD_ID_CLASS, 'min-w-0 truncate underline decoration-mode-edge underline-offset-2')}>
          {item || 'Open'}
        </span>
      )}
      <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

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
            'h-full min-h-mode-hit w-full gap-1 rounded-none border-0 bg-transparent px-2 py-0 shadow-none',
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
  role: 'technician' | 'packer';
  facts: CompoundStageStepFacts | null;
  selectedStaffId: number | null;
  /** Assignee face (`---` = nobody) — shown until the step is stamped. */
  assignedName: string;
  /** Absent ⇒ read-only (the paperwork walk shows who and when, it does not assign). */
  onCommit?: (staffId: number | null, staffName: string | null) => void;
  /**
   * Paint the step's date + time under the name. Detail columns (evidence,
   * paperwork) have the width; the ledger's 7rem cell keeps it on hover.
   */
  showStamp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const done = Boolean(facts?.at);
  const assignable = onCommit
    ? canAssignCompoundStage({ selectedStaffId, label: verb, role, onCommit }, facts?.at)
    : false;
  const actorId = facts?.whoStaffId ?? selectedStaffId;
  const actorName =
    (facts?.who ?? '').trim() ||
    (selectedStaffId && assignedName !== '---' ? assignedName : '') ||
    null;
  const hasActor = Boolean(actorId || actorName);
  const tip = formatCompoundStageStepLine(facts);

  const who = (
    <>
      <span className={cn(RECORD_LABEL_CLASS, done ? 'text-mode-ink' : 'text-mode-muted')}>
        {done ? doneVerb : verb}
      </span>
      <span className="min-w-0 truncate text-role-caption text-mode-muted">
        {actorName ?? (hasActor ? '' : '—')}
      </span>
    </>
  );
  const face = (
    <>
      {hasActor ? (
        <StaffAvatar staffId={actorId} name={actorName} avatarPhotoId={null} size="xs" colorRing shape="square" alt={actorName ?? undefined} />
      ) : (
        <span aria-hidden className={cn('h-5 w-5 shrink-0 border border-dashed border-mode-edge', cornerClass('flush'))} />
      )}
      {showStamp ? (
        <span className="flex min-w-0 flex-col py-1">
          <span className="flex min-w-0 items-center gap-1.5">{who}</span>
          <span
            data-testid={`ledger-stage-stamp-${role}`}
            className={cn('font-mono text-role-caption tabular-nums', done ? 'text-mode-ink' : 'text-mode-muted')}
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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Condition, ${label}`}
          data-testid="ledger-condition"
          onClick={stop}
          onPointerDown={stop}
          className={cn(
            'ds-raw-button flex h-full w-full items-center px-1 text-left hover:bg-mode-hover',
            LEDGER_HIT_CLASS,
            RECORD_LABEL_CLASS,
            focusRing('cell'),
            conditionGradeTextClass(value),
          )}
        >
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={0} className="w-48 rounded-none p-0.5" onClick={stop}>
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
          'h-full w-full rounded-none border-0 bg-mode-panel px-2 outline outline-2 -outline-offset-2 outline-mode-ink',
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
      {bare ? null : <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>QTY</span>}
      <span className={cn(bare ? RECORD_ID_CLASS : RECORD_QTY_BADGE_CLASS, orderRowQtyTone(value))}>{value}</span>
    </button>
  );
}

/** One row of {@link LedgerPlatformPicker}'s searchable list. */
interface PlatformPickerOption {
  value: string;
  label: string;
  meta?: string;
  group?: string;
}

/**
 * Platform correction in the evidence column: an order the import filed under
 * the wrong channel. Options are the org catalog — each platform (slug) and,
 * grouped under it, its connections (account slug) — because
 * `orders.account_source` is hybrid-grain and the resolver reads either. The
 * current value pre-selects whichever grain it names.
 */
export function LedgerPlatformPicker({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (accountSource: string) => void;
}) {
  const { rows: platforms, options: builtin, isLoading } = usePlatformCatalog();
  const { rows: accounts } = usePlatformAccountCatalog();
  const options = useMemo<PlatformPickerOption[]>(() => {
    if (platforms.length === 0) return builtin.map((o) => ({ value: o.value, label: o.label }));
    const out: PlatformPickerOption[] = [];
    for (const p of platforms) {
      if (!p.is_active) continue;
      out.push({ value: p.slug, label: p.label, group: p.label });
      for (const a of accounts) {
        if (a.platform_id !== p.id || !a.is_active || a.slug === p.slug) continue;
        out.push({ value: a.slug, label: `${p.label} · ${a.label}`, meta: a.slug, group: p.label });
      }
    }
    return out;
  }, [accounts, builtin, platforms]);
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
      loading={isLoading}
      appearance="flush"
      placeholder={value?.trim() || 'Set platform'}
      searchPlaceholder="Platform or connection…"
      emptyMessage="No matching platform"
      ariaLabel="Change platform"
      testId="evidence-platform-picker"
      className="w-full"
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
  const { options, loading } = useLocationPickerOptions();
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
      className="w-full"
    />
  );
}

/**
 * The open cell beside an identifier chip in the evidence column (order #,
 * tracking #). The chip copies; this opens. Square flush cell, 1px edge.
 */
export function LedgerOpenAction({ href, label }: { href: string | null; label: string }) {
  return (
    <ExternalLinkActionIcon
      href={href}
      ariaLabel={`Open ${label}`}
      title={`Open ${label}`}
      className={cn(
        'inline-flex w-8 shrink-0 items-center justify-center border-l border-mode-edge hover:bg-mode-hover',
        LEDGER_HIT_CLASS,
        focusRing('cell'),
      )}
    />
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
          className={cn(
            'ds-raw-button inline-flex w-8 shrink-0 items-center justify-center border-l border-mode-edge text-mode-ink hover:bg-mode-hover',
            LEDGER_HIT_CLASS,
            focusRing('cell'),
          )}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={0} className="w-72 rounded-none p-2" onClick={stop}>
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
            className={cn(RECORD_ID_CLASS, 'w-full rounded-none border border-mode-control bg-mode-panel p-2 text-mode-ink')}
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
