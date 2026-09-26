'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { IconButton } from '@/design-system/primitives';
import { ChevronRight, X } from '@/components/Icons';
import { usePressHaptic } from '@/lib/scan-feedback/useScanFeedback';
import { copyToClipboard } from '@/utils/_dom';

/**
 * The record-detail layout every phone detail screen shares (repair hub, unit
 * hub, unit QC, every `/info`): one fact list, one section band, one
 * acknowledgement, one door row and the door list — so the screens cannot
 * drift into separate looks. Born on the repair workbench (2026-09-24),
 * promoted when the unit page adopted the same layout.
 *
 * Flat (operator 2026-09-25): every block runs the full width with square
 * corners and no box; the screen's column is `divide-y divide-mode-rule`, so
 * one 1px rule sits between blocks and only text keeps the page inset.
 */

/**
 * A block of facts: full-bleed rows, one 1px mode rule between them. The
 * column's rule sits above and below the whole block; a second group on the
 * same screen is introduced by a {@link DetailSectionHeading} band.
 */
export function DetailFacts({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <dl aria-label={label} className="divide-y divide-mode-rule bg-mode-panel">
      {children}
    </dl>
  );
}

const COPIED_MS = 1200;

/**
 * One fact row in {@link DetailFacts}: the mono caps label left at the page
 * inset, the value right-aligned in sans at the right inset (identifiers set
 * `mono`). `value` null / `''` is "no data": a muted dash that recedes
 * instead of drawing the eye. `copy` makes the whole row a tap-to-copy key
 * (FNSKU, SKU, serial, tracking) — the string lands on the clipboard at once
 * and the label reads COPIED for a beat.
 */
export function DetailFact({
  label,
  value,
  hint,
  mono = false,
  copy,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Identifier face (SKU, serial, tracking). */
  mono?: boolean;
  /** The exact string a tap copies. Omit for facts that are not keys. */
  copy?: string | null;
}) {
  const empty = value == null || value === '' || value === false;
  const copyText = !empty && copy ? copy : null;
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const haptic = usePressHaptic();
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    if (!copyText) return;
    haptic();
    const ok = await copyToClipboard(copyText, { historyKind: 'id', historyDisplay: label });
    if (!ok) return;
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div
      className={`relative flex items-baseline justify-between gap-3 px-mode-page py-2.5 ${
        copyText ? 'group has-[button:active]:bg-mode-ink' : ''
      }`}
    >
      <dt
        className={`shrink-0 font-mono text-role-caption uppercase ${
          copied ? 'text-mode-ink' : 'text-mode-muted'
        } group-has-[button:active]:text-mode-panel`}
      >
        {copied ? 'Copied' : label}
      </dt>
      <dd
        className={`min-w-0 break-words text-right text-mode-body font-semibold text-mode-ink group-has-[button:active]:text-mode-panel ${
          mono && !empty ? 'font-mono' : ''
        }`}
      >
        {/* The dash is the one glyph allowed below the floor's text contrast:
            it carries no data, so it recedes (operator 2026-09-25). */}
        {empty ? <span className="font-normal text-mode-edge">—</span> : value}
        {hint ? (
          <span className="mt-0.5 block font-sans text-role-caption font-normal text-mode-muted group-has-[button:active]:text-mode-panel">
            {hint}
          </span>
        ) : null}
        {copyText ? (
          // ds-raw-button: an invisible hit area stretched over the whole row, not an action button
          <button
            type="button"
            onClick={() => void onCopy()}
            aria-label={`Copy ${label} ${copyText}`}
            className="absolute inset-0 cursor-copy"
          />
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Section band — the hard break between two blocks of one screen
 * (Information vs Checklist): a full-width well strip with a mono caption at
 * the page inset. It has no rules of its own; the screen's `divide-y` column
 * draws them above and below.
 */
export function DetailSectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="flex min-h-8 items-center bg-mode-well px-mode-page font-mono text-role-eyebrow uppercase text-mode-muted"
    >
      {children}
    </h2>
  );
}

/** Quiet save acknowledgement carrying the server's stamp; dismissable, never a modal. Full-bleed strip. */
export function DetailAck({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 bg-emerald-50 px-mode-page py-2.5 text-role-caption font-semibold text-emerald-800"
    >
      <div className="flex min-w-0 flex-col items-start">{children}</div>
      <IconButton
        onClick={onDismiss}
        ariaLabel="Dismiss"
        icon={<X className="h-4 w-4" />}
        className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-emerald-700"
      />
    </div>
  );
}

/**
 * One door on a detail hub. It opens a contextual screen (`href`) or a sheet
 * on the same screen (`onSelect`). With neither, the row stays visible but
 * inert and `meta` says why — an honest dead end beats a missing door.
 *
 * Rows run edge to edge with a rule under each (operator 2026-09-25), so a
 * row can later take left/right swipe actions without re-laying the list.
 */
export interface DetailNavItem {
  id: string;
  title: string;
  icon: ReactNode;
  meta: ReactNode;
  href?: string | null;
  onSelect?: () => void;
}

const ROW_CLASS =
  'flex min-h-mode-hit-cta w-full items-center gap-3 border-b border-mode-rule px-mode-page py-2.5 text-left';

/**
 * Press = inversion (operator 2026-09-25): the whole row goes ink the instant
 * the thumb lands, with no transition, so a tap on a slow network is never in
 * doubt. `group-active` flips each child because each sets its own colour.
 */
const ROW_PRESS = 'group active:bg-mode-ink';

export function DetailNavRow({ href, onSelect, title, meta, icon }: Omit<DetailNavItem, 'id'>) {
  const live = Boolean(href || onSelect);
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-mode bg-mode-well text-mode-muted group-active:bg-mode-panel group-active:text-mode-ink [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-mode-body font-semibold text-mode-ink group-active:text-mode-panel">{title}</span>
        <span className="block text-role-caption text-mode-muted group-active:text-mode-panel">{meta}</span>
      </span>
      {live ? <ChevronRight className="h-5 w-5 shrink-0 text-mode-muted group-active:text-mode-panel" /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${ROW_CLASS} ${ROW_PRESS}`}>
        {body}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={`${ROW_CLASS} ${ROW_PRESS}`}>
        {body}
      </button>
    );
  }
  return (
    <div className={`${ROW_CLASS} opacity-80`} aria-disabled="true">
      {body}
    </div>
  );
}

/**
 * The door list: full-bleed rows, no box. Each row carries its rule; when the
 * list sits mid-column the parent's `divide-y` already draws the rule after
 * it, so the last row drops its own instead of doubling to 2px.
 */
export function DetailNav({ label, rows }: { label: string; rows: readonly DetailNavItem[] }) {
  return (
    <nav aria-label={label} className="bg-mode-panel [&:not(:last-child)>*:last-child]:border-b-0">
      {rows.map(({ id, ...row }) => (
        <DetailNavRow key={id} {...row} />
      ))}
    </nav>
  );
}
