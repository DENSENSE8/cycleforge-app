/**
 * THE ENTITY KIND — the one domain union the Warehouse OS speaks
 * (operator ruling, 2026-08-25: one SoT, very simple).
 *
 * ONE list, ONE word each. Everything else DERIVES: the selector letter is
 * the word's first letter (`o`·`t`·`s`·`p`), the picker label is
 * `O · Orders`, the matched-by disclosure is the word uppercased, the face
 * word is the word. Adding a kind is adding ONE line here plus one
 * icon row at the surface that renders it — the Record types break
 * the build until both exist.
 *
 * DB-free, React-free. The header search-by picker, the grouped search,
 * and match-key stamps all key on this union — presentation modules
 * project it, never redefine it.
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
