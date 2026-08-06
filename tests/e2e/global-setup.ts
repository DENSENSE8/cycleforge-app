import { request as pwRequest, type APIRequestContext, type FullConfig } from '@playwright/test';
import path from 'path';
import { QA_ORG_SLUG } from '@/lib/tenancy/qa-org';
import fs from 'fs';

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const USAV_STORAGE = path.join(AUTH_DIR, 'admin.json');
const QA_STORAGE = path.join(AUTH_DIR, 'qa-admin.json');

const TENANT_HEADER = 'x-tenant-slug';

type StaffRow = { id: number; name: string };

async function probeSession(baseURL: string, storagePath: string): Promise<boolean> {
  if (!fs.existsSync(storagePath)) return false;
  try {
    const ctx = await pwRequest.newContext({ baseURL, storageState: storagePath });
    const probe = await ctx.get('/api/receiving-lines?view=recent&limit=1');
    await ctx.dispose();
    return probe.ok();
  } catch {
    return false;
  }
}

async function findStaffId(
  request: APIRequestContext,
  tenantSlug: string,
  staffName: string,
): Promise<number> {
  const picker = await request.get('/api/auth/staff-picker', {
    headers: { [TENANT_HEADER]: tenantSlug },
  });
  if (!picker.ok()) {
    throw new Error(`staff-picker failed for "${tenantSlug}": HTTP ${picker.status()}`);
  }
  const data = (await picker.json()) as { staff?: StaffRow[] };
  const exact = data.staff?.find((s) => s.name.toLowerCase() === staffName.toLowerCase());
  const partial = data.staff?.find((s) => s.name.toLowerCase().includes(staffName.toLowerCase()));
  const row = exact ?? partial;
  if (!row) {
    throw new Error(`Staff "${staffName}" not found in tenant "${tenantSlug}"`);
  }
  return row.id;
}

/** Pinless station sign-in — AUTH_PINLESS_SIGNIN + x-tenant-slug (local e2e default). */
async function signInPinless(
  baseURL: string,
  tenantSlug: string,
  staffName: string,
  storagePath: string,
  pin?: string,
): Promise<void> {
  const request = await pwRequest.newContext({ baseURL });
  try {
    const staffId = await findStaffId(request, tenantSlug, staffName);
    const body: Record<string, unknown> = { staffId, deviceKind: 'personal' };
    if (pin) body.pin = pin;
    const signin = await request.post('/api/auth/signin', {
      headers: { [TENANT_HEADER]: tenantSlug },
      data: body,
    });
    if (!signin.ok()) {
      const body = await signin.text();
      throw new Error(`POST /api/auth/signin failed (${signin.status()}): ${body}`);
    }
    await request.storageState({ path: storagePath });
  } finally {
    await request.dispose();
  }
}

/** SHARED-account org: owner email+password → act-as-staff (no PIN). */
async function signInOwnerActAs(
  baseURL: string,
  email: string,
  password: string,
  staffName: string,
  storagePath: string,
): Promise<void> {
  const request = await pwRequest.newContext({ baseURL });
  try {
    const account = await request.post('/api/auth/account/signin', {
      data: { email, password },
    });
    const data = (await account.json().catch(() => ({}))) as {
      ok?: boolean;
      needsOrgChoice?: boolean;
      needsStaffChoice?: boolean;
      memberships?: { organizationId: string; organizationName: string }[];
      staff?: StaffRow[];
      error?: string;
    };
    if (!account.ok()) {
      throw new Error(`account signin failed (${account.status()}): ${data.error ?? 'unknown'}`);
    }

    if (data.needsOrgChoice && data.memberships?.length) {
      const orgId = process.env.PW_ORG_ID?.trim() || data.memberships[0]!.organizationId;
      const retry = await request.post('/api/auth/account/signin', {
        data: { email, password, organizationId: orgId },
      });
      const retryData = (await retry.json().catch(() => ({}))) as typeof data;
      if (!retry.ok()) {
        throw new Error(`account signin (org pick) failed (${retry.status()}): ${retryData.error ?? 'unknown'}`);
      }
      Object.assign(data, retryData);
    }

    if (data.needsStaffChoice && data.staff?.length) {
      const staffId = await findStaffIdFromList(data.staff, staffName);
      const act = await request.post('/api/auth/act-as-staff', {
        data: { staffId, deviceKind: 'personal' },
      });
      if (!act.ok()) {
        const actBody = await act.text();
        throw new Error(`act-as-staff failed (${act.status()}): ${actBody}`);
      }
    } else if (!data.ok) {
      throw new Error('account signin returned neither ok nor needsStaffChoice');
    }

    await request.storageState({ path: storagePath });
  } finally {
    await request.dispose();
  }
}

