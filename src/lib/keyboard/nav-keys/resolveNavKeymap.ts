/**
 * Nav-keys keymap resolver — pure, region-agnostic waist.
 *
 * Assigns ONE lowercase letter to each live target for the leader-armed,
 * per-region selection keyboard. Spec:
 * `docs/todo/nav-keys-selection-keyboard-HANDOFF.md`.
 *
 * Deterministic + collision-free within a live set: a target's declared
 * `preferredKey` wins when free (that's the muscle memory — 'p' = Photos);
 * otherwise the resolver walks a deterministic fallback ladder — the target's
 * own id letters first (still mnemonic), then a plain a–z sweep — taking the
 * first letter no earlier target has claimed. Same input → same output, always
 * (no Math.random, no clock).
 *
 * A per-region UNIQUENESS GUARD (P4) asserts declared preferred keys never
 * collide across a region's FULL possible target set, so the fallback is the
 * rare exception rather than the norm. The resolver stays collision-free even
 * when two live targets declare the same letter (first in order keeps it).
 */

const FALLBACK_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

// Exported for P1 consumers (Left/Middle region adapters); kept local until then
// so P0 adds no unused public export.
interface NavKeyTarget {
  /** Stable target id — the identity muscle memory attaches to. */
  id: string;
  /** Declared stable letter preference; may be unavailable in a live set. */
  preferredKey?: string | null;
}

/** A single a–z letter, lowercased — or null for anything else. */
function normalizeLetter(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ch = raw.trim().toLowerCase();
  return ch.length === 1 && ch >= 'a' && ch <= 'z' ? ch : null;
}

/**
 * Ordered candidate letters for a target: its declared preference, then the
 * a–z letters of its own id (mnemonic fallback), then the full a–z ladder.
 */
function candidatesFor(target: NavKeyTarget): string[] {
  const out: string[] = [];
  const push = (ch: string | null) => {
    if (ch && !out.includes(ch)) out.push(ch);
  };
  push(normalizeLetter(target.preferredKey));
  for (const raw of target.id.toLowerCase()) push(normalizeLetter(raw));
  for (const raw of FALLBACK_ALPHABET) push(raw);
  return out;
}

/**
 * Resolve one letter per target, honoring declared preferences, deterministic
 * and collision-free within the set. A target with no assignable letter (a set
 * larger than the alphabet) is omitted — the caller simply renders no hint for
 * it, which is the honest answer for an over-full region.
 */
export function resolveNavKeymap(
  targets: readonly NavKeyTarget[],
): Map<string, string> {
  const byId = new Map<string, string>();
  const taken = new Set<string>();

  // Pass 1: honor a still-free declared preference (stable muscle memory).
  for (const t of targets) {
    if (byId.has(t.id)) continue;
    const pref = normalizeLetter(t.preferredKey);
    if (pref && !taken.has(pref)) {
      byId.set(t.id, pref);
      taken.add(pref);
    }
  }

  // Pass 2: fill the rest from each target's deterministic candidate ladder.
  for (const t of targets) {
    if (byId.has(t.id)) continue;
    for (const ch of candidatesFor(t)) {
      if (!taken.has(ch)) {
        byId.set(t.id, ch);
        taken.add(ch);
        break;
      }
    }
  }

  return byId;
}

/**
 * Match a bare keydown to a resolved target id. Returns null for modifier
 * combos, non-letters, or unmapped letters — an unmapped key is deliberately
 * NOT consumed by the caller (in the leader-armed mode it exits nav mode; on a
 * focused list it simply no-ops and bubbles).
 */
export function matchNavKey(
  key: string,
  keymap: ReadonlyMap<string, string>,
): string | null {
  const ch = normalizeLetter(key);
  if (!ch) return null;
  for (const [id, letter] of keymap) {
    if (letter === ch) return id;
  }
  return null;
}
