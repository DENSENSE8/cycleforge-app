/** Query state that remains meaningful after the Warehouse route moved. */
export function warehouseRedirectTarget(params: {
  tab?: string;
  new?: string;
  edit?: string;
  code?: string;
}): string {
  const next = new URLSearchParams();
  for (const key of ['tab', 'new', 'edit', 'code'] as const) {
    const value = params[key]?.trim();
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/inventory/locations?${query}` : '/inventory/locations';
}

/** A retired Manage link names one location by barcode/code. */
export function legacyManageLocationTarget(code?: string): string {
  const barcode = code?.trim();
  return barcode ? `/bin/${encodeURIComponent(barcode)}` : '/inventory/locations';
}
