'use client';

import { useState } from 'react';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useResolveShortException } from '@/hooks/exceptions';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';
import { CartonFactsGroup, lineTitle } from './CartonFactsGroup';
import { resolveWith } from './resolve-feedback';

type CartonLine = CartonExceptionFacts['lines'][number];

/**
 * Short — PO lines arrived under their expected count. Per short line, in
 * place: correct the received count (a miscount), or file a missing-item
 * claim (the carton moves to Claim).
 */
export function ShortResolver({ facts }: { row: ExceptionRow; facts: CartonExceptionFacts }) {
  const short = facts.lines.filter(
    (line) => line.id > 0 && line.quantity_expected != null && line.quantity_received < line.quantity_expected,
  );
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-short">
      <CartonFactsGroup carton={facts.carton} />
      <RecordGroup title="Short lines">
        <ul className="flex flex-col gap-3 px-4 pb-4 pt-1">
          {short.map((line) => (
            <ShortLine key={line.id} line={line} receivingId={facts.carton.receivingId} />
          ))}
        </ul>
      </RecordGroup>
    </div>
  );
}

function ShortLine({ line, receivingId }: { line: CartonLine; receivingId: number }) {
  const resolve = useResolveShortException();
  const [received, setReceived] = useState(String(line.quantity_received));
  const count = Number(received);
  const valid = received.trim() !== '' && Number.isInteger(count) && count >= 0;
  const title = lineTitle(line);
  return (
    <li className="flex flex-col gap-2 border-b border-mode-fact py-2 last:border-b-0" data-testid="exception-short-line">
      <span className="min-w-0">
        <span className="block truncate text-role-data font-semibold text-mode-ink" title={title}>
          {title}
        </span>
        <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>
          {line.sku ?? '—'} · received {line.quantity_received} of {line.quantity_expected}
        </span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')} htmlFor={`short-line-${line.id}`}>
          Received
        </label>
        <input
          id={`short-line-${line.id}`}
          inputMode="numeric"
          value={received}
          onChange={(event) => setReceived(event.target.value)}
          className={cn(EVIDENCE_CONTROL_CLASS, 'w-20 tabular-nums')}
          data-testid="exception-short-received"
        />
        <span className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="sm"
          disabled={resolve.isPending}
          onClick={() =>
            resolveWith(
              resolve,
              { action: 'file-claim', receivingId, lineId: line.id, claimType: 'missing', reason: `Short: ${line.quantity_received} of ${line.quantity_expected}` },
              `Missing-item claim filed for ${title}`,
            )
          }
          data-testid="exception-short-claim"
        >
          File claim
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={resolve.isPending && resolve.variables?.action === 'set-quantity'}
          disabled={resolve.isPending || !valid || count === line.quantity_received}
          onClick={() =>
            resolveWith(resolve, { action: 'set-quantity', lineId: line.id, quantityReceived: count }, `${title}: received ${count}`)
          }
          data-testid="exception-resolve-short"
        >
          Save count
        </Button>
      </div>
    </li>
  );
}
