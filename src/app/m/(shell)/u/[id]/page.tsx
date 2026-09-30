'use client';

/** `/m/u/[id]` — the unit HUB, same layout as the repair hub (`/m/rs/[id]`): */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { unitStatusBadgeTone } from '@/lib/receiving/receiving-constants';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { conditionLabel } from '@/lib/conditions';
import { Button } from '@/design-system/primitives';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailFact, DetailFacts, DetailNav, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useSerialUnit } from '@/lib/serial/use-serial-unit';
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

  const { data, isLoading, error, refetch } = useSerialUnit(rawParam);

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
    <div className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        subtitle="Unit"
        title={unit?.serial_number ?? (isLoading ? 'Loading…' : 'Not found')}
        mono={Boolean(unit)}
        right={unit ? <StatusPill status={unit.current_status} /> : undefined}
      />

      <div className="flex-1 divide-y divide-mode-rule">
        {isLoading && <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}

        {!isLoading && !unit && (
          <div className="bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700">
            <p className="mb-2">Couldn&apos;t load unit — {error instanceof Error ? error.message : 'try scanning again.'}</p>
            <Button variant="secondary" size="lg" radius="flush" onClick={() => router.back()}>
              Back
            </Button>
          </div>
        )}

        {unit && (
          <>
            <DetailSectionHeading id="unit-info">Information</DetailSectionHeading>
            <DetailFacts label="Information">
              <DetailFact label="Device" value={unit.product_title || null} />
              <DetailFact label="SKU" value={unit.sku || null} mono copy={unit.sku} />
              <DetailFact label="Serial" value={unit.serial_number} mono copy={unit.serial_number} />
              <DetailFact
                label="Condition"
                value={unit.condition_grade ? conditionLabel(unit.condition_grade, 'full') : 'Not graded'}
              />
              <DetailFact
                label="Location"
                value={unit.current_location || 'Not in a bin'}
                mono={Boolean(unit.current_location)}
                copy={unit.current_location}
              />
            </DetailFacts>

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
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const v = (status || 'UNKNOWN').toUpperCase();
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-role-micro ${unitStatusBadgeTone(v)}`}
    >
      {sentenceCaseLabel(v)}
    </span>
  );
}