function findStaffIdFromList(staff: StaffRow[], staffName: string): number {
  const exact = staff.find((s) => s.name.toLowerCase() === staffName.toLowerCase());
  const partial = staff.find((s) => s.name.toLowerCase().includes(staffName.toLowerCase()));
  const row = exact ?? partial;
  if (!row) throw new Error(`Staff "${staffName}" not in umbrella roster`);
  return row.id;
}

async function signInStaff(
  baseURL: string,
  staffName: string,
  tenantSlug: string,
  storagePath: string,
): Promise<void> {
  const ownerEmail = process.env.PW_OWNER_EMAIL?.trim();
  const ownerPassword = process.env.PW_OWNER_PASSWORD;
  if (ownerEmail && ownerPassword) {
    await signInOwnerActAs(baseURL, ownerEmail, ownerPassword, staffName, storagePath);
    return;
  }
  const pin = process.env.PW_STAFF_PIN?.trim();
  await signInPinless(baseURL, tenantSlug, staffName, storagePath, pin);
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  const usavStaff = process.env.PW_STAFF_NAME || 'Michael';
  const usavSlug = process.env.PW_TENANT_SLUG || 'usav';
  const qaStaff = process.env.PW_QA_STAFF_NAME || 'QA Admin';
  // Default to the slug the provisioner actually writes, not a guess. It was
  // `'qa'`, which never matched `provision:qa-org`'s `cycleforge-qa`, so the
  // QA session silently failed to mint on every run and qa-desktop skipped.
  const qaSlug = process.env.PW_QA_TENANT_SLUG || QA_ORG_SLUG;

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // USAV dogfood session (default Playwright projects) — best-effort, same as
  // the QA block below: an expired dogfood credential must not block a
  // qa-desktop run. On failure leave USAV_STORAGE as-is (do not clobber a valid
  // dogfood session with an empty one); only the default/desktop projects go
  // unauthenticated.
  if (!(await probeSession(baseURL, USAV_STORAGE))) {
    try {
      await signInStaff(baseURL, usavStaff, usavSlug, USAV_STORAGE);
    } catch (err) {
      console.warn(
        `[global-setup] USAV session not minted for "${usavStaff}" — default/desktop projects will be unauthenticated (qa-desktop is unaffected).`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // QA sandbox session (qa-desktop project) — best-effort; skip when org not provisioned
  if (!(await probeSession(baseURL, QA_STORAGE))) {
    try {
      const qaEmail =
        process.env.PW_QA_OWNER_EMAIL?.trim() || process.env.QA_ADMIN_EMAIL?.trim() || 'qa-admin@cycleforge.test';
      const qaPassword =
        process.env.PW_QA_OWNER_PASSWORD || process.env.QA_ADMIN_PASSWORD || 'CycleForge-QA-local!';
      // Prefer email+password into org …0002. Do NOT use PW_OWNER_EMAIL (dogfood) —
      // that account has no QA membership.
      try {
        await signInOwnerActAs(baseURL, qaEmail, qaPassword, qaStaff, QA_STORAGE);
      } catch (emailErr) {
        console.warn(
          `[global-setup] QA email sign-in failed — falling back to station PIN for "${qaStaff}".`,
          emailErr instanceof Error ? emailErr.message : emailErr,
        );
        await signInPinless(baseURL, qaSlug, qaStaff, QA_STORAGE, process.env.PW_QA_STAFF_PIN?.trim());
      }
    } catch (err) {
      console.warn(
        `[global-setup] QA session not minted for "${qaStaff}" — run pnpm provision:qa-org first.`,
        err instanceof Error ? err.message : err,
      );
      // Empty storage so qa-desktop projects don't fail on a missing file path.
      const empty = await pwRequest.newContext({ baseURL });
      try {
        await empty.storageState({ path: QA_STORAGE });
      } finally {
        await empty.dispose();
      }
    }
  }
}