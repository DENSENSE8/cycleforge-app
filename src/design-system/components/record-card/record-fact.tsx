/**
 * Record facts — the shared paint kinds a RecordCard line is made of (Law 2:
 * one painter per display type). A family adapter turns its row into faces;
 * the card never knows which family a fact came from.
 */

import type { ReactNode } from 'react';
import { MapPin } from '@/components/Icons';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import { cn } from '@/utils/_cn';
import type { CardDisclosureTier } from './record-card-types';

/** One fact's face. The card paints every kind the same way on every family. */
export type RecordFactFace =
  /** ×N — above 1 the quantity takes its tone. */
  | { kind: 'qty'; value: number }
  /** Received against expected: reads as `×N` when they agree; `received/expected` in warning ink when they differ (short or over). */
  | { kind: 'received'; received: number; expected: number | null }
  /** A condition grade, inked by its code. */
  | { kind: 'grade'; label: string; code: string | null }
  /** On-hand vs needed: "Out of stock", "Stock N" (danger when short, faint + `missingTitle` when unknown). */
  | { kind: 'stock'; onHand: number | null; need: number; out: boolean; missingTitle: string }
  /** A code (SKU, item number): small mono. */
  | { kind: 'code'; text: string; title: string }
  /** A place (bin, location): pin + path, or the faint `empty` word. */
  | { kind: 'place'; path: string | null; empty: string }
  /** Money in the success ink; an estimate wears "~" and says why in `estimateTitle`. `text: null` = no price: a faint "$—" (the fact is missing, not zero) — never struck, a strike over the dash reads as a second dash. */
  | { kind: 'money'; text: string | null; estimate: boolean; estimateTitle: string }
  /** A date stamp ("Exp Sep 30"), tabular; the full date on hover. */
  | { kind: 'date'; text: string; title: string }
  /** A fact the record should have and does not ("No tracking") — warning ink. */
  | { kind: 'missing'; text: string };

/** A family's fact columns, in the one order every line (and every unfolded column) uses. */
export interface RecordFactColumn {
  /** Stable id — the column key and the unfolded cell's `data-fact`. */
  id: string;
  /** Width tier below which the unfolded column empties (the lead sentence always shows every fact). */
  tier: CardDisclosureTier;
}

/** Paint one face. */
export function RecordFactPaint({ face }: { face: RecordFactFace }): ReactNode {
  switch (face.kind) {
    case 'qty':
      return (
        <span className={cn('font-semibold tabular-nums', face.value > 1 ? orderRowQtyTone(face.value) : 'text-text-default')}>
          ×{face.value}
        </span>
      );
    case 'received': {
      const { received, expected } = face;
      if (expected == null || received === expected) return <RecordFactPaint face={{ kind: 'qty', value: received }} />;
      const gap = received < expected ? `${expected - received} short` : `${received - expected} over`;
      return (
        <span className="font-semibold tabular-nums text-text-warning" title={`Received ${received} of ${expected} expected · ${gap}`}>
          {received}/{expected}
        </span>
      );
    }
    case 'grade':
      return <span className={cn('font-medium', conditionGradeTextClass(face.code))}>{face.label}</span>;
    case 'stock':
      return face.out ? (
        <span className="font-semibold text-text-danger">Out of stock</span>
      ) : (
        <span
          title={face.onHand == null ? face.missingTitle : undefined}
          className={cn(
            'tabular-nums',
            face.onHand != null && face.onHand < face.need ? 'font-semibold text-text-danger' : face.onHand == null ? 'text-text-faint' : undefined,
          )}
        >
          Stock {face.onHand ?? '—'}
        </span>
      );
    case 'code':
      return (
        <span className="font-mono text-xs text-text-muted" title={face.title}>
          {face.text}
        </span>
      );
    case 'place':
      return (
        <span className={cn('inline-flex min-w-0 items-center gap-1', !face.path && 'text-text-faint')} title={face.path ?? undefined}>
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{face.path ?? face.empty}</span>
        </span>
      );
    case 'money':
      if (face.text == null) {
        return (
          <span className="tabular-nums text-text-faint" title="No price">
            $—
          </span>
        );
      }
      return (
        <span className="font-medium tabular-nums text-text-success" title={face.estimate ? face.estimateTitle : undefined}>
          {face.estimate ? '~' : ''}
          {face.text}
        </span>
      );
    case 'date':
      return (
        <span className="tabular-nums" title={face.title}>
          {face.text}
        </span>
      );
    case 'missing':
      return <span className="font-medium text-text-warning">{face.text}</span>;
  }
}
