/**
 * Zoho Inventory *app* deep links (browser tab). Distinct from {@link buildZohoUrl}
 * which builds Inventory *API* URLs. Operator inspect — never embed.
 */

export function zohoInventoryItemAppUrl(itemId: string | null | undefined): string | null {
  const id = (itemId ?? '').trim();
  if (!id) return null;
  return `https://inventory.zoho.com/app#/inventory/items/${encodeURIComponent(id)}`;
}
