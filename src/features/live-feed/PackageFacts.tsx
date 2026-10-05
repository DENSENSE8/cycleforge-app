'use client';

/**
 * A package's line facts in Allocate's order and paint (`RecordFactPaint`):
 * quantity only above one (`×N`, warning ink), then the grade in its own ink,
 * then the price in success green (`$—` when the channel sent none). The card
 * and the open package's rail paint the same row.
 */

import { RecordFactPaint, RecordFactSep, type RecordFactFace } from '@/design-system/components/record-card/record-fact';
import type { PackageCard } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';

export function PackageFacts({ card, className }: { card: PackageCard; className?: string }) {
  const facts: { id: string; face: RecordFactFace }[] = [];
  if (card.qty != null && card.qty > 1) facts.push({ id: 'qty', face: { kind: 'qty', value: card.qty } });
  if (card.condition) facts.push({ id: 'grade', face: { kind: 'grade', label: card.condition, code: card.conditionCode } });
  facts.push({ id: 'price', face: { kind: 'money', text: card.price, estimate: false, estimateTitle: '' } });
  return (
    <span className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap', className)} data-testid="live-feed-facts">
      {facts.flatMap(({ id, face }, index) => {
        const painted = <RecordFactPaint key={id} face={face} />;
        return index > 0 ? [<RecordFactSep key={`${id}:sep`} />, painted] : [painted];
      })}
    </span>
  );
}
