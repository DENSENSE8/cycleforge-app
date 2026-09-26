/** Intake classification — the single source of truth for "what kind of package is this" picked at the receiving door (mobile `/m/receive`… */

export type IntakeClassification =
  | 'PO'
  | 'FBA_RETURN'
  | 'AMAZON_RETURN'
  | 'EBAY_RETURN_DH'
  | 'EBAY_RETURN_USAV'
  | 'EBAY_RETURN_MK'
  | 'WALMART_RETURN'
  | 'TRADE_IN'
  | 'LOCAL_PICKUP'
  | 'UNKNOWN';

/** The carton-level columns a classification maps onto (`receiving` table). */
export interface IntakeColumns {
  /** Per-line on `receiving_lines`; carried as a hint for added items. */
  receiving_type: 'PO' | 'RETURN' | 'TRADE_IN' | 'PICKUP' | null;
  is_return: boolean;
  /** Value of the `return_platform_enum` DB type. */
  return_platform: string | null;
  /** Value of SOURCE_PLATFORM_OPTS. */
  source_platform: string | null;
}

const MAP: Record<IntakeClassification, IntakeColumns> = {
  PO: { receiving_type: 'PO', is_return: false, return_platform: null, source_platform: null },
  FBA_RETURN: { receiving_type: 'RETURN', is_return: true, return_platform: 'FBA', source_platform: 'fba' },
  AMAZON_RETURN: { receiving_type: 'RETURN', is_return: true, return_platform: 'AMZ', source_platform: 'amazon' },
  EBAY_RETURN_DH: { receiving_type: 'RETURN', is_return: true, return_platform: 'EBAY_DRAGONH', source_platform: 'ebay' },
  EBAY_RETURN_USAV: { receiving_type: 'RETURN', is_return: true, return_platform: 'EBAY_USAV', source_platform: 'ebay' },
  EBAY_RETURN_MK: { receiving_type: 'RETURN', is_return: true, return_platform: 'EBAY_MK', source_platform: 'ebay' },
  WALMART_RETURN: { receiving_type: 'RETURN', is_return: true, return_platform: 'WALMART', source_platform: 'walmart' },
  TRADE_IN: { receiving_type: 'TRADE_IN', is_return: false, return_platform: null, source_platform: null },
  LOCAL_PICKUP: { receiving_type: 'PICKUP', is_return: false, return_platform: null, source_platform: null },
  UNKNOWN: { receiving_type: null, is_return: false, return_platform: null, source_platform: null },
};

export function isIntakeClassification(v: unknown): v is IntakeClassification {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MAP, v);
}

/** Resolve a classification to the carton columns. Unknown values → UNKNOWN. */
export function classificationToColumns(c: IntakeClassification): IntakeColumns {
  return MAP[c] ?? MAP.UNKNOWN;
}

/** Reverse: infer the classification from a carton's stored columns (for display). */
export function columnsToClassification(pkg: {
  is_return?: boolean | null;
  return_platform?: string | null;
  source_platform?: string | null;
  receiving_type?: string | null;
}): IntakeClassification {
  if (pkg.is_return) {
    const rp = (pkg.return_platform ?? '').trim().toUpperCase();
    if (rp === 'FBA') return 'FBA_RETURN';
    if (rp === 'AMZ') return 'AMAZON_RETURN';
    if (rp === 'EBAY_DRAGONH') return 'EBAY_RETURN_DH';
    if (rp === 'EBAY_USAV') return 'EBAY_RETURN_USAV';
    if (rp === 'EBAY_MK') return 'EBAY_RETURN_MK';
    if (rp === 'WALMART') return 'WALMART_RETURN';
    // Return flagged but platform unknown — fall back via source_platform.
    const sp = (pkg.source_platform ?? '').trim().toLowerCase();
    if (sp === 'fba') return 'FBA_RETURN';
    if (sp === 'amazon') return 'AMAZON_RETURN';
    if (sp === 'ebay') return 'EBAY_RETURN_USAV';
    if (sp === 'walmart') return 'WALMART_RETURN';
    return 'AMAZON_RETURN';
  }
  const rt = (pkg.receiving_type ?? '').trim().toUpperCase();
  if (rt === 'TRADE_IN') return 'TRADE_IN';
  if (rt === 'PICKUP') return 'LOCAL_PICKUP';
  if (rt === 'PO') return 'PO';
  return 'UNKNOWN';
}

export type IntakeTone = 'slate' | 'blue' | 'rose' | 'amber' | 'emerald';

/** Display options for the door selector + scan chips. Order = picker order. */
export const INTAKE_CLASSIFICATION_OPTS: ReadonlyArray<{
  value: IntakeClassification;
  label: string;
  /** Compact label for a scan-row chip. */
  short: string;
  tone: IntakeTone;
}> = [
  { value: 'UNKNOWN', label: 'Unknown', short: '—', tone: 'slate' },
  { value: 'PO', label: 'Purchase order', short: 'PO', tone: 'blue' },
  { value: 'FBA_RETURN', label: 'Amazon return', short: 'AMZ', tone: 'rose' },
  { value: 'AMAZON_RETURN', label: 'Amazon Return', short: 'AMZ', tone: 'rose' },
  { value: 'EBAY_RETURN_DH', label: 'eBay Return (DH)', short: 'eBay·DH', tone: 'rose' },
  { value: 'EBAY_RETURN_USAV', label: 'eBay Return', short: 'eBay', tone: 'rose' },
  { value: 'EBAY_RETURN_MK', label: 'eBay Return (MK)', short: 'eBay·MK', tone: 'rose' },
  { value: 'WALMART_RETURN', label: 'Walmart Return', short: 'WMT', tone: 'rose' },
  { value: 'TRADE_IN', label: 'Trade-In', short: 'Trade', tone: 'amber' },
  { value: 'LOCAL_PICKUP', label: 'Local Pickup', short: 'Pickup', tone: 'emerald' },
];

export function classificationLabel(c: IntakeClassification): string {
  return INTAKE_CLASSIFICATION_OPTS.find((o) => o.value === c)?.label ?? 'Unknown';
}

/** Compact scan-chip / rail short for a classification (`AMZ`, `eBay`, `WMT`). */
export function classificationShort(c: IntakeClassification): string {
  return INTAKE_CLASSIFICATION_OPTS.find((o) => o.value === c)?.short ?? '—';
}

/** Platform-only identity for a return classification — same platform, without the trailing "Return" word. */
const RETURN_CLASSIFICATION_PLATFORM_LABEL: Partial<Record<IntakeClassification, string>> = {
  FBA_RETURN: 'Amazon',
  AMAZON_RETURN: 'Amazon',
  EBAY_RETURN_DH: 'eBay (DH)',
  EBAY_RETURN_USAV: 'eBay',
  EBAY_RETURN_MK: 'eBay (MK)',
  WALMART_RETURN: 'Walmart',
};

export function classificationPlatformOnlyLabel(c: IntakeClassification): string {
  return RETURN_CLASSIFICATION_PLATFORM_LABEL[c] ?? classificationLabel(c);
}
