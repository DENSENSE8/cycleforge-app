'use client';

/**
 * `/m/u/[id]` — the unit HUB, same layout as the repair hub (`/m/rs/[id]`):
 * identity in the top bar, an Information panel of the facts a tech glances
 * at, then doors to contextual screens from the `useUnitHubRows` registry
 * (Quality control, Line test, Pair with order, Move to bin, Stash in bin,
 * Receiving line, History).
 *
 * Reached from any unit label scan — `U-{id}`, GS1 `(01)(21)` / Digital Link,
 * or a minted unit_uid; `GET /api/serial-units/[ref]` resolves all three.
 * Line test and Stash are the receiving-line verbs the old phone unit page
 * (`/serial/[id]`, now desktop-only) carried.
 *
 * The verbs are sheets on this screen. On mount the page reads
 * `mobile.scan.recent`: when the previous scan (within five minutes) was an
 * order it opens Pair prefilled, else when it was a bin it opens Move
 * prefilled — "scan order → scan unit" is one tap from confirm.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { unitStatusBadgeTone } from '@/lib/receiving/receiving-constants';
import { conditionLabel } from '@/lib/conditions';
import { Button, Panel } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailFactRow, DetailNav, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useMobileUnit } from '@/components/mobile/unit/useMobileUnit';
import { useUnitHubRows, type UnitHubVerb } from '@/components/mobile/unit/useUnitHubRows';
import { UnitLineTestSheet, UnitStashSheet } from '@/components/mobile/unit/UnitLineSheets';
import { UnitMoveSheet, UnitPairSheet } from '@/components/mobile/unit/UnitVerbSheets';

// Mirror of /m/scan's RecentScan — kept loose so we don't crash on shape drift.
interface ScanContext {
  raw: string;
  kind?: string;
  scannedAt: number;
  orders?: Array<{ order_id?: string | null; orderId?: string | null; id?: number | null }>;
}

const SCAN_CONTEXT_KEY = 'mobile.scan.recent';
const SCAN_CONTEXT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes — the relevance horizon for prefill.

function readScanContext(): ScanContext[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SCAN_CONTEXT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pickContext(scans: ScanContext[]): {
  order: string | null;
  location: string | null;
} {
  const now = Date.now();
  let order: string | null = null;
  let location: string | null = null;
  for (const scan of scans) {
    if (!scan || typeof scan.scannedAt !== 'number') continue;
    if (now - scan.scannedAt > SCAN_CONTEXT_WINDOW_MS) break;
    // First match wins (most recent first).
    if (!order) {
      const firstOrder = Array.isArray(scan.orders) ? scan.orders[0] : null;
      const ref = firstOrder?.order_id ?? firstOrder?.orderId ?? null;
      if (ref) order = String(ref);
    }
    if (!location && (scan.kind === 'location' || scan.kind === 'bin')) {
      location = scan.raw;
    }
    if (order && location) break;
  }
  return { order, location };
}

export default function MobileUnitPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rawParam = String(params?.id ?? '');
  const { user, isLoaded } = useAuth();

  const [sheet, setSheet] = useState<UnitHubVerb | null>(null);
  // Scan-context prefill, consumed by the first open of its sheet.
  const [seed, setSeed] = useState<Record<'pair' | 'move', string>>({ pair: '', move: '' });
  const [ack, setAck] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) router.replace(`/signin?next=/m/u/${rawParam}`);
  }, [isLoaded, user, router, rawParam]);

  const { data, isLoading, error, refetch } = useMobileUnit(rawParam);

  // Once on mount — re-running would reopen a sheet the operator closed.
  useEffect(() => {
    const ctx = pickContext(readScanContext());
    if (ctx.order) {
      setSeed((s) => ({ ...s, pair: ctx.order ?? '' }));
      setSheet('pair');
    } else if (ctx.location) {
      setSeed((s) => ({ ...s, move: ctx.location ?? '' }));
      setSheet('move');
    }
  }, []);

  const openVerb = useCallback((verb: UnitHubVerb) => {
    setAck(null);
    setSheet(verb);
  }, []);
  const closeSheet = useCallback(() => {
    setSheet(null);
    setSeed({ pair: '', move: '' });
  }, []);
  const handleDone = useCallback(
    (message: string) => {
      closeSheet();
      setAck(message);
      void refetch();
    },
    [closeSheet, refetch],
  );

  const hubRows = useUnitHubRows(rawParam, data, openVerb);
  const unit = data?.serial_unit ?? null;

  if (!isLoaded || !user) {
    return <div className="min-h-screen bg-surface-card" />;
  }

  return (
    // Unit work is decide-and-record, like the repair hub: triage mode owns
    // neutral geometry; the unit status tone stays semantic.
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        subtitle="Unit"
        title={unit?.serial_number ?? (isLoading ? 'Loading…' : 'Not found')}
        mono={Boolean(unit)}
        right={unit ? <StatusPill status={unit.current_status} /> : undefined}
      />

      <div className="flex-1 space-y-5 px-mode-page py-mode-page">
        {isLoading && <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}

        {!isLoading && !unit && (
          <div className="space-y-3 rounded-mode border border-rose-200 bg-rose-50 p-mode-page">
            <p className="text-mode-body font-semibold text-rose-700">
              Couldn&apos;t load unit — {error instanceof Error ? error.message : 'try scanning again.'}
            </p>
            <Button variant="secondary" onClick={() => router.back()}>
              Back
            </Button>
          </div>
        )}

        {unit && (
          <>
            <section aria-labelledby="unit-info" className="space-y-2">
              <DetailSectionHeading id="unit-info">Information</DetailSectionHeading>
              <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
                <DetailFactRow
                  label="Device"
                  value={unit.product_title || <span className="text-text-faint">No product title</span>}
                />
                <DetailFactRow
                  label="SKU"
                  value={unit.sku ? <span className="font-mono">{unit.sku}</span> : <span className="text-text-faint">No SKU</span>}
                />
                <DetailFactRow label="Serial" value={<span className="font-mono">{unit.serial_number}</span>} />
                <DetailFactRow
                  label="Condition"
                  value={
                    unit.condition_grade ? (
                      conditionLabel(unit.condition_grade, 'full')
                    ) : (
                      <span className="text-text-faint">Not graded</span>
                    )
                  }
                />
                <DetailFactRow
                  label="Location"
                  value={
                    unit.current_location ? (
                      <span className="font-mono">{unit.current_location}</span>
                    ) : (
                      <span className="text-text-faint">Not in a bin</span>
                    )
                  }
                />
              </Panel>
            </section>

            {ack ? <DetailAck onDismiss={() => setAck(null)}>{ack}</DetailAck> : null}

            <DetailNav label="Unit screens" rows={hubRows} />
          </>
        )}
      </div>

      {unit ? (
        <>
          <UnitPairSheet
            open={sheet === 'pair'}
            unitId={unit.id}
            initialValue={seed.pair}
            onClose={closeSheet}
            onDone={handleDone}
          />
          <UnitMoveSheet
            open={sheet === 'move'}
            unitId={unit.id}
            initialValue={seed.move}
            onClose={closeSheet}
            onDone={handleDone}
          />
          {unit.current_receiving_line_id ? (
            <>
              <UnitLineTestSheet
                open={sheet === 'line-test'}
                unitId={unit.id}
                lineId={unit.current_receiving_line_id}
                staffId={user.staffId ?? 0}
                onClose={closeSheet}
                onDone={handleDone}
              />
              <UnitStashSheet
                open={sheet === 'stash'}
                unitId={unit.id}
                lineId={unit.current_receiving_line_id}
                staffId={user.staffId ?? 0}
                onClose={closeSheet}
                onDone={handleDone}
              />
            </>
          ) : null}
        </>
      ) : null}
    </ModeRegion>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const v = (status || 'UNKNOWN').toUpperCase();
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-role-micro uppercase tracking-wide ${unitStatusBadgeTone(v)}`}
    >
      {v}
    </span>
  );
}
