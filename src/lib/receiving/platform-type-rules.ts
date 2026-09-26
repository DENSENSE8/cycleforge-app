/** Platform → receiving-type dependency. */

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

/** The types allowed for `platform`, or `null` when the platform is unconstrained (no rules → every active type is legal). */
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

/** Is this pair legal? */
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

/** What the type should become when the platform changes under an existing type. */
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

/** Should the type pill stop asking? */
export function isTypeSettledForPlatform(
  rules: readonly PlatformTypeRule[],
  platform: string | null | undefined,
  currentType: string | null | undefined,
): boolean {
  const allowed = allowedTypesForPlatform(rules, platform);
  return allowed?.length === 1 && key(currentType) === allowed[0];
}
