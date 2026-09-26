/** X12 EDI 856 (Advance Ship Notice) — the HL hierarchy vocabulary. */

/** `HL03` level codes, restricted to the four an ASN uses. */
const EDI_HL_LEVEL_CODES = {
  /** S — the shipment as a whole. Exactly one, always the root. */
  SHIPMENT: 'S',
  /** O — a purchase order the shipment fulfils. */
  ORDER: 'O',
  /** T — Tare, i.e. a pallet. */
  TARE: 'T',
  /** P — Pack, i.e. a carton. */
  PACK: 'P',
  /** I — Item, the product detail. Always a leaf. */
  ITEM: 'I',
} as const;

export type EdiHlLevelCode =
  (typeof EDI_HL_LEVEL_CODES)[keyof typeof EDI_HL_LEVEL_CODES];

const EDI_HL_LEVEL_CODE_VALUES = Object.values(
  EDI_HL_LEVEL_CODES,
) as readonly EdiHlLevelCode[];

/** The recognised ASN shapes, named by their level codes in nesting order. */
export const ASN_SHAPES = ['SOPI', 'SOTI', 'SOTPI', 'SOI'] as const;
export type AsnShape = (typeof ASN_SHAPES)[number];

/** The level codes each shape nests, outermost first. */
const ASN_SHAPE_LEVELS: Record<AsnShape, readonly EdiHlLevelCode[]> = {
  SOPI: ['S', 'O', 'P', 'I'],
  SOTI: ['S', 'O', 'T', 'I'],
  SOTPI: ['S', 'O', 'T', 'P', 'I'],
  SOI: ['S', 'O', 'I'],
};

/**
 * The 856 caps its HL loop at 200,000 iterations. A projection that would
 * exceed it is not a valid ASN, so the route paginates rather than truncating
 * silently.
 */
export const EDI_856_MAX_HL_LOOPS = 200_000;

/** Pick the shape from what the data actually has. */
export function resolveAsnShape(input: {
  hasTare: boolean;
  hasPack: boolean;
}): AsnShape {
  if (input.hasTare && input.hasPack) return 'SOTPI';
  if (input.hasTare) return 'SOTI';
  if (input.hasPack) return 'SOPI';
  return 'SOI';
}

/**
 * One node of the emitted hierarchy.
 *
 * `id` / `parentId` are `HL01` / `HL02`; a consumer's translator maps this
 * straight onto segments without needing to recompute the numbering.
 */
export interface AsnHlNode {
  /** HL01 — 1-based, unique and monotonic across the whole document. */
  id: number;
  /** HL02 — the parent's `id`. `null` only on the shipment root. */
  parentId: number | null;
  /** HL03 — the level code. */
  level: EdiHlLevelCode;
  /** Level-specific facts. Shape depends on `level`. */
  detail: Record<string, unknown>;
  children: AsnHlNode[];
}

/** Assign `HL01` / `HL02` across a tree in the depth-first order the 856 requires, returning the total count so a caller can check it… */
export function numberAsnHierarchy(root: AsnHlNode): number {
  let next = 1;
  const walk = (node: AsnHlNode, parentId: number | null): void => {
    node.id = next++;
    node.parentId = parentId;
    for (const child of node.children) walk(child, node.id);
  };
  walk(root, null);
  return next - 1;
}

/** Flatten a numbered tree into the HL loop order an 856 serializes. */
export function flattenAsnHierarchy(root: AsnHlNode): AsnHlNode[] {
  const out: AsnHlNode[] = [];
  const walk = (node: AsnHlNode): void => {
    out.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}
