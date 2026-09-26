/** `designated_michael` → **the staffer that names**. */

/** The tag family this module owns, before the separator. */
const DESIGNATED_PREFIX = 'designated';

/** `_`, `-`, `:` — the three separators a human plausibly types. */
const DESIGNATED_TAG_RE = new RegExp(`^${DESIGNATED_PREFIX}[_:-](.+)$`, 'i');

/**
 * Fold to the comparable form: NFD-decompose, drop combining marks, lowercase,
 * trim. Applied to the tag handle, to first names, and to email local-parts, so
 * all three are compared in one alphabet.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * The normalized handle a `designated_*` tag names, or `null` when the tag is
 * not one of ours (`repair_service`), is the bare prefix with nobody after it
 * (`designated_`), or carries whitespace a tag cannot legally contain.
 */
export function parseDesignatedTag(tag: string): string | null {
  if (typeof tag !== 'string') return null;
  const match = DESIGNATED_TAG_RE.exec(tag.trim());
  if (!match) return null;
  const handle = fold(match[1]);
  if (!handle || /\s/.test(handle)) return null;
  return handle;
}

/** A staffer as this rule needs them. `email` is optional — most rows have none. */
export interface DesignatedStaff {
  id: number;
  name: string;
  email?: string | null;
}

/** `{ staffId, tag }` — the tag is carried so the caller can audit WHICH one won. */
interface DesignatedMatch {
  staffId: number;
  tag: string;
}

/** What a ticket's tag set says about who should own it. */
type DesignatedVerdict =
  | { kind: 'none' }
  | { kind: 'ambiguous'; tags: string[] }
  | { kind: 'matched'; staffId: number; tag: string };

/** Every staffer whose first name OR email local-part folds to `handle`. */
function staffMatching(handle: string, staff: readonly DesignatedStaff[]): number[] {
  const ids = new Set<number>();
  for (const person of staff) {
    const firstName = fold(String(person.name ?? '').split(/\s+/)[0] ?? '');
    const localPart = fold(String(person.email ?? '').split('@')[0] ?? '');
    if ((firstName && firstName === handle) || (localPart && localPart === handle)) {
      ids.add(person.id);
    }
  }
  return [...ids];
}

/** Resolve a ticket's tags against the roster. */
export function classifyDesignatedTags(
  tags: readonly string[],
  staff: readonly DesignatedStaff[],
): DesignatedVerdict {
  const matchedTags: string[] = [];
  const matchedIds = new Set<number>();
  let first: DesignatedMatch | null = null;
  let sawDesignatedTag = false;

  for (const tag of tags ?? []) {
    const handle = parseDesignatedTag(tag);
    if (handle == null) continue;
    sawDesignatedTag = true;

    const ids = staffMatching(handle, staff);
    if (ids.length === 0) continue;

    matchedTags.push(tag);
    for (const id of ids) matchedIds.add(id);
    // One tag that names two people is already unanswerable.
    if (ids.length > 1) return { kind: 'ambiguous', tags: matchedTags };
    first ??= { staffId: ids[0], tag };
  }

  if (!sawDesignatedTag || first == null) return { kind: 'none' };
  if (matchedIds.size > 1) return { kind: 'ambiguous', tags: matchedTags };
  return { kind: 'matched', staffId: first.staffId, tag: first.tag };
}

/**
 * The staffer a ticket's tags designate, or `null` for "nobody, or more than
 * one". Callers that need to tell those two apart read
 * {@link classifyDesignatedTags} instead.
 */
export function matchDesignatedStaff(
  tags: readonly string[],
  staff: readonly DesignatedStaff[],
): DesignatedMatch | null {
  const verdict = classifyDesignatedTags(tags, staff);
  return verdict.kind === 'matched' ? { staffId: verdict.staffId, tag: verdict.tag } : null;
}
