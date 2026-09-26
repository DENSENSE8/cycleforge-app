/** Nav-keys keymap resolver — pure, region-agnostic waist. */

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

/** Resolve one letter per target, honoring declared preferences, deterministic and collision-free within the set. */
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

/** Match a bare keydown to a resolved target id. */
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
