/** Client/server wire types for the prepack flow: one package of one or more serial units. */

export const PREPACK_KIT_PART_TYPES = [
  'REMOTE',
  'CABLE',
  'ACCESSORY',
  'MANUAL',
  'PACKAGING',
] as const;

export type PrepackKitPartType = (typeof PREPACK_KIT_PART_TYPES)[number];

/** Physical condition of the unit in hand (`condition_grade_enum`). */
export const PREPACK_CONDITIONS = [
  'BRAND_NEW',
  'LIKE_NEW',
  'REFURBISHED',
  'USED_A',
  'USED_B',
  'USED_C',
  'PARTS',
] as const;

export type PrepackCondition = (typeof PREPACK_CONDITIONS)[number];

export function parsePrepackCondition(raw: string | null | undefined): PrepackCondition | null {
  const value = String(raw ?? '').trim().toUpperCase();
  return (PREPACK_CONDITIONS as readonly string[]).includes(value) ? (value as PrepackCondition) : null;
}

/**
 * Who restored the unit, if anyone (`serial_units.refurb_provenance`). A
 * listing-program / history attribute, never a physical condition: a unit can
 * be physically Used A and still be Amazon Renewed.
 */
export const PREPACK_PROVENANCES = ['NONE', 'MANUFACTURER', 'SELLER', 'AMAZON_RENEWED'] as const;

export type PrepackProvenance = (typeof PREPACK_PROVENANCES)[number];

export const PREPACK_PROVENANCE_LABEL: Record<PrepackProvenance, string> = {
  NONE: 'None',
  MANUFACTURER: 'Manufacturer refurbished',
  SELLER: 'Seller refurbished',
  AMAZON_RENEWED: 'Amazon Renewed',
};

export function parsePrepackProvenance(raw: string | null | undefined): PrepackProvenance | null {
  const value = String(raw ?? '').trim().toUpperCase();
  return (PREPACK_PROVENANCES as readonly string[]).includes(value) ? (value as PrepackProvenance) : null;
}

/**
 * Unit-specific evidence a prepack must carry. Each kind is a `photo_aspect`
 * on a SERIAL_UNIT `prepack` photo; catalog photos belong to the SKU and never
 * count here.
 */
export const PREPACK_EVIDENCE_KINDS = ['serial', 'condition', 'contents'] as const;

export type PrepackEvidenceKind = (typeof PREPACK_EVIDENCE_KINDS)[number];

export type PrepackEvidence = Record<PrepackEvidenceKind, number>;

/** The aspect a capture of each kind is stamped with. */
export const PREPACK_EVIDENCE_ASPECT = {
  serial: 'serial',
  condition: 'condition',
  contents: 'included',
} as const satisfies Record<PrepackEvidenceKind, string>;

export const PREPACK_EVIDENCE_LABEL: Record<PrepackEvidenceKind, string> = {
  serial: 'Serial label',
  condition: 'Condition',
  contents: 'Contents',
};

/** Contents evidence is required only when the SKU expects parts. */
export function requiredPrepackEvidence(kitPartCount: number): PrepackEvidenceKind[] {
  return kitPartCount > 0 ? [...PREPACK_EVIDENCE_KINDS] : ['serial', 'condition'];
}

/** One missing piece of package evidence. `serialUnitId` names the serial a per-serial gap belongs to. */
export interface PrepackEvidenceGap {
  kind: PrepackEvidenceKind;
  serialUnitId: number | null;
}

/**
 * A package's evidence: every serial carries its own serial photo; condition
 * and contents are package facts, satisfied by a photo on any member (the
 * form captures them on the first serial).
 */
export function missingPackageEvidence(
  units: readonly { id: number; evidence: PrepackEvidence }[],
  kitPartCount: number,
): PrepackEvidenceGap[] {
  if (units.length === 0) return requiredPrepackEvidence(kitPartCount).map((kind) => ({ kind, serialUnitId: null }));
  const gaps: PrepackEvidenceGap[] = [];
  for (const kind of requiredPrepackEvidence(kitPartCount)) {
    if (kind === 'serial') {
      for (const unit of units) if ((unit.evidence.serial ?? 0) < 1) gaps.push({ kind, serialUnitId: unit.id });
    } else if (units.every((unit) => (unit.evidence[kind] ?? 0) < 1)) {
      gaps.push({ kind, serialUnitId: null });
    }
  }
  return gaps;
}

/** One sentence naming what a package still needs before Finish. */
export function packageEvidenceRefusal(gaps: readonly PrepackEvidenceGap[], serialCount: number): string | null {
  if (gaps.length === 0) return null;
  const serialGaps = gaps.filter((gap) => gap.kind === 'serial').length;
  const parts = [
    serialGaps > 0
      ? serialCount > 1 ? `a serial photo for ${serialGaps} of ${serialCount} serials` : 'a serial photo'
      : null,
    gaps.some((gap) => gap.kind === 'condition') ? 'a condition photo' : null,
    gaps.some((gap) => gap.kind === 'contents') ? 'a contents photo' : null,
  ].filter(Boolean);
  return `Take ${parts.join(', ')} before printing.`;
}

export interface PrepackCatalogChoice {
  id: number;
  sku: string;
  title: string;
  /** Manufacturer part number (`sku_catalog.mpn`), when recorded. */
  mpn: string | null;
  /** Inactive catalog identities remain selectable for units already received under them. */
  isActive: boolean;
  isProvisional: boolean;
  /** The product photo (`skuCatalogImageUrlSql` precedence); null paints initials. */
  imageUrl: string | null;
}

export interface PrepackKitPart {
  id: number;
  componentName: string;
  componentType: PrepackKitPartType;
  qtyRequired: number;
  /** A REMOTE's own catalog SKU, resolved only through sku_relationships. */
  componentSku: string | null;
}

export interface PrepackKit {
  catalog: PrepackCatalogChoice;
  parts: PrepackKitPart[];
  /** Reference photos on the catalog SKU (entity `SKU`). Never unit evidence. */
  catalogPhotoCount: number;
}

export interface PrepackContentFact extends PrepackKitPart {
  included: boolean;
}

export interface PrepackUnit {
  id: number;
  serialNumber: string;
  unitUid: string | null;
  sku: string | null;
  skuCatalogId: number | null;
  title: string | null;
  currentStatus: string;
  currentLocation: string | null;
  conditionGrade: string | null;
  refurbProvenance: PrepackProvenance | null;
  orderId: number | null;
  orderLabel: string | null;
  prepackedAt: string | null;
  prepackedByName: string | null;
  prepackLocationCode: string | null;
  /** The SEALED PREBOX package (`label_manifests.manifest_uid`) this unit is already packed in. */
  packageUid: string | null;
  /** Every serial in that package (this one included), in package order. */
  packageSerials: string[];
  contents: PrepackContentFact[];
  /** Typed prepack photo counts on this unit. */
  evidence: PrepackEvidence;
}

/** A unit lookup: the unit, or a serial CycleForge has never seen (it is created when added to a package). */
export type PrepackUnitLookup = { unit: PrepackUnit; newSerial: null } | { unit: null; newSerial: string };
