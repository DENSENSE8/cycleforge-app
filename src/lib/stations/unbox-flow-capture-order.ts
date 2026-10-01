/** Optional org override for Unbox capture-step order. */

type UnboxFlowCaptureOrderFlowId = 'found' | 'unfound' | 'return';

type UnboxFlowCaptureOrderMap = Partial<Record<UnboxFlowCaptureOrderFlowId, string[]>>;

const FLOW_IDS: readonly UnboxFlowCaptureOrderFlowId[] = ['found', 'unfound', 'return'];


/** Reorder `allowedKeys` by preference list; append any allowed keys not named. */
export function applyCaptureOrderOverride(
  allowedKeys: readonly string[],
  override: readonly string[] | undefined | null,
): string[] {
  if (!override?.length) return [...allowedKeys];
  const allowed = new Set(allowedKeys);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of override) {
    if (!allowed.has(key) || seen.has(key)) continue;
    out.push(key);
    seen.add(key);
  }
  for (const key of allowedKeys) {
    if (!seen.has(key)) out.push(key);
  }
  return out;
}

/**
 * Parse the settings JSON string. Invalid / non-object → {}.
 * Per-flow arrays: keep only non-empty strings, dedupe, drop unknown flow ids.
 */
export function parseUnboxFlowCaptureOrder(raw: string | null | undefined): UnboxFlowCaptureOrderMap {
  if (raw == null || String(raw).trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const out: UnboxFlowCaptureOrderMap = {};
  const record = parsed as Record<string, unknown>;
  for (const flow of FLOW_IDS) {
    const list = record[flow];
    if (!Array.isArray(list)) continue;
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const key = item.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    if (keys.length > 0) out[flow] = keys;
  }
  return out;
}


export const UNBOX_FLOW_CAPTURE_ORDER_SETTING_KEY = 'receiving.unboxFlowCaptureOrder' as const;
