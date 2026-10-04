'use client';

/**
 * QC — `/m/qc`, the QC QUEUE (owner 2026-09-29), built like the pick list:
 * - the day's progress at the very top ({@link JobProgress}): units this tech
 *   passed or failed today, over those plus the queue;
 * - every unit waiting for QC, most urgent first — Returns, Repair service,
 *   Unfound, Local pickup, Test again, then Quality control
 *   (`@/lib/qc/qc-queue-order`) — one band per tier that has units, one
 *   card per unit with the bin first ('No bin' pairs one by scan);
 * - a tap opens that unit's QC (`/m/u/:id/qc`), whose X returns here;
 * - Scan to QC, floating over the list: the one scan kernel armed for QC.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { JobProgress } from '@/components/mobile/JobProgress';
import { MobileV2AppSwitcher } from '@/components/mobile/v2/MobileV2AppSwitcher';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DetailDock } from '@/design-system/components/DetailDock';
import { RecordCardMobile } from '@/design-system/components/record-card/RecordCardMobile';
import { Button } from '@/design-system/primitives';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { ITEM_RECORD_MOBILE_ROW } from '@/design-system/tokens/item-record-mobile';
import { QC_QUEUE_TIER } from '@/design-system/tokens/qc-queue-tier';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { QC_CARD_FACT_COLUMNS, qcCardModel } from '@/lib/qc/qc-card-model';
import { QC_QUEUE_TIERS, type QcQueueTier, type QcQueueUnit } from '@/lib/qc/qc-queue-order';
import { qcQueueQuery } from '@/lib/qc/queue-client';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';
import { cn } from '@/utils/_cn';
import { PairUnitBinSheet, type PairUnitBinTarget } from './PairUnitBinSheet';

/** This queue's path — the X a unit's QC returns to. */
const QC_QUEUE_HREF = '/m/qc';

export function QcQueueScreen() {
  const router = useRouter();
  const [pairTarget, setPairTarget] = useState<PairUnitBinTarget | null>(null);
  // Refetch on every landing: coming back from a verdict must drop the unit.
  const queue = useQuery({ ...qcQueueQuery(), refetchOnMount: 'always' });
  const data = queue.data;

  const bands = useMemo(() => {
    const units = data?.units ?? [];
    const byTier = new Map<QcQueueTier, QcQueueUnit[]>();
    for (const unit of units) {
      const list = byTier.get(unit.tier);
      if (list) list.push(unit);
      else byTier.set(unit.tier, [unit]);
    }
    return QC_QUEUE_TIERS.flatMap((tier) => {
      const list = byTier.get(tier);
      return list ? [{ tier, units: list, count: data?.tierCounts[tier] ?? list.length }] : [];
    });
  }, [data]);

  const nowMs = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- the ages restamp with each read
  const total = data?.total ?? 0;
  const done = data?.doneToday ?? 0;
  const shown = data?.units.length ?? 0;

  const openUnit = (serialUnitId: number) => router.push(withJobReturn(`/m/u/${serialUnitId}/qc`, QC_QUEUE_HREF));

  return (
    <div className={cn('flex h-full min-h-full flex-col', appMobilePageGroundClass)}>
      <header className="sticky top-0 z-header flex h-[3.25rem] shrink-0 items-center border-b border-border-soft bg-surface-card/95 backdrop-blur-xl has-[[data-mobile-navigation-open=true]]:z-panel">
        <MobileV2AppSwitcher />
        <h1 className="min-w-0 flex-1 px-2 text-[15px] font-semibold tracking-[-0.01em] text-text-default">
          Quality control
        </h1>
      </header>
      <JobProgress done={done} total={done + total} doneWord="tested" />

      <div className="flex flex-1 flex-col overflow-y-auto" data-testid="qc-queue">
        {queue.isPending ? (
          <p className="py-10 text-center text-role-body text-text-muted" aria-live="polite">
            Loading the QC queue…
          </p>
        ) : queue.isError && !data ? (
          <Alert variant="destructive" className="mx-mode-page mt-3">
            <AlertTitle className="text-role-title">Couldn&apos;t load the QC queue</AlertTitle>
            <AlertDescription className="text-role-body">{queue.error.message}</AlertDescription>
            <Button variant="primary" size="lg" radius="mode" className="col-start-2 mt-3 w-full" onClick={() => void queue.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : total === 0 ? (
          <p className="px-mode-page py-10 text-center text-role-body text-text-muted">Nothing waiting for QC.</p>
        ) : (
          <>
            {bands.map((band) => {
              const face = QC_QUEUE_TIER[band.tier];
              const headingId = `qc-tier-${band.tier}`;
              return (
                <section key={band.tier} aria-labelledby={headingId} data-qc-tier={band.tier}>
                  <h2 id={headingId} className={cn(RECORD_LABEL_CLASS, 'flex items-center gap-1.5 px-mode-page pb-1.5 pt-4 text-text-muted')}>
                    {face.label}
                    <span className="tabular-nums text-text-faint">{band.count}</span>
                  </h2>
                  <ul aria-label={face.label} className={ITEM_RECORD_MOBILE_ROW.list}>
                    {band.units.map((unit) => (
                      <QcQueueCard
                        key={unit.serialUnitId}
                        unit={unit}
                        nowMs={nowMs}
                        onOpen={() => openUnit(unit.serialUnitId)}
                        onPairBin={() => setPairTarget({ serialUnitId: unit.serialUnitId, name: unit.title || unit.serial || `unit ${unit.serialUnitId}` })}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {shown < total ? (
              <p className="px-mode-page pb-2 pt-4 text-center text-role-caption text-text-muted">
                Showing the {shown} most urgent of {total}.
              </p>
            ) : null}
          </>
        )}

        {/* The job CTA floats over the list; its own height is the list's bottom clearance. */}
        <DetailDock
          label="Quality control"
          placement="float"
          verbs={[{ id: 'scan', label: 'Scan to QC', icon: null, primary: true, testId: 'qc-scan' }]}
          onVerb={() => router.push(QC_SCAN_HREF)}
        />
      </div>

      <PairUnitBinSheet target={pairTarget} onClose={() => setPairTarget(null)} />
    </div>
  );
}

/** The QC adapter over the phone card: bin top-left ('No bin' pairs one), tier code, carton handle, age. */
function QcQueueCard({ unit, nowMs, onOpen, onPairBin }: { unit: QcQueueUnit; nowMs: number; onOpen: () => void; onPairBin: () => void }) {
  const model = useMemo(() => qcCardModel(unit, nowMs), [unit, nowMs]);
  return (
    <li data-qc-queue-unit={unit.serialUnitId}>
      <RecordCardMobile
        model={model.card}
        factColumns={QC_CARD_FACT_COLUMNS}
        location={{ path: model.location, onPress: model.needsBin ? onPairBin : undefined }}
        onOpen={onOpen}
        testIdPrefix="qc-card"
      />
    </li>
  );
}
