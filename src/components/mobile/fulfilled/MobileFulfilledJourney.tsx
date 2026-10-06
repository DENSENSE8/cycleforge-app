'use client';

/**
 * `/m/fulfilled` — the post-ship JOURNEY on the phone (operator 2026-10-05):
 * every fulfilled order of the default window (`GET /api/nav/fulfilled`,
 * order grain, `useMobileFulfilled`) as Act now · Watch · Done, each a band of
 * {@link RecordCardMobile} cards worst first (`compareJourneyUrgency`) — the
 * house phone band (the QC queue's), not the desk's boxed sections. A card
 * is order last 8 · customer or item · carrier · `<stage> · <age> / <limit>`;
 * a tap opens the package, or the check-in conversation on a customer-side
 * stage. Done starts folded. Desk twin: `/fulfilled`.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMobileFulfilled } from '@/components/mobile/fulfilled/useMobileFulfilled';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RecordCardMobile } from '@/design-system/components/record-card/RecordCardMobile';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { Button } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { ITEM_RECORD_MOBILE_ROW } from '@/design-system/tokens/item-record-mobile';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { FULFILLED_PATHS } from '@/lib/nav/route-tree';
import { cn } from '@/utils/_cn';
import { fulfilledMobileSections } from './fulfilled-card-model';

export function MobileFulfilledJourney() {
  const list = useMobileFulfilled();
  const router = useRouter();
  const [doneOpen, setDoneOpen] = useState(false);
  const data = list.data;
  const nowMs = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- the clocks restamp with each read
  const sections = useMemo(() => fulfilledMobileSections(data?.entries ?? [], nowMs), [data, nowMs]);

  return (
    <div className={cn('flex h-full min-h-full flex-col', appMobilePageGroundClass)} data-testid="mobile-fulfilled">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {list.isPending ? (
          <p className="py-10 text-center text-role-body text-text-muted" aria-live="polite">
            Loading fulfilled orders…
          </p>
        ) : list.isError && !data ? (
          <Alert variant="destructive" className="mx-mode-page mt-3">
            <AlertTitle className="text-role-title">Couldn&apos;t load fulfilled orders</AlertTitle>
            <AlertDescription className="text-role-body">{list.error.message}</AlertDescription>
            <Button variant="primary" size="lg" radius="mode" className="col-start-2 mt-3 w-full" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : (
          sections.map((section) => {
            const folded = section.id === 'done' && !doneOpen;
            const headingId = `fulfilled-${section.id}`;
            return (
              <section key={section.id} aria-labelledby={headingId} data-fulfilled-section={section.id}>
                <h2 id={headingId} className={cn(RECORD_LABEL_CLASS, 'flex items-center gap-1.5 px-mode-page pb-1.5 pt-4 text-text-muted')}>
                  {section.label}
                  <span className="tabular-nums text-text-faint">{section.cards.length}</span>
                </h2>
                {section.cards.length === 0 ? (
                  <p className="px-mode-page pb-2 text-role-caption text-text-muted">Nothing here.</p>
                ) : folded ? (
                  <div className="px-mode-page">
                    <Button variant="secondary" size="lg" radius="mode" className="w-full" onClick={() => setDoneOpen(true)}>
                      Show {section.cards.length} done
                    </Button>
                  </div>
                ) : (
                  <ul aria-label={section.label} className={ITEM_RECORD_MOBILE_ROW.list}>
                    {section.cards.map((card) => (
                      <li key={card.key}>
                        <RecordCardMobile
                          model={card.model}
                          factColumns={[]}
                          onOpen={() => {
                            if (card.href) router.push(withJobReturn(card.href, FULFILLED_PATHS.mobile));
                          }}
                          testIdPrefix="fulfilled-card"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
