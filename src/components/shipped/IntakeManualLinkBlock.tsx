'use client';

import { useCallback, useState } from 'react';
import { FileText, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { ManualPicker } from '@/components/tech/sku-testing/ManualPicker';
import { pairManualBySku } from '@/components/tech/sku-testing/sku-testing-api';

export interface LinkedIntakeManual {
  id: number;
  displayName: string;
}

/**
 * QC-style library manual pair for order intake. Requires a SKU — pairing
 * writes to sku_catalog / product_manuals so pack-print can resolve manuals
 * once the order is created with the same SKU.
 */
export function IntakeManualLinkBlock({
  sku,
  productTitle,
  orderId,
}: {
  sku: string;
  productTitle?: string;
  orderId?: string;
}) {
  const [pairing, setPairing] = useState(false);
  const [linked, setLinked] = useState<LinkedIntakeManual[]>([]);
  const skuTrim = sku.trim();
  const canPair = Boolean(skuTrim);

  const onPaired = useCallback(async () => {
    setPairing(false);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-role-micro font-semibold uppercase tracking-widest text-text-faint">
          Product manual
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          disabled={!canPair}
          onClick={() => setPairing((v) => !v)}
          className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:text-text-faint"
        >
          Pair
        </Button>
      </div>

      {!canPair ? (
        <p className="text-role-caption text-text-faint">
          Enter a SKU above to pair a manual from the library (same as QC).
        </p>
      ) : null}

      {pairing && canPair ? (
        <ManualPicker
          onPair={async (manualId) => {
            const manual = await pairManualBySku({
              manualId,
              sku: skuTrim,
              productTitle: productTitle?.trim() || undefined,
              orderId: orderId?.trim() || undefined,
            });
            const name =
              manual.display_name ||
              manual.file_name ||
              `Manual #${manualId}`;
            setLinked((prev) =>
              prev.some((m) => m.id === manualId)
                ? prev
                : [...prev, { id: manualId, displayName: name }],
            );
          }}
          onPaired={onPaired}
        />
      ) : null}

      {linked.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {linked.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-none border border-border-soft/70 bg-surface-card px-2.5 py-1.5"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-text-faint" />
              <span className="min-w-0 truncate text-role-caption font-medium text-text-default">
                {m.displayName}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
