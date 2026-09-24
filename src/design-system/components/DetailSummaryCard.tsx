'use client';

import Link from 'next/link';
import { ChevronRight } from '@/components/Icons';

/**
 * Read-only first view of a scanned entity: a compact title, up to two
 * job-relevant captions, mono ID bottom-left and status bottom-right. The
 * complete record and its only pencil edit live on the linked `/info` screen.
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
      className="block rounded-mode border border-mode-edge bg-mode-panel px-mode-page py-3 active:bg-mode-hover"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-mode-body font-semibold text-mode-ink" title={titleHint}>{title}</p>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
      </div>
      {previewLines.map((line, index) => (
        <p key={`${index}-${line.text}`} className={`mt-0.5 truncate text-role-caption ${line.muted ? 'text-mode-muted' : 'text-mode-ink'}`}>{line.text}</p>
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
