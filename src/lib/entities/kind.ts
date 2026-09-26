/**
 * THE ENTITY KIND — the one domain union the Warehouse OS speaks
 * (operator ruling, 2026-08-25: one SoT, very simple).
 */

export const ENTITY_KINDS = ['order', 'tracking', 'serial', 'phone'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** The ONE word per kind — every other string is derived from it. */
export const ENTITY_WORD: Readonly<Record<EntityKind, string>> = {
  order: 'Orders',
  tracking: 'Tracking',
  serial: 'Serials',
  phone: 'Phone',
};

/** The selector letter — the word's own first letter, lowercased. */
export function entityLetter(kind: EntityKind): string {
  return ENTITY_WORD[kind][0].toLowerCase();
}

/** The picker row label — `O · Orders`. */
export function entityPickerLabel(kind: EntityKind): string {
  return `${entityLetter(kind).toUpperCase()} · ${ENTITY_WORD[kind]}`;
}

export function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}
