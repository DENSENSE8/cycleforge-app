import type {
  CartonInspectorLine,
  CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';

/**
 * Best-effort order lookup tokens for a receiving carton — local pickup order
 * id first, then carton tracking, then per-line tracking numbers.
 */
export function receivingOrderLinkTokens(
  receiving: Pick<CartonInspectorReceiving, 'tracking' | 'local_pickup_order_id'>,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'tracking_number'>> | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined) => {
    const token = String(raw ?? '').trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };

  push(receiving.local_pickup_order_id);
  push(receiving.tracking);
  for (const line of lines ?? []) {
    push(line.tracking_number);
  }

  return out;
}
