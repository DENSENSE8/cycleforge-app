'use client';

/**
 * The picker dialog's done face (operator 2026-10-08): a big green check that
 * says the write landed — "Marked out of stock", "SKU paired" — readable at a
 * glance on a phone. Done (focused; Enter) closes the dialog.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';

export function VerbDoneState({
  title,
  detail,
  onDone,
  testId,
}: {
  title: string;
  detail?: ReactNode;
  onDone: () => void;
  testId: string;
}) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    doneRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div role="status" className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-4 text-center" data-testid={testId}>
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-success text-text-success" aria-hidden>
        <Check className="size-9" />
      </span>
      <p className="text-role-title font-semibold text-text-default">{title}</p>
      {detail ? <div className="max-w-sm break-words text-role-caption text-text-soft">{detail}</div> : null}
      <Button ref={doneRef} type="button" variant="success" size="md" className="mt-2 min-w-40" onClick={onDone} data-testid={`${testId}-done`}>
        Done
      </Button>
    </div>
  );
}
