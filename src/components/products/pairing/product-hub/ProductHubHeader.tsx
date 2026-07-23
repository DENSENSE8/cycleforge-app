import { CopyableId } from './CopyableId';
import { InventoryMasterChip } from '@/components/products/InventoryMasterChip';

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
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-black tracking-tight text-text-default">{title || '—'}</h1>
      <InventoryMasterChip providerItemId={providerItemId} providerLabel={providerLabel} />
      <CopyableId value={sku} className="shrink-0 font-mono text-role-caption font-bold tracking-tight text-text-soft" />
    </header>
  );
}
