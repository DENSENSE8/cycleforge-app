/** A platform mapping can carry two identifiers — a merchant SKU (platform_sku) and a marketplace item id (platform_item_id, e.g. */
export function identifierParts(
  platform: string,
  platformSku: string | null,
  platformItemId: string | null,
): { primary: string; secondary: string | null } {
  const sku = platformSku?.trim() || '';
  const item = platformItemId?.trim() || '';
  if (platform === 'ecwid') {
    return { primary: sku || item || '—', secondary: null };
  }
  const primary = sku || item || '—';
  const hasBoth = !!sku && !!item && sku.toUpperCase() !== item.toUpperCase();
  return { primary, secondary: hasBoth ? item : null };
}
