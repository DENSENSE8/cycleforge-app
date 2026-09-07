'use client';

/**
 * /m/prepacked — the prepacked-products scan, freed from the retired /m/scan
 * pager.
 *
 * Interim host on purpose: the verify/put-away sheet and the persistent
 * label-print feed are the existing components under their own route. The
 * station-harness port (tape + bottom capture) is the long-tail item; this is
 * the cutover, not the redesign.
 */

import { useMemo, useState } from 'react';
import { TextField } from '@/design-system/primitives';
import { PrepackedProductSheet } from '@/components/mobile/redesign/PrepackedProductSheet';
import { ScanResultRow, type ScanFeedItem } from '@/components/mobile/feed/rows/ScanResultRow';
import { useLabelPrintFeed, type LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

/** Map a persistent label-print row → the shared scan-feed row shape, so the
 *  "Recent Scans" list reuses {@link ScanResultRow}. Moved verbatim from the
 *  retired UniversalScan; tapping a row re-opens the detail sheet. */
function mapLabelToScanItem(row: LabelPrintFeedItem): ScanFeedItem {
  // primary = the scannable identity (drives tap → re-open the detail sheet);
  // title/subtitle = the user-friendly product title over its SKU.
  const primary = row.unit_id ?? row.serial_number ?? row.sku ?? String(row.id);
  return {
    id: `label-${row.id}`,
    primary,
    title: row.product_title ?? 'Prepacked Product',
    serial: row.serial_number ?? row.unit_id ?? null,
    subtitle: row.sku ?? null,
    at: new Date(row.printed_at),
    state: 'ok',
    statusLabel: row.current_status ?? 'Printed',
    meta: null,
    href: null,
  };
}

export default function MobilePrepackedScan() {
  const [scanned, setScanned] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  // "Recent Scans" is the persistent label-print history — the same feed as
  // Products → Labels → History (station_activity_logs LABEL_PRINTED), so it
  // survives reloads instead of living in volatile React state.
  const { data: labelFeed = [], refetch: refetchLabels } = useLabelPrintFeed(12);
  const scans = useMemo<ScanFeedItem[]>(() => labelFeed.map(mapLabelToScanItem), [labelFeed]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3">
        <TextField
          label="Scan a product / unit label"
          value={entry}
          onChange={setEntry}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        {scans.map((item) => (
          <ScanResultRow
            key={item.primary + String(item.at)}
            item={item}
            onClick={() => setScanned(item.primary)}
          />
        ))}
      </div>
      <PrepackedProductSheet
        scanned={scanned}
        onClose={() => {
          setScanned(null);
          // A put-away/print during the sheet may have changed the label feed.
          void refetchLabels();
        }}
      />
    </div>
  );
}
