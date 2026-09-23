/**
 * Pure subject-identity (first segment) for receiving Zendesk claim tickets.
 *
 * Keeps `buildReceivingClaimTemplate` free of inline classify math and makes the
 * "Return // Return" regression unit-testable without DB.
 */

import {
  classificationLabel,
  classificationPlatformOnlyLabel,
  type IntakeClassification,
} from '@/lib/receiving/intake-classification';
import { receivingLabelTypeDisplay } from '@/lib/receiving/receiving-type-display';
import { sourcePlatformLabel } from '@/lib/source-platform';

interface ClaimSubjectIdentityInput {
  sourcePlatform: string | null | undefined;
  /** Effective receiving/intake type code (PO / RETURN / …). */
  receivingType: string | null | undefined;
  isReturn?: boolean | null;
  returnPlatform?: string | null;
  /** `CLAIM_TYPE_LABEL[claimType]` — used to avoid `Return // Return`. */
  claimTypeLabel: string;
  /** Org-catalog platform label override (wins over built-in). */
  catalogPlatformLabel?: string | null;
  /** Org-catalog type label override (wins over built-in). */
  catalogTypeLabel?: string | null;
}

/**
 * Resolve a known door-classify return without the blind `AMAZON_RETURN`
 * fallback in `columnsToClassification` (that fires when is_return is set but
 * platform is unknown — wrong for subject text).
 */
export function knownReturnClassification(input: {
  isReturn?: boolean | null;
  returnPlatform?: string | null;
  sourcePlatform?: string | null;
}): IntakeClassification | null {
  if (!input.isReturn) return null;
  const rp = String(input.returnPlatform ?? '')
    .trim()
    .toUpperCase();
  if (rp === 'FBA') return 'FBA_RETURN';
  if (rp === 'AMZ') return 'AMAZON_RETURN';
  if (rp === 'EBAY_DRAGONH') return 'EBAY_RETURN_DH';
  if (rp === 'EBAY_USAV') return 'EBAY_RETURN_USAV';
  if (rp === 'EBAY_MK') return 'EBAY_RETURN_MK';
  if (rp === 'WALMART') return 'WALMART_RETURN';
  const sp = String(input.sourcePlatform ?? '')
    .trim()
    .toLowerCase();
  if (sp === 'fba') return 'FBA_RETURN';
  if (sp === 'amazon') return 'AMAZON_RETURN';
  if (sp === 'ebay') return 'EBAY_RETURN_USAV';
  if (sp === 'walmart') return 'WALMART_RETURN';
  return null;
}

/**
 * First subject segment: classify identity (platform / type / intake label).
 *
 * Order:
 * 1. Known intake return → `FBA Return`, `eBay Return`, … — or just the
 *    platform (`FBA`) when the claim TYPE segment already says "Return", so
 *    the assembled subject never duplicates it (`FBA Return // Return // …`).
 * 2. Platform + type → `FBA - Return`
 * 3. Platform only / type only — never emit a bare type that equals the claim
 *    type label (`Return // Return`); use `Unknown - Return` instead.
 */
export function resolveClaimSubjectIdentity(input: ClaimSubjectIdentityInput): string {
  const known = knownReturnClassification({
    isReturn: input.isReturn,
    returnPlatform: input.returnPlatform,
    sourcePlatform: input.sourcePlatform,
  });
  if (known) {
    const claim = String(input.claimTypeLabel ?? '').trim();
    // The claim being filed is itself "Return" — the classify identity's own
    // "Return" word would just restate it. Platform alone (still distinct per
    // eBay sub-account) carries all the new information here.
    if (claim.toLowerCase() === 'return') return classificationPlatformOnlyLabel(known);
    return classificationLabel(known);
  }

  const catalogPlatform = String(input.catalogPlatformLabel ?? '').trim();
  const builtinPlatform = sourcePlatformLabel(input.sourcePlatform);
  const platformLabel =
    catalogPlatform ||
    (builtinPlatform && builtinPlatform !== 'Unknown' ? builtinPlatform : '');

  const catalogType = String(input.catalogTypeLabel ?? '').trim();
  const typeCode = String(input.receivingType ?? '').trim();
  const typeLabel = catalogType || (typeCode ? receivingLabelTypeDisplay(typeCode) : '');

  if (platformLabel && typeLabel) return `${platformLabel} - ${typeLabel}`;
  if (platformLabel) return platformLabel;
  if (typeLabel) {
    const claim = String(input.claimTypeLabel ?? '').trim();
    if (claim && typeLabel.toLowerCase() === claim.toLowerCase()) {
      return `Unknown - ${typeLabel}`;
    }
    return typeLabel;
  }
  return 'Unknown';
}

