export interface ClassifiedEmail {
  kind: 'marketplace-relay' | 'private-relay';
  provider: string;
  /** Compact face for records; the full address remains the copy payload. */
  label: string;
}

/**
 * Marketplace/private relay addresses are routing identifiers, not useful
 * customer identity. Classify them once so every surface can keep the full
 * value copyable without spending the width of a genuine contact address.
 */
export function classifyEmail(email: string | null | undefined): ClassifiedEmail | null {
  const normalized = String(email || '').trim().toLowerCase();
  const domain = normalized.split('@').at(-1) ?? '';
  if (!domain) return null;

  if (domain === 'members.ebay.com' || domain.endsWith('.members.ebay.com')) {
    return { kind: 'marketplace-relay', provider: 'eBay', label: 'eBay relay email' };
  }
  if (domain === 'marketplace.amazon.com' || domain.endsWith('.marketplace.amazon.com')) {
    return { kind: 'marketplace-relay', provider: 'Amazon', label: 'Amazon relay email' };
  }
  if (domain === 'privaterelay.appleid.com') {
    return { kind: 'private-relay', provider: 'Apple', label: 'Private relay email' };
  }
  return null;
}
