'use client';

import type { ReactNode, Ref } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AlertCircle, AlertTriangle, Check, CircleDot, Clock, Copy, ExternalLink, Info, Pencil, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionDuration, motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import type { NavLocateBucket } from '@/lib/nav/context/schema';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { NAV_LOCATE_TONE_VAR } from './nav-locate-tone';
import type { RowBucket } from './bulk-list-view';

/**
 * One row in the search bar's panel: a pasted number (NavBulkPanel) or a
 * record the typed Find matches (NavLocateMatches) — verdict cell · number ·
 * detail · title · hover verbs. A match has no list verbs (edit / copy /
 * remove belong to a held list), so those are optional.
 */

type Tone = NavLocateBucket['tone'];

/** Each tone's glyph — the verdict reads before its word; ink is {@link NAV_LOCATE_TONE_VAR}. */
export const TONE_ICON: Readonly<Record<Tone, typeof Check>> = {
  neutral: CircleDot,
  info: Info,
  success: Check,
  warning: Clock,
  danger: AlertTriangle,
};

/** Rows past this one arrive together — a 100-number paste never waits on its tail. */
const CASCADE_ROWS = 14;

/** A tactile square icon key — sinks 1px on press. */
export const ICON_KEY_CLASS = cn(
  'grid size-6 shrink-0 place-content-center rounded-sm text-text-muted',
  'transition-[background-color,transform,box-shadow] duration-100',
  'hover:bg-surface-card hover:text-text-default hover:shadow-sm hover:ring-1 hover:ring-border-soft',
  'active:translate-y-px active:bg-surface-sunken active:shadow-none',
);

/** The verdict column: one width (fits "Awaiting tracking"), so the numbers line up. */
const STATUS_WIDTH = 'w-[8.5rem]';

export function BulkRow({
  ref,
  id,
  entry,
  primary,
  index,
  lit,
  pinned = false,
  editing = false,
  onPoint,
  onOpen,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onCopy,
  onRemove,
  onOpenBucket,
  onOpenRecord,
}: {
  /** AnimatePresence `popLayout` measures the leaving row through it. */
  ref?: Ref<HTMLDivElement>;
  id: string;
  entry: BulkEntry;
  /** The ONE status painted (`BulkRowView.primary`). */
  primary: RowBucket | undefined;
  index: number;
  lit: boolean;
  pinned?: boolean;
  editing?: boolean;
  onPoint: () => void;
  onOpen: () => void;
  onEdit?: () => void;
  onCommitEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  onCopy?: () => void;
  onRemove?: () => void;
  onOpenBucket: (bucket: NavLocateBucket) => void;
  onOpenRecord: (() => void) | undefined;
}) {
  const hasVerbs = Boolean(onOpenRecord || onEdit || onCopy || onRemove);
  const presence = useMotionPresence(motionPresence.findListRow);
  const settle = useMotionTransition(motionTransition.findListRow);
  const glide = useMotionTransition(motionTransition.findListGlide);
  const reduce = useReducedMotion();
  const delay = reduce ? 0 : Math.min(index, CASCADE_ROWS) * motionDuration.findListRowStagger;
  return (
    <motion.div
      ref={ref}
      id={id}
      role="option"
      aria-selected={lit}
      data-bulk-index={index}
      data-buckets={entry.buckets.join(' ')}
      layout="position"
      initial={presence.initial}
      animate={presence.animate}
      exit={{ ...presence.exit, transition: settle }}
      transition={{ ...settle, delay, layout: glide }}
      onPointerEnter={onPoint}
      onClick={editing ? undefined : onOpen}
      className={cn(
        'group mx-1 flex h-7 cursor-default select-none items-center gap-2 rounded-full pl-1 pr-1',
        'transition-[background-color,box-shadow] duration-100 ease-out',
        'hover:bg-surface-sunken hover:shadow-sm hover:ring-1 hover:ring-border-soft',
        lit && 'bg-surface-sunken shadow-sm ring-1 ring-border-soft',
        pinned && 'ring-2 ring-border-strong',
      )}
    >
      <RowVerdict entry={entry} primary={primary} onOpenBucket={onOpenBucket} />
      {editing && onCommitEdit && onCancelEdit ? (
        // ds-raw-button: an inline retype inside a listbox option — commits on Enter / blur and must keep its keys from the listbox.
        <input
          autoFocus
          defaultValue={entry.ref}
          aria-label={`Edit ${entry.ref}`}
          spellCheck={false}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') onCommitEdit(event.currentTarget.value);
            else if (event.key === 'Escape') onCancelEdit();
          }}
          onBlur={(event) => onCommitEdit(event.currentTarget.value)}
          className="h-6 min-w-0 flex-1 rounded-sm bg-surface-sunken px-1.5 font-mono text-role-caption text-text-default outline-none ring-1 ring-inset ring-border-strong"
        />
      ) : (
        <>
          {/* The number never yields its width; detail and title share what is left. */}
          <span title={entry.ref} className="shrink-0 whitespace-nowrap font-mono text-role-caption font-semibold text-text-default">
            {entry.ref}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-2 text-role-micro">
            {entry.detail ? <span title={entry.detail} className="min-w-0 shrink truncate text-text-muted">{entry.detail}</span> : null}
            {entry.title ? (
              <span
                title={entry.title}
                className={cn('min-w-0 flex-1 truncate text-text-faint', hasVerbs && 'group-hover:hidden', hasVerbs && lit && 'hidden')}
              >
                {entry.title}
              </span>
            ) : null}
          </span>
          {hasVerbs ? (
            <span className={cn('hidden shrink-0 items-center gap-0.5 group-hover:flex', lit && 'flex')}>
              {onOpenRecord ? (
                <RowAction label={`Open ${entry.title ?? entry.ref}`} onClick={onOpenRecord}>
                  <ExternalLink aria-hidden className="size-3" />
                </RowAction>
              ) : null}
              {onEdit ? (
                <RowAction label={`Edit ${entry.ref}`} shortcut="E" onClick={onEdit}>
                  <Pencil aria-hidden className="size-3" />
                </RowAction>
              ) : null}
              {onCopy ? (
                <RowAction label={`Copy ${entry.ref}`} shortcut="Mod + C" onClick={onCopy}>
                  <Copy aria-hidden className="size-3" />
                </RowAction>
              ) : null}
              {onRemove ? (
                <RowAction label={`Remove ${entry.ref}`} shortcut="⌫" onClick={onRemove}>
                  <X aria-hidden className="size-3" />
                </RowAction>
              ) : null}
            </span>
          ) : null}
        </>
      )}
    </motion.div>
  );
}

