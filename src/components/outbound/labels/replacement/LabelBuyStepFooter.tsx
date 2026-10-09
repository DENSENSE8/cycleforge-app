'use client';

/**
 * The label-buy stepper's bottom row: Back on the left, a quiet hint of what
 * still blocks the step, and the step's one verb on the right (Next, Get rates,
 * Buy, Confirm & buy, Done) — the thumb-zone button on a phone.
 */

import type { ReactNode } from 'react';
import { ArrowLeft } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export interface LabelBuyStepVerb {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  testId?: string;
}

export function LabelBuyStepFooter({
  onBack,
  hint,
  hintTestId,
  tone = 'quiet',
  error,
  verb,
}: {
  /** Absent on the first step and once the label is bought. */
  onBack?: () => void;
  /** What still blocks the verb, e.g. "Enter L × W × H"; null when ready. */
  hint: string | null;
  hintTestId?: string;
  /** `warning`: the quote is out of date. */
  tone?: 'quiet' | 'warning';
  error: string | null;
  verb: LabelBuyStepVerb;
}) {
  return (
    <footer className="flex shrink-0 flex-col gap-2 border-t border-border-hairline px-5 py-3" data-testid="send-replacement-buy-footer">
      {error ? (
        <p className="text-role-caption text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button variant="ghost" icon={<ArrowLeft />} disabled={verb.loading} onClick={onBack} data-testid="label-buy-back">
            Back
          </Button>
        ) : null}
        <span
          className={cn('ml-auto text-right text-role-caption', tone === 'warning' ? 'text-text-warning' : 'text-text-faint')}
          data-testid={hintTestId}
        >
          {hint}
        </span>
        <Button
          // Keyed per verb: a new step's verb mounts fresh, so `autoFocus` (Confirm & buy) lands.
          key={verb.testId ?? verb.label}
          variant="primary"
          size="lg"
          icon={verb.icon}
          loading={verb.loading}
          disabled={verb.disabled}
          autoFocus={verb.autoFocus}
          onClick={verb.onClick}
          data-testid={verb.testId}
        >
          {verb.label}
        </Button>
      </div>
    </footer>
  );
}
