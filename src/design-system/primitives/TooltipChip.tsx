'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/** TooltipChip — the ONE skin and the ONE content order for a hover hint. */
export function tooltipChipClass({
  row = false,
  wrap = false,
}: {
  /** A trailing element (keycaps, a copy glyph) sits beside the sentence. */
  row?: boolean;
  wrap?: boolean;
} = {}): string {
  return cn(
    'bg-surface-inverse text-white shadow-lg',
    'px-2 py-1 text-role-nav font-medium leading-snug',
    row && 'flex items-center gap-1.5',
    // `text-pretty` keeps an unavoidable wrap minimal — no orphan last word.
    wrap ? 'whitespace-pre-line text-pretty' : 'whitespace-nowrap',
  );
}

/** The chip's contents: the sentence. Sentence-first is the whole order. */
export function TooltipChipBody({ label }: { label: ReactNode }) {
  return <>{label}</>;
}
