'use client';

/** Everything the tape knows about one entry — the row's tap target (owner 2026-09-26: */

import type { ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { INTAKE } from '@/design-system/tokens/intake';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { STATION_TONE_INK } from './station-chrome';
import type { StationItemAction, StationTapeEntry } from './station-tape';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 min-w-0 items-center gap-2 border-b border-mode-rule px-4">
      <dt className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted')}>{label}</dt>
      <dd className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</dd>
    </div>
  );
}

export function MobileStationEntrySheet({
  entry,
  now,
  untitledLabel,
  actions,
  onOpen,
  onClose,
}: {
  entry: StationTapeEntry;
  now: number;
  untitledLabel: string;
  actions: readonly StationItemAction[];
  onOpen: (() => void) | null;
  onClose: () => void;
}) {
  const ink = STATION_TONE_INK[entry.tone];
  return (
    <BottomSheet open onClose={onClose} title={entry.title ?? untitledLabel}>
      <div data-testid="station-entry-sheet">
        {entry.imageUrl ? (
          <div className="relative aspect-square w-full overflow-hidden border-b border-mode-rule bg-mode-well">
            <ItemRecordThumb imageUrl={entry.imageUrl} className="h-full w-full min-h-0" />
          </div>
        ) : null}
        <dl>
          <Fact label="Outcome">
            <span className={cn(RECORD_LABEL_CLASS, ink)}>{entry.verb}</span>
          </Fact>
          {entry.message ? (
            <Fact label="Server">
              <span className={cn('font-medium', ink)}>{entry.message}</span>
            </Fact>
          ) : null}
          {entry.intake ? <Fact label="Type">{INTAKE[entry.intake].label}</Fact> : null}
          {entry.recordId ? (
            <Fact label="Record">
              <OrderIdChip value={entry.recordId} display={entry.recordId} />
            </Fact>
          ) : null}
          {entry.identifier ? (
            <Fact label="Scanned">
              <TrackingChip value={entry.identifier} showIcon />
            </Fact>
          ) : null}
          {entry.conditionGrade ? <Fact label="Condition">{entry.conditionGrade}</Fact> : null}
          {entry.actor || entry.actorId != null ? (
            <Fact label="By">
              <span className="flex items-center gap-2">
                <StaffAvatar staffId={entry.actorId} name={entry.actor} avatarPhotoId={null} size="sm" colorRing />
                {entry.actor}
              </span>
            </Fact>
          ) : null}
          <Fact label="When">
            <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
              {formatRelativeTime(entry.at, now)} · {new Date(entry.at).toLocaleString()}
            </time>
          </Fact>
        </dl>
        {actions.length > 0 || onOpen ? (
          <div className="grid gap-px bg-mode-rule">
            {actions.map((action) => (
              <Button
                key={action.label}
                // The expected decision is the ink fill; the rest are neutral.
                variant={action.primary ? 'ink' : 'secondary'}
                size="lg"
                radius="mode"
                className="min-h-mode-hit w-full justify-center"
                disabled={action.pending}
                onClick={action.run}
              >
                {action.pending ? action.pendingLabel : action.label}
              </Button>
            ))}
            {onOpen ? (
              <Button
                variant="secondary"
                size="lg"
                radius="mode"
                className="min-h-mode-hit w-full justify-center"
                onClick={() => {
                  onClose();
                  onOpen();
                }}
              >
                Open record
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
