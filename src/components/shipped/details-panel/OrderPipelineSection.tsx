'use client';

import { Barcode, Box, ShieldCheck } from '@/components/Icons';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  MilestonePipeline,
  StatusStrip,
  type Milestone,
  type MilestoneScan,
} from '@/design-system/components/milestone-pipeline';
import { deriveShippingDisplayMeta, serialNumberRowsFromShipped } from './shipping-information/helpers';
import { orderStampOrNull } from './shipped-details-logic';

function stamp(value: string | null | undefined): string | null {
  const raw = value == null ? '' : String(value).trim();
  return raw && raw !== '1' ? raw : null;
}

const GLYPH = 'h-[15px] w-[15px]';

/**
 * The order's packout pipeline — Tested · Packed · Scanned Out when those
 * stamps exist. {@link MilestonePipeline} drops skipped / future stages so a
 * pack+ship order paints two nodes edge to edge.
 *
 * A thin mapper onto {@link MilestonePipeline}, which owns the anatomy this
 * shares with the carton and arrival pipelines. Everything specific to an ORDER
 * lives here: which timestamps count as a stamp, who the actor is for each
 * stage, and what that station actually read.
 */
export function OrderPipelineSection({
  shipped,
  face = 'station',
}: {
  shipped: ShippedOrder;
  /** `strip` is the FIND confirmation face. Station benches keep avatars. */
  face?: 'station' | 'strip';
}) {
  const meta = deriveShippingDisplayMeta(shipped, serialNumberRowsFromShipped(shipped));
  const row = shipped as ShippedOrder & {
    tester_id?: number | null;
    test_activity_at?: string | null;
  };

  const testedAt = meta.testedAtSource;
  const packedAt = meta.packedAtSource;
  const scannedOutAt = orderStampOrNull(shipped.ship_confirmed_at);

  /**
   * Provenance asks "which field IS the stamp the helper chose", rather than
   * re-running its precedence here — two copies of that chain would drift and
   * start attributing stamps to the wrong scanner.
   */
  const testedVia = !testedAt
    ? null
    : stamp(shipped.test_date_time) === testedAt
      ? 'Serial scan'
      : stamp(row.test_activity_at) === testedAt
        ? 'Station scan'
        : 'Test event';

  const serials = String(shipped.serial_number || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const tracking = String(shipped.shipping_tracking_number || '').trim();
  const carrier = shipped.carrier ?? null;
  const trackingScan: MilestoneScan[] = tracking
    ? [{ kind: 'tracking', value: tracking, carrier }]
    : [];

  const milestones: Milestone[] = [
    {
      key: 'tested',
      label: 'Tested',
      icon: <ShieldCheck className={GLYPH} />,
      at: testedAt,
      // The staff ID mirrors the fallback order `deriveShippingDisplayMeta`
      // uses for the NAME. If the two disagreed, one person's face would sit
      // above another person's name.
      actor: { staffId: row.tested_by ?? row.tester_id ?? null, name: meta.techNameDisplay },
      scans:
        testedVia === 'Serial scan' && serials.length > 0
          ? serials.map((value) => ({ kind: 'serial', value }))
          : [],
      readyLabel: 'Ready to test',
    },
    {
      key: 'packed',
      label: 'Packed',
      icon: <Box className={GLYPH} />,
      at: packedAt,
      actor: { staffId: row.packed_by ?? null, name: meta.packerNameDisplay },
      scans: trackingScan,
      readyLabel: 'Ready to pack',
    },
    {
      key: 'scanned_out',
      label: 'Scanned Out',
      icon: <Barcode className={GLYPH} />,
      at: scannedOutAt,
      actor: { staffId: row.shipped_out_by ?? null, name: meta.scannedOutByDisplay ?? '' },
      scans: trackingScan,
      readyLabel: 'Ready to ship',
    },
  ];

  if (face === 'strip') {
    return <StatusStrip milestones={milestones} ariaLabel="Order progress" className="w-full" />;
  }

  return (
    <section className="px-4 py-1">
      <MilestonePipeline milestones={milestones} ariaLabel="Order progress" className="w-full" />
    </section>
  );
}