/**
 * The row's verdict cell: while the locator is asked it breathes "Checking…"
 * (an opacity mirror loop); the answer crossfades in over it — the bucket it
 * lives in, or "Not found". Both faces share one grid cell, so the swap
 * never moves the number beside it.
 */
export function RowVerdict({
  entry,
  primary,
  onOpenBucket,
  className,
}: {
  entry: BulkEntry;
  primary: RowBucket | undefined;
  /** A status that is not the list on screen links to its list; absent = the status is plain text (a sheet cell copies instead). */
  onOpenBucket?: (bucket: NavLocateBucket) => void;
  /** Overrides the fixed verdict width (a sheet column sizes itself). */
  className?: string;
}) {
  const swap = useMotionPresence(motionPresence.findListVerdict);
  const swapTransition = useMotionTransition(motionTransition.findListVerdict);
  const breath = useMotionPresence(motionPresence.findListPending);
  const breathTransition = useMotionTransition(motionTransition.findListPending);
  const face = entry.pending ? 'pending' : primary ? `bucket:${primary.bucket.id}` : 'none';
  return (
    <span className={cn('grid shrink-0', STATUS_WIDTH, className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={face}
          initial={swap.initial}
          animate={swap.animate}
          exit={swap.exit}
          transition={swapTransition}
          className="col-start-1 row-start-1 flex min-w-0"
        >
          {entry.pending ? (
            <motion.span
              initial={breath.initial}
              animate={breath.animate}
              transition={breathTransition}
              className="inline-flex h-5 items-center gap-1 px-1.5 text-role-micro text-text-faint"
            >
              <CircleDot aria-hidden className="size-3 shrink-0" />
              Checking…
            </motion.span>
          ) : primary ? (
            <BucketChip row={primary} onOpen={onOpenBucket} />
          ) : (
            <span
              data-bulk-bucket="none"
              className="inline-flex h-5 min-w-0 items-center gap-1 px-1.5 text-role-micro font-semibold"
              style={{ color: NAV_LOCATE_TONE_VAR.danger }}
            >
              <AlertCircle aria-hidden className="size-3 shrink-0" />
              Not found
            </span>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * The number's ONE status: glyph + bare label in the bucket's ink. A bucket
 * that is not the list on screen links to its list, narrowed to the number.
 */
function BucketChip({
  row,
  onOpen,
}: {
  row: RowBucket;
  onOpen?: (bucket: NavLocateBucket) => void;
}) {
  const { bucket, current } = row;
  const Glyph = TONE_ICON[bucket.tone];
  const face = (
    <>
      <Glyph aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{bucket.label}</span>
    </>
  );
  const className = cn(
    'inline-flex h-5 w-full min-w-0 shrink-0 items-center gap-1 px-1.5 text-role-micro font-semibold',
    SIDEBAR_CHIP_CORNER,
  );
  const style = { color: NAV_LOCATE_TONE_VAR[bucket.tone] };
  if (current || !bucket.href || !onOpen) {
    return (
      <span data-bulk-bucket={bucket.id} title={bucket.label} className={className} style={style}>
        {face}
      </span>
    );
  }
  return (
    // ds-raw-button: a link chip inside a listbox option — out of the tab order, and its press must not pinpoint the row.
    <button
      type="button"
      tabIndex={-1}
      data-bulk-bucket={bucket.id}
      title={`Open in ${bucket.label}`}
      aria-label={`Open in ${bucket.label}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(bucket);
      }}
      className={cn(
        className,
        'ds-raw-button bg-surface-sunken hover:bg-surface-card hover:shadow-sm hover:ring-1 hover:ring-border-soft active:translate-y-px',
        focusRing('control', 'accent'),
      )}
      style={style}
    >
      {face}
    </button>
  );
}

function RowAction({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  /** The verb's key — taught in the hover tooltip, never painted on the row. */
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <HoverTooltip label={label} shortcut={shortcut} focusable={false} asChild>
      <IconButton
        tabIndex={-1}
        ariaLabel={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={cn(ICON_KEY_CLASS, 'size-5 rounded-full')}
        icon={children}
      />
    </HoverTooltip>
  );
}
