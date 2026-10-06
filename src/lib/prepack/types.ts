/**
 * Client/server wire types for the prepack form: one product, N packages, one
 * label per package. A package carries zero, one or more serials.
 */

import type { QcLabelPrintUnit } from '@/lib/labels/qc-label-row';

export const PREPACK_KIT_PART_TYPES = [
  'REMOTE',
  'CABLE',
  'ACCESSORY',
  'MANUAL',
  'PACKAGING',
] as const;

export type PrepackKitPartType = (typeof PREPACK_KIT_PART_TYPES)[number];

export const PREPACK_KIT_PART_TYPE_LABEL: Record<PrepackKitPartType, string> = {
  REMOTE: 'Remote',
  CABLE: 'Cable',
  ACCESSORY: 'Accessory',
  MANUAL: 'Manual',
  PACKAGING: 'Packaging',
};

/**
 * Physical condition a prepack may grade (`condition_grade_enum`). The enum
 * also holds USED_C and PARTS; prepack never offers them (operator 2026-10-05).
 */
export const PREPACK_CONDITIONS = [
  'BRAND_NEW',
  'LIKE_NEW',
  'REFURBISHED',
  'USED_A',
  'USED_B',
] as const;

export type PrepackCondition = (typeof PREPACK_CONDITIONS)[number];

export const PREPACK_CONDITION_LABEL: Record<PrepackCondition, string> = {
  BRAND_NEW: 'New',
  LIKE_NEW: 'Like new',
  REFURBISHED: 'Refurbished',
  USED_A: 'Used A',
  USED_B: 'Used B',
};

/** A prepack grade, or null — a unit graded Used C / Parts prefills nothing. */
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

/** One catalog product as the browser, the selected card and the hero paint it: square image, title, SKU. */
export interface PrepackCatalogChoice {
  id: number;
  sku: string;
  title: string;
  /** The product photo (`skuCatalogImageUrlSql` precedence); null paints initials. */
  imageUrl: string | null;
}

export interface PrepackKitPart {
  id: number;
  componentName: string;
  componentType: PrepackKitPartType;
  qtyRequired: number;
  /** The part's own catalog SKU, resolved through sku_relationships; null when unpaired. */
  componentSku: string | null;
}

/** A child SKU paired to the product (`sku_relationships` parent → child). */
export interface PrepackKitChild {
  id: number;
  sku: string;
  title: string;
}

/**
 * Where a `product_manuals` row is linked today — the "use cases" the
 * operator checks before pairing. One row links one SKU (scalar columns), so
 * pairing a manual that is linked elsewhere MOVES it here.
 */
export interface PrepackManualUsage {
  sku: string | null;
  skuCatalogId: number | null;
  /** The linked SKU's catalog title (else the manual's own `product_title`). */
  productTitle: string | null;
  itemNumber: string | null;
  orderId: number | null;
  /** The order's channel number (`orders.order_id`), when pinned to one order. */
  orderLabel: string | null;
  status: 'unassigned' | 'assigned' | 'archived';
}

/** One `product_manuals` row: what it is, and where it is used. Its file opens at `productManualContentPath(id)`. */
export interface PrepackManual {
  id: number;
  /** `display_name`, else `product_title`, else `file_name`. */
  title: string;
  /** Paperwork type (`manual`, `packing_list`, …). */
  type: string | null;
  fileName: string | null;
  updatedAt: string | null;
  usage: PrepackManualUsage;
}

/** The product's pairing facts: parts list, child SKUs and the manual. */
export interface PrepackKit {
  catalog: PrepackCatalogChoice;
  parts: PrepackKitPart[];
  children: PrepackKitChild[];
  manual: PrepackManual | null;
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
}

/** A unit lookup: the unit, or a serial CycleForge has never seen (it is created on save). */
export type PrepackUnitLookup = { unit: PrepackUnit; newSerial: null } | { unit: null; newSerial: string };

/** Hand-edited label face for one package (the QC page's product label editor). Null fields print the product default. */
export interface PrepackLabelFace {
  /** Top row; null = the product title. */
  title: string | null;
  /** Bottom-right color. */
  color: string | null;
  /** Custom text under the title (the face's centre line). */
  text: string | null;
}

/** One package = one label. `serials` may be empty (the unit gets a CycleForge `U-…` handle) or hold 2+ (one PREBOX manifest). */
export interface PrepackPackageInput {
  serials: string[];
  condition: PrepackCondition;
  provenance: PrepackProvenance;
  label: PrepackLabelFace;
}

/** `POST /api/prepack/package` body. Contents decisions apply to every package. */
export interface PrepackSaveInput {
  skuCatalogId: number;
  packages: PrepackPackageInput[];
  contents: { kitPartId: number; included: boolean }[];
  clientEventId?: string;
}

/** `POST /api/prepack/package` answer: one print unit per package, in request order. */
export interface PrepackSaveResult {
  catalog: PrepackCatalogChoice;
  printUnits: QcLabelPrintUnit[];
}

/** `POST /api/prepack/catalog/[id]/parts` body: one part on the product's list, optionally paired to a child SKU. */
export interface PrepackKitPartInput {
  componentName: string;
  componentType: PrepackKitPartType;
  qtyRequired: number;
  childSkuCatalogId: number | null;
}

/** `DELETE /api/prepack/catalog/[id]/manual` body: unlink the manual from this product, or retire it from the library. */
export interface PrepackManualRemoveInput {
  manualId: number;
  mode: 'unpair' | 'delete';
}
