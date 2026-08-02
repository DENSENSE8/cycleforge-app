import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization, updateOrgSettings } from '@/lib/tenancy/organizations';
import {
  DEFAULT_NAS_STORAGE_TARGETS,
  getComplianceAnswers,
  getGs1SettingsRaw,
  getPhotoAnalysisSettings,
  type OrgSettings,
} from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';
import { syncAgentRootsFromSettings } from '@/lib/nas-agent-client';
import { normalizeProvider } from '@/lib/photos/analyze-provider';
import {
  isLicensedGln,
  isPlaceholderGs1Prefix,
  resolveGs1Requirement,
} from '@/lib/interop/gs1-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Org-level settings the admin UI edits, managed by StationNasFoldersTab:
 *   • stationNasPhotoFolders — per-station default folder for the photo picker.
 *   • nasPhotoServers        — the test/prod NAS base URLs + which is active.
 *   • nasStorageTargets      — workflow roots/folders for receiving, labels,
 *                              and claim archives.
 * Reads/writes go through the tenancy helpers so the in-process org cache stays
 * consistent. PATCH merges only the keys present in the body.
 *
 * Also carries the GS1 identity + compliance answers (added 2026-08-02) — see
 * docs/todo/gs1-compliance-onboarding-PLAN.md. Those two blocks existed in
 * `OrgSettingsSchema` and were read by the interop projections and the print
 * ladder, but nothing in the product ever WROTE them; this route is that gap.
 *
 * GET   → { stationNasPhotoFolders, nasPhotoServers, nasStorageTargets,
 *           photoAnalysis, gs1, compliance, gs1Requirement }
 * PATCH → body may contain any subset of keys; merged into jsonb settings.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const org = await getOrganization(ctx.organizationId as OrgId);
  const photoAnalysis = org
    ? getPhotoAnalysisSettings(org.settings)
    : { localVisionBaseUrl: '' };
  // RAW on purpose: the admin editing this field must see the digits they typed,
  // including a value the resolver would drop. `gs1Requirement` beside it is the
  // resolved verdict, so the UI can say "we are not using this" without the form
  // silently blanking the input.
  const gs1 = org
    ? getGs1SettingsRaw(org.settings)
    : { companyPrefix: '', gln: '', cbvUriForm: 'urn' as const };
  const compliance = org
    ? getComplianceAnswers(org.settings)
    : { hasNewInventory: null, sellsOnAmazon: null, gs1Status: null, answeredAt: null };
  return NextResponse.json({
    stationNasPhotoFolders: org?.settings.stationNasPhotoFolders ?? {},
    nasPhotoServers: org?.settings.nasPhotoServers ?? { test: '', prod: '', active: 'prod' },
    nasStorageTargets: org?.settings.nasStorageTargets ?? DEFAULT_NAS_STORAGE_TARGETS,
    photoAnalysis: {
      // null provider/enabled means "inherit the deployment default" — the UI shows
      // that as the local-first default until the org explicitly picks.
      provider: photoAnalysis.provider ?? null,
      enabled: photoAnalysis.enabled ?? null,
      localVisionBaseUrl: photoAnalysis.localVisionBaseUrl ?? '',
    },
    gs1,
    compliance,
    gs1Requirement: resolveGs1Requirement(compliance, {
      companyPrefix: gs1.companyPrefix,
      gln: gs1.gln,
    }),
  });
}, { permission: 'admin.view' });

// A NAS base URL must be http(s) (the browser PUTs to it cross-origin) or the
// same-origin dev proxy path "/api/nas-dev". Empty is allowed (slot not set).
function cleanNasUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim().replace(/\/+$/, '');
  if (!v) return '';
  if (v.startsWith('/')) return v; // dev proxy, e.g. /api/nas-dev
  return /^https?:\/\//i.test(v) ? v : '';
}

function cleanRootPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

