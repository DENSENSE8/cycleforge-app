'use client';

/**
 * `/purchasing/import/[batchId]` body (route node `purchase-import-check`):
 * one upload's check — loading, error, not found, else the sheet.
 */

import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton } from '@/design-system/primitives';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { useInboundImportCheck } from '@/lib/inbound/po-csv-client';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';
import { ImportCheckSheet } from './ImportCheckSheet';

/** Back to Import orders — first on the page's title line. */
export function ImportCheckBack() {
  const router = useRouter();
  return (
    <HoverTooltip label="Back to import orders" asChild>
      <IconButton
        ariaLabel="Back to import orders"
        size="sm"
        onClick={() => router.push(RECEIVING_PATHS.purchaseImport)}
        icon={<ArrowLeft aria-hidden className="size-4" />}
      />
    </HoverTooltip>
  );
}

export function ImportCheckPage({ batchId }: { batchId: number }) {
  const router = useRouter();
  const check = useInboundImportCheck(batchId);

  if (check.isPending) {
    return null;
  }
  if (check.isError) {
    return (
      <EmptyState
        title="Could not load the upload check"
        description={check.error.message}
        action={
          <Button size="sm" variant="secondary" onClick={() => void check.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (!check.data) {
    return (
      <EmptyState
        title="Upload not found"
        description={`No upload ${batchId} in this organization.`}
        action={
          <Button size="sm" variant="secondary" onClick={() => router.push(RECEIVING_PATHS.purchaseImport)}>
            Back to import orders
          </Button>
        }
      />
    );
  }
  return <ImportCheckSheet check={check.data} />;
}
