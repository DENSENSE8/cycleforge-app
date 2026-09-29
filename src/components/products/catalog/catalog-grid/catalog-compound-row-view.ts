import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import type { CatalogListRow } from '@/components/products/catalog/types';

function text(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

export function catalogCompoundView(row: CatalogListRow): CompoundRowView {
  const identities = row.platform_ids ?? [];
  const firstItem = identities.map((entry) => text(entry.platform_item_id)).find(Boolean) ?? null;
  const platformNames = [...new Set(identities.map((entry) => text(entry.platform)).filter((value): value is string => Boolean(value)))];
  const noteParts = [text(row.category), firstItem ? `Item ${firstItem}` : null, platformNames.join(' · ') || null].filter(Boolean);
  return {
    id: String(row.id),
    thumbUrl: text(row.image_url),
    title: text(row.display_title) ?? text(row.product_title) ?? row.sku,
    note: noteParts.join(' · ') || null,
    orderId: null,
    identityFace: { value: row.sku, label: 'Catalog SKU' },
    identitySubFace: firstItem ? { value: firstItem, label: 'Item number' } : null,
    tracking: null,
    platformValue: platformNames[0] ?? null,
    carrier: null,
    orderedAt: platformNames.length > 0
      ? { label: platformNames.length === 1 ? platformNames[0] : `${platformNames.length} platforms`, tip: platformNames.join(', ') }
      : null,
    stateLabel: row.has_pending_action ? 'Needs attention' : row.is_active ? 'Active' : 'Inactive',
    stateTone: row.has_pending_action ? 'alert' : row.is_active ? 'done' : 'neutral',
    stateTip: row.is_inventory_linked ? 'Linked to the inventory item master' : 'No inventory item link',
    delay: null,
    amount: null,
  };
}
