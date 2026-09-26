'use client';

/** FOUNDATION of the `/incoming` receiving-order composer. */

import { useEffect, useRef, type ReactNode } from 'react';
import { Package, RotateCcw, X } from '@/components/Icons';
import {
  closeReceivingOrderComposer,
  openReceivingOrderComposer,
  type ReceivingOrderKind,
} from '@/lib/inbound/receiving-order-composer-store';
import { RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { ComposerButton, ComposerIconButton, ComposerKindSwitch } from './receiving-order-composer-parts';

/** The sheet's fixed width — it never stretches with the stage. */
const SHEET_WIDTH_CLASS = 'w-[720px]';

const KIND_OPTIONS = [
  { value: 'purchase' as const, label: 'Purchase order', icon: <Package className="h-3.5 w-3.5" /> },
  { value: 'return' as const, label: 'Return', icon: <RotateCcw className="h-3.5 w-3.5" /> },
];

interface ReceivingOrderSheetProps {
  kind: ReceivingOrderKind;
  /** The kind's sections, top to bottom. */
  children: ReactNode;
  /** Foot status — what still blocks submit, or that it is ready (`ComposerStatus`). */
  status: ReactNode;
  submitLabel: string;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}

export function ReceivingOrderSheet({
  kind,
  children,
  status,
  submitLabel,
  submitting,
  canSubmit,
  onSubmit,
}: ReceivingOrderSheetProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="receiving-order-composer-stage"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-mode-canvas"
    >
      <form
        data-testid="receiving-order-composer"
        aria-labelledby="receiving-order-composer-title"
        className={cn(
          'mx-auto my-6 flex shrink-0 flex-col border border-mode-ink bg-mode-panel text-mode-ink',
          SHEET_WIDTH_CLASS,
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit && !submitting) onSubmit();
        }}
      >
        <header className="flex h-12 items-center gap-3 border-b border-mode-ink bg-mode-bar pl-4 pr-2">
          <h2
            id="receiving-order-composer-title"
            ref={titleRef}
            tabIndex={-1}
            className={cn(RECORD_TITLE_CLASS, 'flex-1 outline-none')}
          >
            New receiving order
          </h2>
          <ComposerKindSwitch value={kind} options={KIND_OPTIONS} onChange={openReceivingOrderComposer} />
          <ComposerIconButton
            label="Close new receiving order"
            icon={<X className="h-4 w-4" />}
            onClick={closeReceivingOrderComposer}
          />
        </header>
        {children}
        <footer className="flex items-center gap-3 bg-mode-bar px-4 py-3">
          {status}
          <ComposerButton tone="ghost" onClick={closeReceivingOrderComposer}>
            Cancel
          </ComposerButton>
          <ComposerButton type="submit" tone="primary" busy={submitting} disabled={!canSubmit}>
            {submitting ? 'Adding…' : submitLabel}
          </ComposerButton>
        </footer>
      </form>
    </div>
  );
}
