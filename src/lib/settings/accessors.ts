/**
 * Settings Registry — typed server-side accessors for ORG-scope settings.
 *
 * Domain code reads org policy through these thin getters (same convention as
 * getPackingEnforcement / getActiveNasBaseUrl in ../tenancy/settings.ts): a
 * fully-typed value with the registry default baked in. Keep each accessor's key
 * + default in sync with its registry row.
 *
 * NOTE: these return the CONFIGURED value and do not apply the plan-entitlement
 * gate. A caller that reads a plan-gated setting (nasBackup `direct`, the
 * vision.* knobs) must also check `hasFeature(orgId, …)` before acting on a
 * gated value — see the resolver (./resolve.ts) which the API uses for UI.
 */

import { parsePhotoAspectList, type PhotoAspect } from '@/lib/photos/photo-aspects';
import { canonicalRole, type StaffRole } from '@/lib/auth/permissions-shared';
import type { UnboxExtraTabId } from '@/lib/receiving/unbox-extra-tabs';
import type { OrgSettings } from '@/lib/tenancy/settings';

function readOrg<T extends string | number | boolean>(
  s: OrgSettings,
  key: string,
  fallback: T,
): T {
  const v = (s as unknown as Record<string, unknown>)[key];
  return v === undefined || v === null ? fallback : (v as T);
}

export type ReceivingPhotoPolicy = 'optional' | 'require_one' | 'require_per_item';
export const getReceivingPhotoPolicy = (s: OrgSettings): ReceivingPhotoPolicy =>
  readOrg<ReceivingPhotoPolicy>(s, 'receiving.photoPolicy', 'optional');

export type ReceivingNasBackup = 'off' | 'mirror' | 'direct';
export const getReceivingNasBackup = (s: OrgSettings): ReceivingNasBackup =>
  readOrg<ReceivingNasBackup>(s, 'receiving.nasBackup', 'mirror');

export type ReceivingAutoTicket = 'off' | 'on_qa_fail' | 'on_unfound';
export const getReceivingAutoTicket = (s: OrgSettings): ReceivingAutoTicket =>
  readOrg<ReceivingAutoTicket>(s, 'receiving.autoTicket', 'off');

/** Default putaway bin barcode. Falls back to the legacy env value then UNSORTED. */
export const getReceivingDefaultPutawayBin = (s: OrgSettings, envFallback?: string): string => {
  const env = (envFallback ?? '').trim();
  return readOrg<string>(s, 'receiving.defaultPutawayBin', env || 'UNSORTED');
};

/** Returns testing bin barcode. Falls back to env then RETURNS-TEST. */
export const getReceivingReturnsTestBin = (s: OrgSettings, envFallback?: string): string => {
  const env = (envFallback ?? '').trim();
  return readOrg<string>(s, 'receiving.returnsTestBin', env || 'RETURNS-TEST');
};

export const getReceivingAutoPrintLabel = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.autoPrintLabel', false);

export const getReceivingConfirmSerialRemoval = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.confirmSerialRemoval', true);

/** Org master switch for scan confirmation tones (per-staff opt-out applies on top). */
export const getReceivingScanSoundsEnabled = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.scanSoundsEnabled', false);

/** When true, Receive is gated on a captured serial OR an explicit no-serial waiver. */
export const getReceivingRequireSerialConfirmation = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.requireSerialConfirmation', false);

/**
 * Which item photo aspects BLOCK the `item_photos` procedure step.
 *
 * Stored as a comma list (see the registry row); parsed through the aspect SoT,
 * which drops unknown tokens rather than defaulting them. An empty result is a
 * legal answer — "any item photo counts" — and is what a two-person reseller
 * wants; the gate falls back to the line's photo count in that case.
 */
export const getReceivingRequiredItemPhotoAspects = (s: OrgSettings): PhotoAspect[] =>
  parsePhotoAspectList(readOrg<string>(s, 'receiving.requiredItemPhotoAspects', 'included,serial'));

export const getReceivingUnboxFlowCaptureOrderRaw = (s: OrgSettings): string =>
  readOrg<string>(s, 'receiving.unboxFlowCaptureOrder', '{}');

/**
 * Org default for the Unbox Band-1 Inbound pin (registry toggle
 * `receiving.unboxDefaultPinnedExtraTabs`). v1 the pin catalog is Inbound-only,
 * so the org policy is a single boolean → the pin list (or none). New staff
 * inherit this until they pin/unpin their own strip. See the resolve order in
 * src/lib/receiving/unbox-default-pins.ts (Gemini D9).
 */
export const getReceivingUnboxDefaultPins = (s: OrgSettings): UnboxExtraTabId[] =>
  readOrg<boolean>(s, 'receiving.unboxDefaultPinnedExtraTabs', false) ? ['incoming'] : [];

/**
 * PER-ROLE override of the Inbound pin default. Admins set it in Settings →
 * Receiving → Unbox strip as one `select` per role (Inherit · Pinned · Not
 * pinned), stored as flat registry keys
 * `receiving.unboxDefaultPinnedByRole.<canonicalRole>` (folded through
 * {@link canonicalRole} so `receiving`→`receiver` etc. — see the generated rows
 * in ../settings/registry.ts).
 *
 * The three states are the whole point of the role tier: `inherit` (default)
 * returns `undefined` so the resolver falls through to the org default; `on` /
 * `off` are an explicit per-role override that WINS over the org default (Gemini
 * D9). A boolean toggle could not express "inherit", which is why this is a
 * three-value select rather than a switch.
 */
export const getReceivingUnboxRoleDefaultPins = (
  s: OrgSettings,
  role: string | null | undefined,
): UnboxExtraTabId[] | undefined => {
  if (!role) return undefined;
  const v = readOrg<string>(
    s,
    `receiving.unboxDefaultPinnedByRole.${canonicalRole(role as StaffRole)}`,
    'inherit',
  );
  if (v === 'on') return ['incoming'];
  if (v === 'off') return [];
  return undefined; // inherit → fall through to the org default
};

export const getReceivingVisionConsensus = (s: OrgSettings): number =>
  readOrg<number>(s, 'receiving.vision.consensusNeeded', 2);

export const getReceivingVisionScanInterval = (s: OrgSettings): number =>
  readOrg<number>(s, 'receiving.vision.scanIntervalMs', 280);

export const getReceivingVisionSendMaxDim = (s: OrgSettings): number =>
  readOrg<number>(s, 'receiving.vision.sendMaxDim', 1600);
