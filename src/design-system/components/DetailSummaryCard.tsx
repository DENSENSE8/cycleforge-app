'use client';

import Link from 'next/link';
import { ChevronRight } from '@/components/Icons';

/**
 * Read-only first view of a scanned entity: a compact title, up to two
 * job-relevant captions, mono ID bottom-left and status bottom-right. The
 * complete record and its only pencil edit live on the linked `/info` screen.
 *
 * Full-bleed, no box (operator 2026-09-25: edge to edge): the parent draws the
 * rule under it (`DetailHubScreen`'s divider); only the text keeps its inset.
 * Press inverts the whole card to ink at once (no transition) — the tap is
 * never in doubt on a slow network.
 */
export function DetailSummaryCard({
  href,
  ariaLabel,
  title,
  titleHint,
  lines = [],
  foot,
  chip,
  chipFallback,
}: {
  href: string;
  ariaLabel: string;
  title: string;
  titleHint?: string;
  lines?: ReadonlyArray<{ text: string; muted?: boolean }>;
  foot?: string;
  chip: { label: string; className: string } | null;
  chipFallback?: string;
}) {
  const previewLines = lines.filter((line) => line.text).slice(0, 2);
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group block bg-mode-panel px-mode-page py-3 active:bg-mode-ink"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-mode-body font-semibold text-mode-ink group-active:text-mode-panel" title={titleHint}>{title}</p>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted group-active:text-mode-panel" />
      </div>
      {previewLines.map((line, index) => (
        <p key={`${index}-${line.text}`} className={`mt-0.5 truncate text-role-caption group-active:text-mode-panel ${line.muted ? 'text-mode-muted' : 'text-mode-ink'}`}>{line.text}</p>
      ))}
      {/* Identifier and chip share box height: same border + vertical padding. */}
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate border border-transparent py-0.5 font-mono text-role-caption text-mode-muted group-active:text-mode-panel">{foot ?? ''}</span>
        {chip ? (
          <span className={`shrink-0 rounded-mode border px-2 py-0.5 text-role-caption font-semibold ${chip.className}`}>{chip.label}</span>
        ) : (
          <span className="shrink-0 border border-transparent py-0.5 text-role-caption font-semibold text-text-faint">{chipFallback ?? ''}</span>
        )}
      </div>
    </Link>
  );
}
