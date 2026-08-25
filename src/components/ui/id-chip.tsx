'use client';

/**
 * THE ID-CHIP FAMILY — a deliberate SMALL reimplementation, not a mirror.
 *
 * The main worktree's `CopyChip.tsx` is 1,247 lines carrying 12+ variants,
 * a copy-history hook and a 429-line hover menu. This shell needs four
 * faces (HANDOFF-session-composer-ux §7): OrderIdChip · TrackingChip ·
 * PlatformChip · SkuScanRefChip. The piece worth importing VERBATIM is the
 * format module — `@/lib/copy-chip-format` (+ its test) is the display SoT
 * and is identical to main's — so this file only owns markup and copy.
 *
 * THE LAST-8 LAW (LAWS.md Q4): every typed identifier face renders its
 * trailing 8 characters through `getLast8`; the full value rides `title`
 * and is what the click copies. Empty values collapse to the quiet em dash
 * and render as inert text, never a button with nothing to copy.
 *
 * ONE TONE SYSTEM: this tree's ink tokens, not main's raw Tailwind palette
 * — tracking = accent (the tone the beam readout already uses), SKU =
 * warning, order # takes the PLATFORM's own colour via the source-platform
 * registry. The hover menu stays behind until a surface asks for it.
 *
 * M-laws: the copied state is a conditional icon/ink swap — instant, no
 * geometry, and the chip's width does not change (the glyph box is fixed).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, HashIcon, MapPinIcon, PencilIcon } from 'lucide-react';
import {
  getLast8,
  isEmptyChipDisplay,
  resolveChipDisplay,
} from '@/lib/copy-chip-format';
import {
  formatPlatformTooltipLabel,
  platformMetaBrandDot,
  platformMetaIconTone,
  sourcePlatformMetaFromLabel,
} from '@/lib/source-platform';
import { cn } from '@/utils/_cn';

/** How long the copied ink holds — colour only, nothing moves (M2). */
const COPIED_MS = 1200;

function IdChipBase({
  value,
  icon,
  iconClassName,
  iconStyle,
  title,
  className,
}: {
  value: string | null | undefined;
  icon: React.ReactNode;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const raw = String(value ?? '').trim();
  const display = resolveChipDisplay(getLast8(raw));

  const copy = useCallback(
    (e: React.MouseEvent) => {
      // A chip often sits inside a clickable row — copying must never
      // double as "open the row".
      e.stopPropagation();
      navigator.clipboard?.writeText(raw).catch(() => {});
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    },
    [raw],
  );

  if (isEmptyChipDisplay(display)) {
    return <span className={cn('mono text-muted-foreground', className)}>{display}</span>;
  }

  return (
    <button
      type="button"
      title={copied ? 'Copied' : `${title} — click copies ${raw}`}
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1 text-left transition-colors hover:bg-surface',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5',
          copied ? 'text-ink-success' : iconClassName,
        )}
        style={copied ? undefined : iconStyle}
      >
        {copied ? <CheckIcon /> : icon}
      </span>
      <span className={cn('mono', copied ? 'text-ink-success' : undefined)}>{display}</span>
    </button>
  );
}

/** Order / PO number — `#` glyph in the PLATFORM's own colour. */
export function OrderIdChip({
  orderId,
  platformLabel,
  className,
}: {
  orderId: string | null | undefined;
  platformLabel?: string | null;
  className?: string;
}) {
  const meta = sourcePlatformMetaFromLabel(platformLabel);
  const tone = platformMetaIconTone(meta);
  return (
    <IdChipBase
      value={orderId}
      icon={<HashIcon />}
      iconClassName={tone.className}
      iconStyle={tone.style}
      title={formatPlatformTooltipLabel(String(orderId ?? ''), platformLabel) || 'Order'}
      className={className}
    />
  );
}

/** Outbound carrier tracking — accent ink, the beam readout's own tone. */
export function TrackingChip({
  value,
  carrier,
  className,
}: {
  value: string | null | undefined;
  carrier?: string | null;
  className?: string;
}) {
  return (
    <IdChipBase
      value={value}
      icon={<MapPinIcon />}
      iconClassName="text-ink-accent"
      title={carrier ? `${carrier} tracking` : 'Tracking'}
      className={className}
    />
  );
}

/** SKU / static scan ref — warning ink (main's pencil-yellow, tokenized). */
export function SkuScanRefChip({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <IdChipBase
      value={value}
      icon={<PencilIcon />}
      iconClassName="text-ink-warning"
      title="SKU scan ref"
      className={className}
    />
  );
}

/**
 * Platform face — NOT an id: display-only brand dot + label, no copy verb
 * and no last-8 (a platform name is a word, not a reference).
 */
export function PlatformChip({
  label,
  className,
}: {
  label: string | null | undefined;
  className?: string;
}) {
  const meta = sourcePlatformMetaFromLabel(label);
  if (meta.label === 'Unknown') return null;
  const tone = platformMetaIconTone(meta);
  const dot = platformMetaBrandDot(meta);
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', tone.className, className)}
      style={tone.style}
      title={meta.label}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-sm', dot.className)} style={dot.style} />
      {meta.label}
    </span>
  );
}
