'use client';

/**
 * Incoming add stage overlay — same stage grammar as Order intake.
 *
 * The table remains mounted underneath. The rail picks purchase vs return and
 * the form remains the existing TriageScrollLayout surface.
 */

import { useEffect } from 'react';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { IncomingAddInboundForm } from '@/components/sidebar/receiving/incoming/IncomingAddInboundForm';
import { IncomingAddKindRail } from '@/components/receiving/incoming/IncomingAddKindRail';
import type { IncomingIntakeKind } from '@/lib/inbound/incoming-intake';

export function IncomingAddWalkHost({
  kind,
  onKind,
  onExit,
}: {
  kind: IncomingIntakeKind;
  onKind: (next: IncomingIntakeKind) => void;
  onExit: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.blur();
        return;
      }
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <DeskStageOverlay
      open
      onClose={onExit}
      title="Add inbound"
      subtitle={kind === 'return' ? 'Return intake' : 'Purchase order intake'}
      closeOnScrim={false}
      fill="stage"
      testId="incoming-add-walk"
    >
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-border-hairline bg-surface-card">
          <IncomingAddKindRail embedded kind={kind} onSelect={onKind} />
        </aside>
        <div className="min-w-0 flex-1">
          <IncomingAddInboundForm
            key={kind}
            receivingType={kind === 'return' ? 'RETURN' : 'PO'}
            autoFocus
            onClose={onExit}
          />
        </div>
      </div>
    </DeskStageOverlay>
  );
}
