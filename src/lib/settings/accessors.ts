/** Settings Registry — typed server-side accessors for ORG-scope settings. */

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

type ReceivingNasBackup = 'off' | 'mirror' | 'direct';
const getReceivingNasBackup = (s: OrgSettings): ReceivingNasBackup =>
  readOrg<ReceivingNasBackup>(s, 'receiving.nasBackup', 'mirror');

type ReceivingAutoTicket = 'off' | 'on_qa_fail' | 'on_unfound';
const getReceivingAutoTicket = (s: OrgSettings): ReceivingAutoTicket =>
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

const getReceivingAutoPrintLabel = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.autoPrintLabel', false);

const getReceivingConfirmSerialRemoval = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.confirmSerialRemoval', true);

/** Org master switch for scan confirmation tones (per-staff opt-out applies on top). */
const getReceivingScanSoundsEnabled = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.scanSoundsEnabled', false);

/** When true, Receive is gated on a captured serial OR an explicit no-serial waiver. */
const getReceivingRequireSerialConfirmation = (s: OrgSettings): boolean =>
  readOrg<boolean>(s, 'receiving.requireSerialConfirmation', false);

/** Which item photo aspects BLOCK the `item_photos` procedure step. */
export const getReceivingRequiredItemPhotoAspects = (s: OrgSettings): PhotoAspect[] =>
  parsePhotoAspectList(readOrg<string>(s, 'receiving.requiredItemPhotoAspects', 'included,serial'));

export const getReceivingUnboxFlowCaptureOrderRaw = (s: OrgSettings): string =>
  readOrg<string>(s, 'receiving.unboxFlowCaptureOrder', '{}');

/** Org default for the Unbox Band-1 Inbound pin (registry toggle `receiving.unboxDefaultPinnedExtraTabs`). */
export const getReceivingUnboxDefaultPins = (s: OrgSettings): UnboxExtraTabId[] =>
  readOrg<boolean>(s, 'receiving.unboxDefaultPinnedExtraTabs', false) ? ['incoming'] : [];

/** PER-ROLE override of the Inbound pin default. */
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

const getReceivingVisionConsensus = (s: OrgSettings): number =>
  readOrg<number>(s, 'receiving.vision.consensusNeeded', 2);

const getReceivingVisionScanInterval = (s: OrgSettings): number =>
  readOrg<number>(s, 'receiving.vision.scanIntervalMs', 280);

const getReceivingVisionSendMaxDim = (s: OrgSettings): number =>
  readOrg<number>(s, 'receiving.vision.sendMaxDim', 1600);
