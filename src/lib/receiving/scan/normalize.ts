/** Canonical scan-match key: */
export function normalizeScanKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
