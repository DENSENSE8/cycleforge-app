'use client';

import type { ReactNode } from 'react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { INTAKE } from '@/design-system/tokens/intake';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';
import type { StationItemAction, StationTapeEntry, StationTone } from '@/lib/mobile/station-tape';

const TONE_STATE: Record<StationTone, StateName> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 min-w-0 items-center gap-3 border-b border-border-soft px-4">
      <dt className="w-20 shrink-0 text-xs font-semibold text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-text-default">{children}</dd>
    </div>
  );
}

export function MobileV2ScanRecentSheet({
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
  const tone = STATE_TONE_CLASSES[TONE_STATE[entry.tone]];
  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{entry.title?.trim() || untitledLabel}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div data-testid="mobile-v2-scan-recent-sheet">
            {entry.imageUrl ? (
              <div className="relative aspect-square w-full overflow-hidden border-b border-border-soft bg-surface-sunken">
                <ItemRecordThumb imageUrl={entry.imageUrl} className="h-full w-full min-h-0" />
              </div>
            ) : null}
            <dl>
              <Fact label="Outcome"><span className={cn('font-semibold', tone.text)}>{entry.verb}</span></Fact>
              {entry.message ? <Fact label="Server"><span className={cn('font-medium', tone.text)}>{entry.message}</span></Fact> : null}
              {entry.intake ? <Fact label="Type">{INTAKE[entry.intake].label}</Fact> : null}
              {entry.recordId ? <Fact label="Record"><OrderIdChip value={entry.recordId} display={entry.recordId} /></Fact> : null}
              {entry.identifier ? <Fact label="Scanned"><TrackingChip value={entry.identifier} showIcon /></Fact> : null}
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
              <div className="grid gap-2 border-t border-border-soft bg-surface-sunken p-3">
                {actions.map((action) => (
                  <Button
                    key={action.label}
                    variant={action.primary ? 'primary' : 'secondary'}
                    size="lg"
                    radius="surface"
                    className="min-h-11 w-full justify-center"
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
                    radius="surface"
                    className="min-h-11 w-full justify-center"
                    onClick={() => { onClose(); onOpen(); }}
                  >
                    Open record
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
