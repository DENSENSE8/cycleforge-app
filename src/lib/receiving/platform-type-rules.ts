/**
 * Platform → receiving-type dependency.
 *
 * Platform is the CONTROLLING field, type is the DEPENDENT one, and
 * `platform_type_rules` is the dependency matrix. First rule: an FBA carton at
 * the dock is a customer return, never a purchase order.
 *
 * **Open by default, closed per platform.** A platform with no rules allows
 * every active type; a platform with rules allows only those. Constraining one
 * platform costs one row, not a row per platform — the same grammar as the
 * catalogs beside it, where presence flips the mode rather than absence being a
 * gap to backfill.
 *
 * Everything here is pure and DB-free on purpose: the UI narrows the picker with
 * it and the PATCH route validates with it, so the two can never disagree about
 * what is legal — and it stays unit-testable without a database. The read lives
 * in `neon/catalog-queries.ts` (`listPlatformTypeRules`) with its siblings.
 *
 * Everything is compared upper-cased — `types.slug` is lower (`return`) while
 * `receiving.intake_type` is upper (`RETURN`), and that mismatch is exactly how
 * a rule quietly stops matching.
 */

export interface PlatformTypeRule {
  /** `platform_type_rules.id` — how an editor addresses one rule. */
  id?: number;
  platformId?: number;
  typeId?: number;
  /** `platforms.slug`, lower-case. */
  platform: string;
  /** `types.slug`, upper-cased to the `intake_type` storage contract. */
  type: string;
  /** `types.label` — what an operator reads ("Return"), not the slug. */
  typeLabel?: string;
  isDefault: boolean;
}

/** Normalise either side of a pair for comparison. */
function key(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * The types allowed for `platform`, or `null` when the platform is
 * unconstrained (no rules → every active type is legal).
 *
 * `null` and `[]` mean opposite things and callers must not collapse them:
 * `null` is "no opinion", `[]` is "nothing is legal here". `[]` is only
 * reachable if an org authors rules pointing at types it later deactivates,
 * which is a catalog mistake worth surfacing rather than silently reading as
 * "allow everything".
 */
export function allowedTypesForPlatform(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
): string[] | null {
  const p = key(platform);
  if (!p) return null;
  const matched = rules.filter((r) => key(r.platform) === p);
  return matched.length ? matched.map((r) => key(r.type)) : null;
}

/** The pre-selected type for `platform`, if it declares one. */
export function defaultTypeForPlatform(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
): string | null {
  const p = key(platform);
  if (!p) return null;
  const hit = rules.find((r) => key(r.platform) === p && r.isDefault);
  return hit ? key(hit.type) : null;
}

/**
 * Is this pair legal? An unconstrained platform, an empty platform, or an empty
 * type all pass — a rule narrows a CHOICE, it never forces one to be made.
 * Clearing the type has to stay possible on a constrained platform, otherwise
 * the operator cannot correct a mis-scan.
 */
export function isPairAllowed(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
  type: string | null | undefined,
): boolean {
  const t = key(type);
  if (!t) return true;
  const allowed = allowedTypesForPlatform(rules, platform);
  if (allowed === null) return true;
  return allowed.includes(t);
}

/**
 * What the type should become when the platform changes under an existing type.
 *
 * - Still legal → keep it.
 * - Illegal, and the new platform has exactly one option → switch to it. This
 *   is the ergonomic payoff: picking FBA files the carton as a Return without
 *   the operator touching the type pill.
 * - Illegal and ambiguous → clear it and let them choose. Never keep an illegal
 *   pair, and never guess between two legal answers.
 */
export function reconcileTypeForPlatform(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
  currentType: string | null | undefined,
): string | null {
  if (isPairAllowed(rules, platform, currentType)) {
    const current = key(currentType);
    if (current) return current;
    // No type yet — a single-option or defaulted platform fills it in.
    return defaultTypeForPlatform(rules, platform) ?? soleOption(rules, platform);
  }
  return defaultTypeForPlatform(rules, platform) ?? soleOption(rules, platform);
}

function soleOption(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
): string | null {
  const allowed = allowedTypesForPlatform(rules, platform);
  return allowed && allowed.length === 1 ? allowed[0]! : null;
}

/**
 * Should the type pill stop asking?
 *
 * Only when the platform allows exactly one type AND the carton already says
 * it. The second half is load-bearing: a carton filed before the rule existed
 * can hold a value the rule now forbids, and locking THAT pill would show the
 * operator a wrong answer while removing the control that fixes it. A rule may
 * remove a choice — it must never strand a carton.
 */
export function isTypeSettledForPlatform(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
  currentType: string | null | undefined,
): boolean {
  const allowed = allowedTypesForPlatform(rules, platform);
  return allowed?.length === 1 && key(currentType) === allowed[0];
}
