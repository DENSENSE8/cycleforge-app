export type HardwareScannerPayload = string | { value?: unknown };

export function parseHardwareScannerPayload(payload: HardwareScannerPayload): string | null {
  const value = typeof payload === 'string' ? payload : payload.value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
