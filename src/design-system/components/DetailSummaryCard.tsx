'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/Icons';
import { MOBILE_DATA_LIST_ROW_INTERACTION_CLASS } from './MobileDataListRow';

/**
 * Read-only first view of a scanned entity:
 * Full-bleed, no box (operator 2026-09-25: edge to edge); its list parent owns
 * the dividing rule between records.
 */
export function DetailSummaryCard({
  href,
  ariaLabel,
  eyebrow,
  title,
  titleHint,
  lines = [],
  foot,
  chip,
  chipFallback,
  testId,
  dataState,
}: {
  href: string;
  ariaLabel: string;
  /** Optional sentence-case context above the title (for example QC state + condition). */
  eyebrow?: ReactNode;
  title: string;
  titleHint?: string;
  lines?: ReadonlyArray<{ text: string; muted?: boolean; mono?: boolean }>;
  foot?: string;
  chip: { label: string; className: string } | null;
  chipFallback?: string;
  testId?: string;
  dataState?: string;
}) {
  const previewLines = lines.filter((line) => line.text).slice(0, 2);
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      data-testid={testId}
      data-state={dataState}
      className={`group block bg-mode-panel px-mode-page py-3 font-sans ${MOBILE_DATA_LIST_ROW_INTERACTION_CLASS}`}
    >
      {eyebrow ? <div className="mb-1 flex min-w-0 items-baseline gap-2">{eyebrow}</div> : null}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-mode-body font-semibold text-mode-ink" title={titleHint}>{title}</p>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
      </div>
      {previewLines.map((line, index) => (
        <p
          key={`${index}-${line.text}`}
          className={`mt-0.5 truncate text-role-caption ${line.mono ? 'font-mono' : ''} ${line.muted ? 'text-mode-muted' : 'text-mode-ink'}`}
        >
          {line.text}
        </p>
      ))}
      {/* Identifier and chip share box height: same border + vertical padding. */}
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate border border-transparent py-0.5 font-mono text-role-caption text-mode-muted">{foot ?? ''}</span>
        {chip ? (
          <span className={`shrink-0 rounded-mode border px-2 py-0.5 text-role-caption font-semibold ${chip.className}`}>{chip.label}</span>
        ) : (
          <span className="shrink-0 border border-transparent py-0.5 text-role-caption font-semibold text-text-faint">{chipFallback ?? ''}</span>
        )}
      </div>
    </Link>
  );
}
