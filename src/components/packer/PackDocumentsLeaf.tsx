'use client';

/**
 * Pack Displays → Documents — label / slip tray + SKU manuals (QC Manuals grain).
 * Centre stays checklist-only; papers never mount inline in the work column.
 */

import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { IntakeManualLinkBlock } from '@/components/shipped/IntakeManualLinkBlock';
import { PackPapersStatusCard } from '@/components/packer/PackPapersStatusCard';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';

interface PackDocumentsLeafProps {
  orderRowId: number;
  orderId: string;
  sku?: string | null;
  productTitle?: string | null;
}

export function PackDocumentsLeaf({
  orderRowId,
  orderId,
  sku,
  productTitle,
}: PackDocumentsLeafProps) {
  const skuTrim = String(sku || '').trim();

  return (
    <div className={cn(DISPLAYS_BODY_INSET, 'flex min-h-0 flex-col gap-4 py-3')}>
      {/* Print status lives here — never as a centre green band. */}
      <PackPapersStatusCard orderRowId={orderRowId} />

      <OrderDocumentsSection
        orderId={orderRowId}
        orderRef={orderId}
        flush
        showPreview
      />

      <div className="space-y-2 border-t border-border-hairline pt-3">
        <p className="text-role-micro font-semibold uppercase tracking-widest text-text-faint">
          Product manuals
        </p>
        {skuTrim ? (
          <IntakeManualLinkBlock
            sku={skuTrim}
            productTitle={productTitle ?? undefined}
            orderId={orderId}
          />
        ) : (
          <p className="text-role-caption text-text-faint">
            Add a SKU on the order to pair manuals from the library.
          </p>
        )}
      </div>
    </div>
  );
}
