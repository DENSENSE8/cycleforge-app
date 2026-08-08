import { CopyableId } from './CopyableId';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { InventoryMasterChip } from '@/components/products/InventoryMasterChip';
import { cn } from '@/utils/_cn';

/** Hub header — product title + inventory-namespace chip + copyable canonical SKU. */
export function ProductHubHeader({
  sku,
  title,
  providerItemId,
  providerLabel,
}: {
  sku: string;
  title: string | null;
  providerItemId?: string | null;
  providerLabel?: string | null;
}) {
  return (
    <header
      className={cn(
        'flex items-center gap-2 border-b border-border-soft bg-surface-card px-4',
        PRIMARY_CHROME_ROW_FACE,
      )}
    >
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-text-default">{title || '—'}</h1>
      <InventoryMasterChip providerItemId={providerItemId} providerLabel={providerLabel} />
      <CopyableId value={sku} className="shrink-0 font-mono text-role-caption font-semibold tracking-tight text-text-soft" />
    </header>
  );
}
