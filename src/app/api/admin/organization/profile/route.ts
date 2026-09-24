import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization, updateOrgSettings } from '@/lib/tenancy/organizations';
import type { OrgSettings } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';
import { isKioskCommandId } from '@/lib/kiosk/commands';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { isShipFromComplete, parseShipFromInput } from '@/lib/shipping/ship-from-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function profilePayload(settings: OrgSettings) {
  return {
    timezone: settings.timezone,
    currency: settings.currency,
    locale: settings.locale,
    emailFirstSignin: settings.emailFirstSignin,
    requirePasskeyForNewStaff: settings.requirePasskeyForNewStaff,
    maxConcurrentSessions: settings.maxConcurrentSessions,
    warrantyDays: settings.warrantyDays,
    packing: settings.packing ?? { enforcement: 'advisory' as const },
    brand: settings.brand ?? {},
    kiosk: settings.kiosk ?? {},
    letterhead: settings.letterhead ?? { addressLine1: '', addressLine2: '', phone: '', email: '' },
    // Warehouse origin for ShipStation rates/labels. `null` = never set (the
    // SHIPSTATION_SHIP_FROM_* env fallback, if any, applies).
    shipFrom: settings.shipFrom ?? null,
    shipFromComplete: isShipFromComplete(settings.shipFrom),
  };
}

