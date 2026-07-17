/**
 * Outbound queue preference keys + URL helpers for the dashboard workbench.
 * Shareable filters stay in the URL; column presets use localStorage.
 */

/** Needs-attention focus: blocked OR late (To Ship) / exceptions (Shipped). */
export const ATTENTION_PARAM = 'attention';

export function isAttentionOnly(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  const v = searchParams.get(ATTENTION_PARAM);
  return v === '1' || v === 'true';
}

/** localStorage key for column preset labels (not the hidden set itself). */
export const OUTBOUND_COLUMN_PRESET_KEY = 'outbound-queue-column-preset';

export type OutboundColumnPreset = 'full' | 'ops' | 'minimal';

export const OUTBOUND_COLUMN_PRESET_HIDDEN: Record<OutboundColumnPreset, readonly string[]> = {
  full: [],
  /** Dense ops: drop platform chip noise, keep identity + meta. */
  ops: ['platform'],
  /** Floor scan: qty + title + tracking only. */
  minimal: ['platform', 'condition', 'rest'],
};
