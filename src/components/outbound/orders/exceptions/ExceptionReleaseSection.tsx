'use client';

import { AlertCircle, Check } from '@/components/Icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import {
  TRIAGE_PANEL_INNER_CORNER,
  triagePanelControl,
} from '@/design-system/tokens/triage-panel';
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
      <ul
        className={cn(
          'divide-y divide-border-hairline border border-border-hairline',
          TRIAGE_PANEL_INNER_CORNER,
        )}
      >
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
      {/*
        Actions hard right, reason hard left (`mr-auto`). The reason used to
        TRAIL the buttons, which put the sentence explaining why Release is
        disabled on the far side of the control it was explaining — and left
        the commit sitting mid-row where no other section keeps one.
      */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {row.releaseState !== 'caged' ? (
          <span className="mr-auto text-role-caption text-text-soft">
            Not caged — this order is already in the live queue.
          </span>
        ) : !row.gates.canRelease ? (
          <span className={cn('mr-auto text-role-caption text-rose-700')} role="status">
            Blocked by {blockedBy}.
          </span>
        ) : null}
        <Button
          variant="outline"
          size="md"
          disabled={gateBusy || row.gates.gates.find((g) => g.id === 'G2')?.passed}
          onClick={onDocsExempt}
          className={triagePanelControl()}
          data-testid="exception-docs-exempt"
        >
          No documents required
        </Button>
        <Button
          variant="default"
          size="md"
          disabled={!canRelease || gateBusy}
          onClick={onRelease}
          className={triagePanelControl()}
          data-testid="exception-release"
        >
          Release
        </Button>
      </div>
    </>
  );
}
