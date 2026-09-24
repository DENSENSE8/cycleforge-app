'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { IconButton } from '@/design-system/primitives';
import { ChevronRight, X } from '@/components/Icons';

/**
 * The record-detail layout every phone detail screen shares (repair hub, unit
 * hub, unit QC): one fact row, one section heading, one acknowledgement, one
 * door row and the door list — so the screens cannot drift into separate looks.
 * Born on the repair workbench (2026-09-24), promoted when the unit page
 * adopted the same layout.
 */

export function DetailFactRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-mode-rule px-mode-page py-2.5 last:border-b-0">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</span>
      <div className="min-w-0 text-right">
        <div className="break-words text-mode-body font-semibold text-text-default">{value}</div>
        {hint ? <p className="mt-0.5 text-xs font-semibold text-text-soft">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Section name — one step above the rows it heads. */
export function DetailSectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-role-caption font-semibold uppercase tracking-[0.16em] text-mode-muted">
      {children}
    </h2>
  );
}

/** Quiet save acknowledgement carrying the server's stamp; dismissable, never a modal. */
export function DetailAck({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-mode border border-emerald-200 bg-emerald-50 px-mode-page py-2.5 text-role-caption font-semibold text-emerald-800"
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
  'flex min-h-mode-hit-cta w-full items-center gap-3 border-b border-mode-rule px-mode-page py-2.5 text-left last:border-b-0';

export function DetailNavRow({ href, onSelect, title, meta, icon }: Omit<DetailNavItem, 'id'>) {
  const live = Boolean(href || onSelect);
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-mode bg-mode-well text-mode-muted [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-mode-body font-semibold text-mode-ink">{title}</span>
        <span className="block text-role-caption text-mode-muted">{meta}</span>
      </span>
      {live ? <ChevronRight className="h-5 w-5 shrink-0 text-mode-muted" /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${ROW_CLASS} active:bg-mode-hover`}>
        {body}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={`${ROW_CLASS} active:bg-mode-hover`}>
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

/** The door list under a hub's Information panel. */
export function DetailNav({ label, rows }: { label: string; rows: readonly DetailNavItem[] }) {
  return (
    <nav aria-label={label} className="overflow-hidden rounded-mode border border-mode-edge bg-mode-panel">
      {rows.map(({ id, ...row }) => (
        <DetailNavRow key={id} {...row} />
      ))}
    </nav>
  );
}
