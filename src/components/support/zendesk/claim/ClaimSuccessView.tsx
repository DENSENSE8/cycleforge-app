'use client';

import { ExternalLink } from '@/components/Icons';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import { Button } from '@/design-system/primitives';
import type { ClaimResult } from './claim-types';

/** Linear/Notion-style success screen shown inside the modal after submit. */
export function ClaimSuccessView({ result, onClose }: { result: ClaimResult; onClose: () => void }) {
  const verb = result.mode === 'create' ? 'created' : 'updated';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-14 text-center">
      <AnimatedCheck size={56} />

      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight text-text-default">Ticket {verb}</h3>
        <p className="max-w-xs text-sm leading-relaxed text-text-soft">
          Ticket <span className="font-semibold text-text-muted">{result.number}</span> was {verb}
          {result.attached > 0
            ? ` · ${result.attached} photos`
            : ''}
          .
        </p>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        {result.url ? (
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>
              Open in Support
            </Button>
          </a>
        ) : null}
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
