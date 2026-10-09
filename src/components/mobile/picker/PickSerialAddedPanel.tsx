'use client';

/**
 * "Serial added" — what the pick camera holds after a serial lands (owner 2026-10-08). It stays until
 * the picker chooses: Add more (the lens comes back for the next unit) or Done (the camera goes away;
 * a complete order moves the walk on). The product photo and title say WHICH item took the serial,
 * the count says how many units still want one. The serial is the record's own, shown whole.
 */

import { Check, Plus } from '@/components/Icons';
import { DetailDock } from '@/design-system/components/DetailDock';
import { RecordSquarePhoto } from '@/design-system/components/record-card/RecordCardMobile';
import type { PickSerialAdded } from './usePickOrder';

export function PickSerialAddedPanel({
  added,
  title,
  photoUrl,
  onAddMore,
  onDone,
}: {
  added: PickSerialAdded;
  title: string;
  photoUrl: string | null;
  onAddMore: () => void;
  onDone: () => void;
}) {
  const left = Math.max(0, added.quantity - added.count);
  return (
    <div className="flex flex-col bg-surface-card" data-testid="pick-serial-added" aria-live="polite">
      <div className="flex items-start gap-3 px-mode-page pt-3">
        <RecordSquarePhoto url={photoUrl} size="md" alt={title} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-role-body font-semibold text-emerald-700">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            Serial added
          </p>
          <p className="break-all font-mono text-role-title font-semibold text-text-default" data-testid="pick-serial-added-serial">
            {added.serial}
          </p>
          <p className="text-role-caption text-text-muted">
            {added.count} of {added.quantity} serial{added.count === 1 && added.quantity === 1 ? '' : 's'}
            {left > 0 ? ` · ${left} to go` : added.count > added.quantity ? ' · more serials than units' : ' · all units have a serial'}
          </p>
          <p className="break-words text-role-caption text-text-muted">{title}</p>
        </div>
      </div>
      <DetailDock<'more' | 'done'>
        label="Serial added actions"
        placement="sheet"
        verbs={[
          { id: 'more', label: 'Add more', icon: <Plus />, primary: left > 0, testId: 'pick-serial-add-more' },
          { id: 'done', label: 'Done', icon: <Check />, primary: left === 0, testId: 'pick-serial-done' },
        ]}
        onVerb={(verb) => (verb === 'more' ? onAddMore() : onDone())}
      />
    </div>
  );
}
