/** Inbound source registry — the code-side SoT for the `source_type` discriminator shared by every polymorphic inbound table… */

/** Every inbound purchase source this schema recognizes. Order is display order. */
export const INBOUND_SOURCE_TYPES = ['zoho', 'ebay', 'amazon', 'manual'] as const;
export type InboundSourceType = (typeof INBOUND_SOURCE_TYPES)[number];

/** Human labels for pickers / badges (color/tone stays in the semantic tokens). */
export const INBOUND_SOURCE_LABELS: Record<InboundSourceType, string> = {
  zoho: 'Zoho',
  ebay: 'eBay',
  amazon: 'Amazon',
  manual: 'Manual',
};

/** The `receiving_line_facts.fact_kind` that carries a source's marketplace payload, when it has one. */
export const INBOUND_SOURCE_FACT_KIND: Record<InboundSourceType, string | null> = {
  zoho: null,
  ebay: 'ebay_purchase',
  amazon: null, // register 'amazon_purchase' in the facts registry when Amazon inbound lands
  manual: null,
};

/** Type guard — true only for a registered inbound source. */
export function isRegisteredInboundSource(value: string): value is InboundSourceType {
  return (INBOUND_SOURCE_TYPES as readonly string[]).includes(value);
}

/** Assert a source is registered, or throw. */
export function assertRegisteredInboundSource(value: string): asserts value is InboundSourceType {
  if (!isRegisteredInboundSource(value)) {
    throw new Error(
      `inbound: unregistered source_type "${value}" (expected one of ${INBOUND_SOURCE_TYPES.join(', ')})`,
    );
  }
}
