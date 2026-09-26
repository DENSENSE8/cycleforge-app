import { looksLikeFnsku } from '@/lib/scan-resolver';
import type { OrgId } from '@/lib/tenancy/constants';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { detectCarrier } from './normalize';
import { getShipmentByTracking, healShipmentOrganizationId } from './repository';
import { registerAndSyncShipment } from './sync-shipment';

/** READ-ONLY resolution — never registers or syncs a shipment. */
export async function lookupShipmentId(
  rawInput: string,
  orgId?: OrgId,
): Promise<{ shipmentId: number | null; scanRef: string | null }> {
  const trimmed = rawInput.trim();
  if (!trimmed) return { shipmentId: null, scanRef: null };

  if (looksLikeFnsku(trimmed)) {
    return { shipmentId: null, scanRef: trimmed };
  }

  // FedEx GS1 SoT — unwrap 96… gun reads so lookup hits the short human STN key.
  const normalized = extractCanonicalTracking(trimmed);
  try {
    const existing =
      orgId != null
        ? await getShipmentByTracking(normalized, orgId)
        : await getShipmentByTracking(normalized);
    if (existing) return { shipmentId: existing.id, scanRef: null };
  } catch {
    // ignore lookup error; fall through to scanRef
  }
  return { shipmentId: null, scanRef: trimmed };
}

/**
 * After resolving a shipment under a known tenant, heal a NULL organization_id
 * so FORCE RLS can see the row on subsequent tenant-scoped reads.
 */
async function maybeHealResolvedShipment(
  shipmentId: number | null,
  orgId?: OrgId,
): Promise<void> {
  if (orgId == null || shipmentId == null || shipmentId <= 0) return;
  try {
    await healShipmentOrganizationId(shipmentId, orgId);
  } catch {
    // Best-effort — never fail a resolve over a heal miss.
  }
}

/** For a raw scan input, returns: */
export async function resolveShipmentId(
  rawInput: string,
  // OPTIONAL tenant scope.
  orgId?: OrgId,
): Promise<{
  shipmentId: number | null;
  scanRef: string | null;
}> {
  const trimmed = rawInput.trim();
  if (!trimmed) return { shipmentId: null, scanRef: null };

  // Canonical FNSKU / ASIN scans (X0... / B0...) must never resolve to carrier shipment rows;
  // tech station treats them as FNSKU context (scanRef only), same as deduped tracking elsewhere.
  if (looksLikeFnsku(trimmed)) {
    return { shipmentId: null, scanRef: trimmed };
  }

  // FedEx GS1 SoT — unwrap 96… gun reads so lookup/register share the short STN key.
  const normalized = extractCanonicalTracking(trimmed);
  const carrier = detectCarrier(normalized);

  if (!carrier) {
    // Unknown carrier — still try a DB lookup so that existing rows are found
    try {
      const existing =
        orgId != null
          ? await getShipmentByTracking(normalized, orgId)
          : await getShipmentByTracking(normalized);
      if (existing) {
        await maybeHealResolvedShipment(existing.id, orgId);
        return { shipmentId: existing.id, scanRef: null };
      }
    } catch {
      // ignore lookup error; fall through to scanRef
    }
    return { shipmentId: null, scanRef: trimmed };
  }

  try {
    const shipment =
      orgId != null
        ? await registerAndSyncShipment(
            {
              trackingNumber: trimmed,
              carrier,
              sourceSystem: 'scan',
            },
            orgId,
          )
        : await registerAndSyncShipment({
            trackingNumber: trimmed,
            carrier,
            sourceSystem: 'scan',
          });
    await maybeHealResolvedShipment(shipment.id, orgId);
    return { shipmentId: shipment.id, scanRef: null };
  } catch {
    // Registration/sync failed — try a plain DB lookup as fallback
    try {
      const existing =
        orgId != null
          ? await getShipmentByTracking(normalized, orgId)
          : await getShipmentByTracking(normalized);
      if (existing) {
        await maybeHealResolvedShipment(existing.id, orgId);
        return { shipmentId: existing.id, scanRef: null };
      }
    } catch {
      // ignore
    }
    return { shipmentId: null, scanRef: trimmed };
  }
}
