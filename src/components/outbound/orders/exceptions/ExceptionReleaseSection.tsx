'use client';

import { AlertCircle, Check } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import { cn } from '@/utils/_cn';

export function ExceptionReleaseSection({
  row,
  canRelease,
  blockedBy,
  gateBusy,
  onDocsExempt,
  onRelease,
}: {
  row: OrderExceptionRow;
  canRelease: boolean;
  blockedBy: string;
  gateBusy: boolean;
  onDocsExempt: () => void;
  onRelease: () => void;
}) {
  return (
    <>
      <ul className="divide-y divide-border-hairline border-y border-border-hairline">
        {row.gates.gates.map((gate) => (
          <li key={gate.id} className="flex items-start gap-2 px-1 py-2">
            <Badge variant={gate.passed ? 'success' : 'destructive'}>
              {gate.passed ? <Check aria-hidden /> : <AlertCircle aria-hidden />}
              {gate.id}
            </Badge>
            <span className="min-w-0">
              <span className="block text-role-caption text-text-default">{gate.label}</span>
              {gate.reason ? (
                <span className="block text-role-micro text-text-soft">{gate.reason}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={gateBusy || row.gates.gates.find((g) => g.id === 'G2')?.passed}
          onClick={onDocsExempt}
          data-testid="exception-docs-exempt"
        >
          No documents required
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!canRelease || gateBusy}
          onClick={onRelease}
          data-testid="exception-release"
        >
          Release
        </Button>
        {row.releaseState !== 'caged' ? (
          <span className="text-role-caption text-text-soft">
            Not caged — this order is already in the live queue.
          </span>
        ) : !row.gates.canRelease ? (
          <span className={cn('text-role-caption text-rose-700')} role="status">
            Blocked by {blockedBy}.
          </span>
        ) : null}
      </div>
    </>
  );
}