/** GET → org profile fields from organizations.settings jsonb. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const org = await getOrganization(ctx.organizationId as OrgId);
  const settings = org?.settings;
  if (!settings) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  return NextResponse.json(profilePayload(settings));
}, { permission: 'admin.view' });

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Partial<OrgSettings> = {};
  const b = body as Record<string, unknown>;
  /*
   * `updateOrgSettings` merges with jsonb `||`, which is SHALLOW: writing
   * `kiosk` replaces the whole object. Every nested branch below therefore
   * needs the block it is amending, or saving a select would silently drop the
   * tenant's other keys in that block (the reason `brand` and `letterhead`
   * rebuild theirs wholesale).
   */
  const current = (await getOrganization(ctx.organizationId as OrgId))?.settings;
  if (!current) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  if (typeof b.timezone === 'string' && b.timezone.trim()) {
    patch.timezone = b.timezone.trim();
  }
  if (typeof b.currency === 'string' && /^[A-Za-z]{3}$/.test(b.currency.trim())) {
    patch.currency = b.currency.trim().toUpperCase();
  }
  if (typeof b.locale === 'string' && b.locale.trim()) {
    patch.locale = b.locale.trim();
  }
  if (typeof b.emailFirstSignin === 'boolean') {
    patch.emailFirstSignin = b.emailFirstSignin;
  }
  if (typeof b.requirePasskeyForNewStaff === 'boolean') {
    patch.requirePasskeyForNewStaff = b.requirePasskeyForNewStaff;
  }
  if (typeof b.maxConcurrentSessions === 'number' && Number.isInteger(b.maxConcurrentSessions) && b.maxConcurrentSessions >= 0) {
    patch.maxConcurrentSessions = b.maxConcurrentSessions;
  }
  if (typeof b.warrantyDays === 'number' && Number.isInteger(b.warrantyDays) && b.warrantyDays >= 1 && b.warrantyDays <= 3650) {
    patch.warrantyDays = b.warrantyDays;
  }
  if (b.packing != null && typeof b.packing === 'object' && !Array.isArray(b.packing)) {
    const mode = (b.packing as Record<string, unknown>).enforcement;
    patch.packing = {
      enforcement: mode === 'block_until_matched' ? 'block_until_matched' : 'advisory',
    };
  }
  if (b.brand != null && typeof b.brand === 'object' && !Array.isArray(b.brand)) {
    const brand = b.brand as Record<string, unknown>;
    const nextBrand: NonNullable<OrgSettings['brand']> = {};
    if (typeof brand.name === 'string' && brand.name.trim()) nextBrand.name = brand.name.trim();
    if (typeof brand.logoUrl === 'string' && brand.logoUrl.trim()) nextBrand.logoUrl = brand.logoUrl.trim();
    if (typeof brand.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor.trim())) {
      nextBrand.primaryColor = brand.primaryColor.trim();
    }
    // Empty / null clears the kiosk attract URL (upload route also writes here).
    if (brand.attractMediaUrl === null || brand.attractMediaUrl === '') {
      nextBrand.attractMediaUrl = '';
    } else if (typeof brand.attractMediaUrl === 'string' && brand.attractMediaUrl.trim()) {
      const raw = brand.attractMediaUrl.trim();
      try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          nextBrand.attractMediaUrl = parsed.toString();
        }
      } catch {
        /* skip invalid URL — leave unset so a bad paste doesn't wipe a good one */
      }
    }
    if (typeof brand.publicLandingUrl === 'string') {
      const raw = brand.publicLandingUrl.trim();
      if (!raw) {
        nextBrand.publicLandingUrl = '';
      } else {
        try {
          const parsed = new URL(raw);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            nextBrand.publicLandingUrl = parsed.toString();
          }
        } catch {
          /* skip invalid URL — leave unset so a bad paste doesn't wipe a good one */
        }
      }
    }
    patch.brand = nextBrand;
  }
  if (b.letterhead != null && typeof b.letterhead === 'object' && !Array.isArray(b.letterhead)) {
    const lh = b.letterhead as Record<string, unknown>;
    const nextLetterhead = { addressLine1: '', addressLine2: '', phone: '', email: '' };
    if (typeof lh.addressLine1 === 'string') nextLetterhead.addressLine1 = lh.addressLine1.trim().slice(0, 120);
    if (typeof lh.addressLine2 === 'string') nextLetterhead.addressLine2 = lh.addressLine2.trim().slice(0, 120);
    if (typeof lh.phone === 'string') nextLetterhead.phone = lh.phone.trim().slice(0, 40);
    if (typeof lh.email === 'string' && (lh.email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lh.email.trim()))) {
      nextLetterhead.email = lh.email.trim();
    }
    patch.letterhead = nextLetterhead;
  }
  /*
   * KIOSK behaviour. `idleTimeoutSeconds` is deliberately NOT accepted as an
   * input — idle and attract are off on the counter and nothing reads it, and
   * re-opening a write for a number nothing reads is how that leftover got
   * there — but it is CARRIED so a `defaultCommand` save does not drop it.
   */
  if (b.kiosk != null && typeof b.kiosk === 'object' && !Array.isArray(b.kiosk)) {
    const kiosk = b.kiosk as Record<string, unknown>;
    const nextKiosk = { ...(current.kiosk ?? {}) };
    let touched = false;
    if (isKioskCommandId(kiosk.defaultCommand)) {
      nextKiosk.defaultCommand = kiosk.defaultCommand;
      touched = true;
    }
    // Comp reason list: trimmed, de-duplicated, capped like the schema.
    if (Array.isArray(kiosk.compReasons)) {
      nextKiosk.compReasons = [
        ...new Set(
          (kiosk.compReasons as unknown[])
            .filter((r): r is string => typeof r === 'string')
            .map((r) => r.trim().slice(0, 60))
            .filter(Boolean),
        ),
      ].slice(0, 12);
      touched = true;
    }
    if (touched) patch.kiosk = nextKiosk;
  }

  /*
   * SHIP-FROM. Either empty (clears it — the env fallback applies) or complete
   * (line 1, city, state, ZIP): a half-filled origin would save and still fail
   * every rate with SHIP_FROM_NOT_CONFIGURED, so it is refused here instead.
   * The whole block is rebuilt (the shallow `||` merge replaces it anyway).
   */
  let shipFromChanged = false;
  if (b.shipFrom !== undefined) {
    const parsed = parseShipFromInput(b.shipFrom ?? {});
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: 'SHIP_FROM_INVALID' }, { status: 400 });
    }
    patch.shipFrom = parsed.value;
    shipFromChanged = JSON.stringify(current.shipFrom ?? null) !== JSON.stringify(parsed.value);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await updateOrgSettings(ctx.organizationId as OrgId, patch);
  const org = await getOrganization(ctx.organizationId as OrgId);

  // The origin every label is bought from — who changed it, and from what.
  if (shipFromChanged) {
    await recordAudit(pool, ctx, req, {
      source: 'api.admin.organization.profile',
      action: AUDIT_ACTION.SETTINGS_UPDATE,
      entityType: AUDIT_ENTITY.ORGANIZATION,
      entityId: String(ctx.organizationId),
      before: { shipFrom: current.shipFrom ?? null },
      after: { shipFrom: patch.shipFrom ?? null },
      extra: { field: 'shipFrom' },
    });
  }

  return NextResponse.json({ ok: true, ...profilePayload(org!.settings) });
}, { permission: 'admin.view' });
