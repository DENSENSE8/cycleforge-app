// Single source of truth for warranty repair-QUOTE status tones.

type WarrantyQuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

const TONES: Record<WarrantyQuoteStatus, string> = {
  DRAFT: 'bg-surface-sunken text-text-muted',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-rose-100 text-rose-700',
  EXPIRED: 'bg-surface-strong text-text-muted',
};

/** Flat chip classes for a warranty quote status; falls back to `DRAFT`. */
export function warrantyQuoteToneClass(status: string): string {
  return TONES[status as WarrantyQuoteStatus] ?? TONES.DRAFT;
}