function cleanRelativeFolder(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  // ── stationNasPhotoFolders ──────────────────────────────────────────────
  if ('stationNasPhotoFolders' in body) {
    const raw = (body as Record<string, unknown>).stationNasPhotoFolders;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'stationNasPhotoFolders must be an object of { station: folderPath }' },
        { status: 400 },
      );
    }
    // Coerce to a clean Record<string,string>: trim values, drop non-string /
    // empty entries so cleared stations don't linger as "".
    const clean: Record<string, string> = {};
    for (const [station, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const folder = value.trim().replace(/^\/+|\/+$/g, '');
      if (folder) clean[station.toUpperCase()] = folder;
    }
    patch.stationNasPhotoFolders = clean;
  }

  // ── nasPhotoServers (test/prod URLs + active slot) ──────────────────────
  if ('nasPhotoServers' in body) {
    const raw = (body as Record<string, unknown>).nasPhotoServers;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'nasPhotoServers must be an object of { test, prod, active }' },
        { status: 400 },
      );
    }
    const r = raw as Record<string, unknown>;
    const active = r.active === 'test' ? 'test' : 'prod';
    patch.nasPhotoServers = {
      test: cleanNasUrl(r.test),
      prod: cleanNasUrl(r.prod),
      active,
    };
  }

  // ── nasStorageTargets (workflow roots + active folders) ─────────────────
  if ('nasStorageTargets' in body) {
    const raw = (body as Record<string, unknown>).nasStorageTargets;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'nasStorageTargets must be an object of { receiving, shipping, claims }' },
        { status: 400 },
      );
    }
    const r = raw as Record<string, unknown>;
    const cleanTarget = (key: 'receiving' | 'shipping' | 'claims') => {
      const current = r[key];
      const obj = current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
      return {
        root: cleanRootPath(obj.root),
        folder: cleanRelativeFolder(obj.folder),
      };
    };
    patch.nasStorageTargets = {
      receiving: cleanTarget('receiving'),
      shipping: cleanTarget('shipping'),
      claims: cleanTarget('claims'),
    };
  }

  // ── photoAnalysis (per-org AI-analysis engine choice) ───────────────────
  if ('photoAnalysis' in body) {
    const raw = (body as Record<string, unknown>).photoAnalysis;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'photoAnalysis must be an object of { provider, enabled, localVisionBaseUrl }' },
        { status: 400 },
      );
    }
    const r = raw as Record<string, unknown>;
    // jsonb `||` replaces the whole photoAnalysis key, so merge over the CURRENT
    // value — a partial patch (e.g. just the URL) must not clobber provider/enabled.
    const currentOrg = await getOrganization(ctx.organizationId as OrgId);
    const current = currentOrg ? getPhotoAnalysisSettings(currentOrg.settings) : { localVisionBaseUrl: '' };
    const next: Record<string, unknown> = {
      ...(current.provider ? { provider: current.provider } : {}),
      ...(typeof current.enabled === 'boolean' ? { enabled: current.enabled } : {}),
      localVisionBaseUrl: current.localVisionBaseUrl ?? '',
    };

    if ('provider' in r) {
      if (r.provider === null) {
        delete next.provider; // clear → inherit deployment default
      } else {
        const provider = normalizeProvider(typeof r.provider === 'string' ? r.provider : null);
        if (!provider) {
          return NextResponse.json(
            { error: 'provider must be one of local-vision | hermes | gcp-vision | catalog' },
            { status: 400 },
          );
        }
        next.provider = provider;
      }
    }

    if ('enabled' in r) {
      if (r.enabled !== null && typeof r.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled must be a boolean or null' }, { status: 400 });
      }
      if (r.enabled === null) delete next.enabled;
      else next.enabled = r.enabled;
    }

    if ('localVisionBaseUrl' in r) {
      // Server-reachable tunnel URL the cron uses; must be http(s) or empty.
      next.localVisionBaseUrl = cleanNasUrl(r.localVisionBaseUrl);
    }

    patch.photoAnalysis = next;
  }

  // ── gs1 (the tenant's licensed identity) ────────────────────────────────
  //
  // Validated through the SAME refusal the rest of the app gates minting on —
  // `isPlaceholderGs1Prefix` / `isLicensedGln` — rather than a second validator
  // here. A borrowed prefix or a bad check digit must be rejected at the point
  // an admin types it, not silently accepted and then dropped by
  // `resolveGs1Identity` at read time, which would show a saved value the
  // product never uses. Empty string is always allowed: it means "we hold none",
  // which is the honest answer for almost every reseller.
  if ('gs1' in body) {
    const raw = (body as Record<string, unknown>).gs1;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json(
        { error: 'gs1 must be an object of { companyPrefix, gln, cbvUriForm }' },
        { status: 400 },
      );
    }
    const r = raw as Record<string, unknown>;
    const currentOrg = await getOrganization(ctx.organizationId as OrgId);
    const current = currentOrg
      ? getGs1SettingsRaw(currentOrg.settings)
      : { companyPrefix: '', gln: '', cbvUriForm: 'urn' as const };
    const next = { ...current };

    if ('companyPrefix' in r) {
      const digits = String(r.companyPrefix ?? '').replace(/\D/g, '');
      if (digits && (digits.length < 6 || digits.length > 12)) {
        return NextResponse.json(
          { error: 'companyPrefix must be 6-12 digits (GS1 Company Prefix)' },
          { status: 400 },
        );
      }
      if (digits && isPlaceholderGs1Prefix(digits)) {
        return NextResponse.json(
          {
            error:
              'That is a GS1 documentation/example prefix, not a licensed one — the digits belong to another company.',
          },
          { status: 400 },
        );
      }
      next.companyPrefix = digits;
    }

    if ('gln' in r) {
      const digits = String(r.gln ?? '').replace(/\D/g, '');
      if (digits && !isLicensedGln(digits)) {
        return NextResponse.json(
          {
            error:
              'A GLN must be 13 digits with a valid GS1 check digit, and must not use an example prefix.',
          },
          { status: 400 },
        );
      }
      next.gln = digits;
    }

    if ('cbvUriForm' in r) {
      if (r.cbvUriForm !== 'urn' && r.cbvUriForm !== 'webUri') {
        return NextResponse.json(
          { error: 'cbvUriForm must be "urn" or "webUri"' },
          { status: 400 },
        );
      }
      next.cbvUriForm = r.cbvUriForm;
    }

    patch.gs1 = next;
  }

  // ── compliance (the two onboarding answers) ─────────────────────────────
  //
  // `answeredAt` is stamped SERVER-side and never read from the body: it is what
  // the onboarding step derives completion from, so a client-supplied value is a
  // completion claim the client does not get to make. Fields stay nullable —
  // "has not answered" and "answered no" must not collapse.
  if ('compliance' in body) {
    const raw = (body as Record<string, unknown>).compliance;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json(
        {
          error:
            'compliance must be an object of { hasNewInventory, sellsOnAmazon, gs1Status }',
        },
        { status: 400 },
      );
    }
    const r = raw as Record<string, unknown>;
    const currentOrg = await getOrganization(ctx.organizationId as OrgId);
    const next = currentOrg
      ? getComplianceAnswers(currentOrg.settings)
      : { hasNewInventory: null, sellsOnAmazon: null, gs1Status: null, answeredAt: null };

    for (const key of ['hasNewInventory', 'sellsOnAmazon'] as const) {
      if (!(key in r)) continue;
      if (r[key] !== null && typeof r[key] !== 'boolean') {
        return NextResponse.json(
          { error: `${key} must be a boolean or null` },
          { status: 400 },
        );
      }
      next[key] = r[key] as boolean | null;
    }

    if ('gs1Status' in r) {
      const v = r.gs1Status;
      if (v !== null && !['prefix', 'per-item', 'exempt', 'none'].includes(String(v))) {
        return NextResponse.json(
          { error: 'gs1Status must be prefix | per-item | exempt | none | null' },
          { status: 400 },
        );
      }
      next.gs1Status = v as typeof next.gs1Status;
    }

    // Answered = BOTH questions have an explicit boolean. Stamped once and left
    // alone afterwards so re-editing the answers later does not look like a
    // fresh completion.
    const answered =
      typeof next.hasNewInventory === 'boolean' && typeof next.sellsOnAmazon === 'boolean';
    next.answeredAt = answered ? next.answeredAt || new Date().toISOString() : null;

    patch.compliance = next;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        error:
          'Provide stationNasPhotoFolders, nasPhotoServers, nasStorageTargets, photoAnalysis, gs1, and/or compliance',
      },
      { status: 400 },
    );
  }

  await updateOrgSettings(ctx.organizationId as OrgId, patch as Partial<OrgSettings>);

  let agentSync: { ok: boolean; error?: string } | undefined;
  if ('nasStorageTargets' in patch) {
    const org = await getOrganization(ctx.organizationId as OrgId);
    if (org) {
      agentSync = await syncAgentRootsFromSettings(org.settings, ctx.organizationId as OrgId);
    }
  }

  return NextResponse.json({ ok: true, ...patch, ...(agentSync ? { agentSync } : {}) });
}, { permission: 'admin.view' });
