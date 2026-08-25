'use client';

/**
 * /signin — unified SMB login.
 *
 * Primary flow is **email + password** (POST /api/auth/account/signin) — the
 * cross-workspace owner/staff entry point. Secondary: magic sign-in link,
 * account passkey, and (collapsed) a shared-station PIN flow that reuses the
 * StaffPickerList + StaffPinPad bricks.
 *
 * Apex vs workspace: on load we fetch the workspace NAME only
 * (GET /api/auth/workspace) — never the staff list. Station (PIN) mode is only
 * offered once a workspace is resolved; on the apex host we point the user at
 * their workspace URL instead of leaking any tenant's staff.
 *
 * We deliberately do NOT call GET /api/auth/staff-picker on initial load — the
 * picker mounts (and self-fetches) only when the user opens station mode.
 *
 * DISPLAY CONTRACT — this page looks like the product, not a marketing splash.
 * One calm canvas, one card, house tokens only. The only foreign brand color on
 * the page lives inside ProviderSignInButton, where Google/Microsoft require it.
 * Three tiers, in scan order: federated identity → email+password → everything
 * else behind a disclosure, with the method you used last promoted out of it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

/**
 * WebAuthn, the QR dialog's renderer and the whole shared-station (PIN) tree are
 * loaded ON DEMAND, not with the page.
 *
 * This is the app's one public route and the only one measured on the mobile
 * profile, so everything in its initial bundle is paid for by every signed-out
 * visitor on a phone. None of these is on the primary path — the primary path is
 * email + password. `@simplewebauthn/browser` runs only when someone picks a
 * passkey, `react-qr-code` only inside a dialog that has to be opened, and the
 * PIN bricks only after station mode is disclosed.
 */
type StartAuthentication = typeof import('@simplewebauthn/browser')['startAuthentication'];
const startAuthentication: StartAuthentication = async (...args) => {
  const mod = await import('@simplewebauthn/browser');
  return mod.startAuthentication(...args);
};
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from '@/design-system/motion';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { SignInAuthStepPanels } from '@/components/auth/SignInAuthStepPanels';
const QRCode = dynamic(() => import('react-qr-code'), {
  ssr: false,
  loading: () => <div className="h-[196px] w-[196px] animate-pulse rounded-lg bg-surface-sunken" />,
});
import type { StaffPickerRow } from '@/components/auth/StaffPickerList';
const StaffPickerList = dynamic(
  () => import('@/components/auth/StaffPickerList').then((m) => m.StaffPickerList),
  { ssr: false },
);
const StaffPinPad = dynamic(
  () => import('@/components/auth/StaffPinPad').then((m) => m.StaffPinPad),
  { ssr: false },
);
const StaffSigningIn = dynamic(
  () => import('@/components/auth/StaffSigningIn').then((m) => m.StaffSigningIn),
  { ssr: false },
);
const SetPinPad = dynamic(
  () => import('@/components/auth/SetPinPad').then((m) => m.SetPinPad),
  { ssr: false },
);
import { BootSplash } from '@/components/boot/BootSplash';
import { armBootSplash } from '@/lib/boot-flag';
import { Button, Checkbox, Panel } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import { LastUsedMarker, ProviderSignInButton } from '@/components/auth/ProviderSignInButton';
import type { PlatformProvider } from '@/lib/auth/platform-oauth-types';
import {
  readLastSigninEmail,
  readLastSigninMethod,
  readRecentSignins,
  writeLastSigninEmail,
  writeLastSigninMethod,
  writeRecentSignin,
  type SigninMethod,
} from '@/lib/auth/recent-signins';

const ROLE_HOME: Record<string, string> = {
  admin: '/',
  receiver: '/receiving',
  receiving: '/receiving',
  packer: '/pack',
  technician: '/test',
  shipper: '/',
  inventory_manager: '/',
  sales: '/',
  viewer: '/',
  readonly: '/',
};

const MOBILE_ROLE_HOME: Record<string, string> = {
  receiver: '/m/receiving',
  receiving: '/m/receiving',
  packer: '/m/pick',
};

/** Up-to-two-letter avatar initials from a staff name ("Riley Receiver" → "RR"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function humanError(code: string | undefined): string {
  switch (code) {
    case 'WRONG':              return 'PIN incorrect. Try again.';
    case 'NO_PIN':             return 'This account has no PIN. Ask an admin for an enrollment QR.';
    case 'NOT_FOUND':          return 'Account not found.';
    case 'TOO_SHORT':          return 'PIN is too short.';
    case 'TOO_LONG':           return 'PIN is too long.';
    case 'NOT_NUMERIC':        return 'PIN must be digits only.';
    case 'ACCOUNT_NOT_ACTIVE': return 'Account is not active. Ask an admin.';
    case 'VERIFY_FAILED':      return 'Passkey verification failed.';
    case 'WEAK_PIN':           return 'Pick something less obvious — no 0000, 1111, 1234, etc.';
    case 'PIN_ALREADY_SET':    return 'This account already has a PIN. Tap "Not you?" and pick again.';
    case 'INVALID_CREDENTIALS':return 'Email or password is incorrect.';
    case 'NO_WORKSPACE':       return 'This account isn’t a member of any workspace yet.';
    case 'RATE_LIMITED':       return 'Too many attempts. Wait a minute and try again.';
    case 'TENANT_REQUIRED':    return 'Open your workspace URL to sign in.';
    default:                   return 'Sign-in failed. Try again.';
  }
}

/** Human text for the ?*_error= query codes the SSO / magic-link flows redirect with. */
function queryErrorText(kind: 'sso' | 'login' | 'verify', code: string): string {
  if (kind === 'verify') return 'We couldn’t verify that link. Request a new one.';
  if (kind === 'login') {
    if (code === 'expired') return 'That sign-in link expired. Request a new one.';
    if (code === 'rate_limited') return 'Too many attempts. Wait a minute and try again.';
    return 'That sign-in link is invalid or has been used.';
  }
  // sso
  if (code === 'RATE_LIMITED') return 'Too many attempts. Wait a minute and try again.';
  if (code === 'TENANT_REQUIRED') return 'Open your workspace URL to use single sign-on.';
  return 'Single sign-on failed. Try again or use your password.';
}

interface StaffChoiceRow {
  id: number;
  name: string;
  role: string | null;
  color_hex: string | null;
  has_pin: boolean;
}

interface WorkspaceMeta {
  resolved: boolean;
  name?: string;
  slug?: string;
  platformProviders?: PlatformProvider[];
  sso?: { label: string; slug: string } | null;
  /** When true, the org forces email-first login — hide the shared-station PIN entry. */
  emailFirstSignin?: boolean;
}

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '';

  // ── Workspace (name only) ─────────────────────────────────────────────────
  const [workspace, setWorkspace] = useState<WorkspaceMeta | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/auth/workspace', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { resolved: false }))
      .then((data) => { if (alive) setWorkspace(data as WorkspaceMeta); })
      .catch(() => { if (alive) setWorkspace({ resolved: false }); });
    return () => { alive = false; };
  }, []);

  // ── Account (email + password) ────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Apple-style flow: email step → password step. One animated panel swaps at a
  // time (chip + password travel together); see SignInAuthStepPanels.
  const [authStep, setAuthStep] = useState<'email' | 'password'>('email');
  const alternatePresence = useMotionPresence(framerPresence.signInAlternateSection);
  const alternateTransition = useMotionTransition(framerTransition.signInAlternateFade);
  const messagePresence = useMotionPresence(framerPresence.statusMessage);
  const messageTransition = useMotionTransition(framerTransition.dropdownOpen);
  // Default checked — personal devices are the common SMB case; station mode
  // (shared) has its own uncheck-on-shared affordance below.
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orgChoices, setOrgChoices] = useState<{ organizationId: string; organizationName: string }[] | null>(null);
  const [chosenOrg, setChosenOrg] = useState<string | null>(null);
  // DOGFOOD / QA: staff roster returned after an owner login to a testing org.
  const [staffChoices, setStaffChoices] = useState<StaffChoiceRow[] | null>(null);
  const [staffChoiceOrg, setStaffChoiceOrg] = useState<string | null>(null);
  // Shared-computer UX: the same few people keep tapping the same names, so the
  // last-3 they used float to the top; the rest collapse behind a "More" button.
  const [showAllStaff, setShowAllStaff] = useState(false);
  // Which method worked here last — promotes exactly one option out of the drawer.
  const [lastMethod, setLastMethod] = useState<SigninMethod | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Surface the redirect error codes from SSO / magic-link / verify flows.
  useEffect(() => {
    const sso = params.get('sso_error');
    const login = params.get('login_error');
    const verify = params.get('verify_error');
    if (sso) setError(queryErrorText('sso', sso));
    else if (login) setError(queryErrorText('login', login));
    else if (verify) setError(queryErrorText('verify', verify));
  }, [params]);

  // ── Station (shared PIN) mode ─────────────────────────────────────────────
  const [stationOpen, setStationOpen] = useState(false);
  const [picked, setPicked] = useState<StaffPickerRow | null>(null);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const [recentReady, setRecentReady] = useState(false);
  const [pinless, setPinless] = useState(false);
  const [showPhoneQr, setShowPhoneQr] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => { setRecent(readRecentSignins()); setRecentReady(true); }, []);
  useEffect(() => { setLastMethod(readLastSigninMethod()); }, []);

  // Prefill the last email used on this device (only when the field is untouched).
  useEffect(() => {
    const last = readLastSigninEmail();
    if (last) setEmail((cur) => (cur ? cur : last));
  }, []);

  const finish = useCallback((
    staffId: number | null,
    role: string | null | undefined,
    defaultHomePath: string | null | undefined,
    defaultHomePathMobile: string | null | undefined,
  ) => {
    flushSync(() => setSigningIn(true));
    if (staffId != null) writeRecentSignin(staffId);
    const onMobile = isMobileDevice();
    const normalizedRole = role ? role.toLowerCase() : '';
    const roleHome = normalizedRole
      ? onMobile
        ? MOBILE_ROLE_HOME[normalizedRole] ?? '/m/home'
        : ROLE_HOME[normalizedRole]
      : null;
    const fallback = onMobile ? '/m/home' : '/';
    const override = onMobile ? defaultHomePathMobile : defaultHomePath;
    const target = next || override || roleHome || fallback;
    if (target.startsWith('/dashboard')) armBootSplash();
    if (typeof window !== 'undefined') window.location.assign(target);
    else router.replace(target);
  }, [router, next]);

  // ── Account submit ────────────────────────────────────────────────────────
  const submitAccount = useCallback(async (orgId?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch('/api/auth/account/signin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, ...(orgId ? { organizationId: orgId } : {}) }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        organizationId?: string;
        needsOrgChoice?: boolean;
        memberships?: { organizationId: string; organizationName: string }[];
        needsStaffChoice?: boolean;
        organizationName?: string;
        staff?: StaffChoiceRow[];
        error?: string;
      };
      if (!r.ok) {
        setError(humanError(data.error));
        return;
      }
      // Credentials accepted — remember email + method for next time on this device.
      writeLastSigninEmail(email);
      writeLastSigninMethod('password');
      if (data.needsOrgChoice && data.memberships) {
        setOrgChoices(data.memberships);
        setChosenOrg(data.memberships[0]?.organizationId ?? null);
        return;
      }
      // Testing org: owner session is already set; pick a staff to act as.
      if (data.needsStaffChoice && data.staff) {
        setStaffChoices(data.staff);
        setStaffChoiceOrg(data.organizationName ?? null);
        return;
      }
      finish(null, null, null, null);
    } catch {
      setError('Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }, [email, password, finish]);

  // Advance email → password (the forward swipe). Validates presence only; the
  // real credential check happens on the password submit.
  const advanceToPassword = useCallback(() => {
    if (!email.trim()) { setError('Enter your email to continue.'); return; }
    setError(null);
    setNotice(null);
    setAuthStep('password');
  }, [email]);

  const submitMagicLink = useCallback(async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/auth/email-login/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      writeLastSigninMethod('magic-link');
      setNotice('If that email is registered, we’ve sent a one-time sign-in link. Check your inbox.');
    } catch {
      setNotice('If that email is registered, we’ve sent a one-time sign-in link. Check your inbox.');
    } finally {
      setBusy(false);
    }
  }, [email]);

  const submitAccountPasskey = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const beginRes = await fetch('/api/auth/account/passkey/authenticate/begin', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!beginRes.ok) throw new Error('Passkey sign-in isn’t available.');
      const begin = await beginRes.json() as { options: Parameters<typeof startAuthentication>[0]['optionsJSON'] };
      const assertion = await startAuthentication({ optionsJSON: begin.options });
      const finishRes = await fetch('/api/auth/account/passkey/authenticate/finish', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      if (!finishRes.ok) {
        const data = await finishRes.json().catch(() => ({}));
        throw new Error(humanError((data as { error?: string }).error));
      }
      writeLastSigninMethod('passkey');
      finish(null, null, null, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Passkey sign-in failed.');
    } finally {
      setBusy(false);
    }
  }, [finish]);

  // Redirect flows record on *attempt* — we navigate away before the outcome is
  // known, and this is only ever a display hint on the next visit.
  const startProvider = useCallback((p: PlatformProvider) => {
    writeLastSigninMethod(p);
    const qs = next ? `?next=${encodeURIComponent(next)}` : '';
    window.location.href = `/api/auth/oauth/${p}/start${qs}`;
  }, [next]);

  const startSso = useCallback((slug: string) => {
    writeLastSigninMethod('sso');
    const qs = new URLSearchParams({ slug });
    if (next) qs.set('next', next);
    window.location.href = `/api/auth/sso/start?${qs.toString()}`;
  }, [next]);

  // ── Station PIN handlers (reused bricks) ──────────────────────────────────
  const submitPin = useCallback(async (pin: string) => {
    if (!picked) return { ok: false as const, error: 'INTERNAL' };
    const r = await fetch('/api/auth/signin', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staffId: picked.id, pin, deviceKind: rememberMe ? 'personal' : 'station' }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return { ok: false as const, error: humanError((data as { error?: string }).error) };
    }
    const data = await r.json().catch(() => ({}));
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(picked.id, picked.role, d.defaultHomePath, d.defaultHomePathMobile);
    return { ok: true as const };
  }, [picked, finish, rememberMe]);

  const submitPinless = useCallback(async (row: StaffPickerRow) => {
    const r = await fetch('/api/auth/signin', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staffId: row.id, deviceKind: rememberMe ? 'personal' : 'station' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setPickerMessage(humanError((data as { error?: string }).error));
      setPicked(null);
      return;
    }
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(row.id, row.role, d.defaultHomePath, d.defaultHomePathMobile);
  }, [finish, rememberMe]);

  // DOGFOOD / QA — pick a staff to act as (no PIN); owner session already set.
  const actAsStaff = useCallback(async (row: StaffChoiceRow) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/act-as-staff', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: row.id, deviceKind: rememberMe ? 'personal' : 'station' }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string; role?: string | null; defaultHomePath?: string | null; defaultHomePathMobile?: string | null;
      };
      if (!r.ok) {
        setError(humanError(data.error));
        setBusy(false);
        return;
      }
      finish(row.id, row.role ?? data.role, data.defaultHomePath, data.defaultHomePathMobile);
    } catch {
      setError('Sign-in failed. Try again.');
      setBusy(false);
    }
  }, [rememberMe, finish]);

  const handlePick = useCallback((row: StaffPickerRow) => {
    setPicked(row);
    if (pinless) void submitPinless(row);
  }, [pinless, submitPinless]);

  const handlePolicy = useCallback((p: { pinless: boolean }) => setPinless(p.pinless), []);

  const submitCreatePin = useCallback(async (pin: string) => {
    if (!picked) return { ok: false as const, error: 'INTERNAL' };
    const r = await fetch('/api/auth/pin/create', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staffId: picked.id, pin, deviceKind: rememberMe ? 'personal' : 'station' }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return { ok: false as const, error: humanError((data as { error?: string }).error) };
    }
    const data = await r.json().catch(() => ({}));
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(picked.id, picked.role, d.defaultHomePath, d.defaultHomePathMobile);
    return { ok: true as const };
  }, [picked, finish, rememberMe]);

  const submitStationPasskey = useCallback(async () => {
    if (!picked) return;
    const beginRes = await fetch('/api/auth/passkey/authenticate/begin', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staffId: picked.id }),
    });
    if (!beginRes.ok) throw new Error('Passkey not available.');
    const begin = await beginRes.json() as { options: Parameters<typeof startAuthentication>[0]['optionsJSON'] };
    const assertion = await startAuthentication({ optionsJSON: begin.options });
    const finishRes = await fetch('/api/auth/passkey/authenticate/finish', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response: assertion, deviceKind: 'personal' }),
    });
    if (!finishRes.ok) {
      const data = await finishRes.json().catch(() => ({}));
      throw new Error(humanError((data as { error?: string }).error));
    }
    const data = await finishRes.json().catch(() => ({}));
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(picked.id, picked.role, d.defaultHomePath, d.defaultHomePathMobile);
  }, [picked, finish]);

  const workspaceName = useMemo(
    () => (workspace?.resolved ? workspace.name ?? null : null),
    [workspace],
  );

  // Split the staff roster into recent (last-3 used on this device, in that
  // order) and everyone else. Recent surfaces first for one-tap re-entry.
  const { recentStaff, otherStaff } = useMemo(() => {
    const rows = staffChoices ?? [];
    const byId = new Map(rows.map((s) => [s.id, s] as const));
    const recents: StaffChoiceRow[] = [];
    for (const id of recent) {
      const hit = byId.get(id);
      if (hit) { recents.push(hit); byId.delete(id); }
    }
    return { recentStaff: recents, otherStaff: Array.from(byId.values()) };
  }, [staffChoices, recent]);

  // ── Tier 3: everything that isn't federated identity or email+password ─────
  const extraOptions = useMemo(() => {
    const opts: { key: string; label: string; method?: SigninMethod; onSelect: () => void }[] = [
      { key: 'magic-link', label: 'Email me a sign-in link', method: 'magic-link', onSelect: () => void submitMagicLink() },
      { key: 'passkey', label: 'Sign in with a passkey', method: 'passkey', onSelect: () => void submitAccountPasskey() },
      { key: 'phone', label: 'Use your phone to sign in', onSelect: () => setShowPhoneQr(true) },
    ];
    // Shared-station PIN entry — hidden when the org forces email-first login.
    if (!workspace?.emailFirstSignin) {
      opts.push({ key: 'station', label: 'Sign in on a shared station', onSelect: () => setStationOpen(true) });
    }
    return opts;
  }, [submitMagicLink, submitAccountPasskey, workspace?.emailFirstSignin]);

  // Exactly one option gets lifted out of the drawer — the one that worked here last.
  const promotedOption = useMemo(
    () => extraOptions.find((o) => o.method != null && o.method === lastMethod) ?? null,
    [extraOptions, lastMethod],
  );
  const drawerOptions = useMemo(
    () => extraOptions.filter((o) => o !== promotedOption),
    [extraOptions, promotedOption],
  );

  const providers = workspace?.platformProviders ?? [];
  const sso = workspace?.sso ?? null;
  const hasFederated = providers.length > 0 || sso != null;

  if (signingIn) return <BootSplash />;

  // ── Station mode (picked → PIN pad) ───────────────────────────────────────
  if (stationOpen && picked) {
    return (
      <Shell>
        {pinless ? (
          <StaffSigningIn staff={picked} />
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-5">
            {picked.has_pin ? (
              <StaffPinPad staff={picked} onSubmit={submitPin} onPasskey={submitStationPasskey} onBack={() => setPicked(null)} />
            ) : (
              <SetPinPad staff={picked} onSubmit={submitCreatePin} onBack={() => setPicked(null)} />
            )}
            <RememberMeField id="remember-station" checked={rememberMe} onChange={setRememberMe} />
          </div>
        )}
        <PhoneSigninQrDialog open={showPhoneQr} onClose={() => setShowPhoneQr(false)} />
      </Shell>
    );
  }

  // ── Station mode (roster) — its own view, not a drawer inside the form ────
  if (stationOpen) {
    return (
      <Shell>
        <AuthCard>
          <AuthHeader
            title="Shared station"
            subtitle={workspace?.resolved ? 'Pick your name to continue.' : undefined}
          />
          {workspace?.resolved ? (
            <div className="space-y-3">
              <StaffPickerList
                recent={recent}
                recentReady={recentReady}
                onPick={handlePick}
                onMessage={setPickerMessage}
                onPolicy={handlePolicy}
              />
              {pickerMessage && <StatusBox tone="danger">{pickerMessage}</StatusBox>}
            </div>
          ) : (
            <div className="inset-empty rounded-xl border border-dashed border-border-soft bg-surface-canvas text-role-caption text-text-soft">
              Station sign-in happens on your workspace URL. Open{' '}
              <span className="font-semibold text-text-default">yourteam.app.cycleforge.ai</span> to pick
              your name and enter a PIN.
            </div>
          )}
          <TextLink onClick={() => { setStationOpen(false); setPicked(null); setPickerMessage(null); }}>
            Back to sign in
          </TextLink>
        </AuthCard>
        <PhoneSigninQrDialog open={showPhoneQr} onClose={() => setShowPhoneQr(false)} />
      </Shell>
    );
  }

  // ── Staff picker (SHARED-account workspace — sign in as any staff, no PIN) ──
  if (staffChoices) {
    return (
      <Shell>
        <AuthCard>
          <AuthHeader
            eyebrow={staffChoiceOrg ?? undefined}
            title="Sign in as a staff member"
            subtitle="Tap your name to start."
          />

          {staffChoices.length === 0 ? (
            <div className="inset-empty rounded-xl border border-dashed border-border-soft bg-surface-canvas text-center text-role-caption text-text-soft">
              No staff members yet. Add your team in Settings, then come back to pick a name.
            </div>
          ) : (
            <div className="-mr-1 max-h-[22rem] space-y-4 overflow-y-auto pr-1">
              {recentStaff.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-role-micro uppercase text-text-soft">Recent</p>
                  {recentStaff.map((s) => (
                    <StaffChoiceRowButton key={s.id} staff={s} disabled={busy} onPick={actAsStaff} isRecent />
                  ))}
                </div>
              )}

              {(recentStaff.length === 0 || showAllStaff) && otherStaff.length > 0 && (
                <div className="space-y-1.5">
                  {recentStaff.length > 0 && (
                    <p className="px-1 text-role-micro uppercase text-text-soft">All staff</p>
                  )}
                  {otherStaff.map((s) => (
                    <StaffChoiceRowButton key={s.id} staff={s} disabled={busy} onPick={actAsStaff} />
                  ))}
                </div>
              )}

              {recentStaff.length > 0 && !showAllStaff && otherStaff.length > 0 && (
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowAllStaff(true)}>
                  Show {otherStaff.length} more
                </Button>
              )}
            </div>
          )}

          <TextLink onClick={() => { setStaffChoices(null); setError(null); }}>Use a different login</TextLink>
          {error && <StatusBox tone="danger">{error}</StatusBox>}
        </AuthCard>
      </Shell>
    );
  }

  // ── Workspace picker (multi-org account) ──────────────────────────────────
  if (orgChoices) {
    return (
      <Shell>
        <AuthCard>
          <AuthHeader title="Choose a workspace" subtitle="You’re a member of more than one." />
          <div className="divide-y divide-border-hairline overflow-hidden rounded-xl border border-border-soft">
            {orgChoices.map((m) => (
              <label
                key={m.organizationId}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-role-body',
                  chosenOrg === m.organizationId
                    ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                    : 'hover:bg-surface-canvas',
                )}
              >
                <input
                  type="radio"
                  name="org"
                  className="sr-only"
                  checked={chosenOrg === m.organizationId}
                  onChange={() => setChosenOrg(m.organizationId)}
                />
                <span className="font-medium text-text-default">{m.organizationName}</span>
              </label>
            ))}
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy || !chosenOrg}
            onClick={() => chosenOrg && void submitAccount(chosenOrg)}
          >
            {busy ? 'Signing in…' : 'Continue'}
          </Button>
          {error && <StatusBox tone="danger">{error}</StatusBox>}
        </AuthCard>
      </Shell>
    );
  }

  // ── Primary: federated identity → email + password → more ─────────────────
  return (
    <Shell>
      <AuthCard>
        <SignInTitle workspaceName={workspaceName} />

        {/* Tier 1 — one tap, no typing. Above the form because it's faster. */}
        <AnimatePresence initial={false}>
          {authStep === 'email' && hasFederated && (
            <motion.div
              key="federated"
              initial={alternatePresence.initial}
              animate={alternatePresence.animate}
              exit={alternatePresence.exit}
              transition={alternateTransition}
              className="space-y-2"
            >
              {providers.map((p) => (
                <ProviderSignInButton
                  key={p}
                  provider={p}
                  disabled={busy}
                  lastUsed={lastMethod === p}
                  onClick={() => startProvider(p)}
                />
              ))}
              {sso && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full justify-between"
                  disabled={busy}
                  onClick={() => startSso(sso.slug)}
                >
                  {sso.label}
                  {lastMethod === 'sso' && <LastUsedMarker />}
                </Button>
              )}
              <Divider>or</Divider>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tier 2 — the default path. */}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (authStep === 'email') { advanceToPassword(); return; }
            if (email.trim() && password) void submitAccount();
          }}
        >
          <SignInAuthStepPanels
            authStep={authStep}
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
          />

          <RememberMeField id="remember-account" checked={rememberMe} onChange={setRememberMe} />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy || (authStep === 'email' ? !email.trim() : !password)}
          >
            {authStep === 'email' ? 'Continue' : busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <AnimatePresence mode="popLayout" initial={false}>
          {error && (
            <motion.div
              key="error"
              initial={messagePresence.initial}
              animate={messagePresence.animate}
              exit={messagePresence.exit}
              transition={messageTransition}
            >
              <StatusBox tone="danger">{error}</StatusBox>
            </motion.div>
          )}
          {notice && (
            <motion.div
              key="notice"
              initial={messagePresence.initial}
              animate={messagePresence.animate}
              exit={messagePresence.exit}
              transition={messageTransition}
            >
              <StatusBox tone="accent">{notice}</StatusBox>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Tier 3 — one promoted option (what you used last) + a quiet drawer.
            Hidden on the password step so that stays a single focused action. */}
        <AnimatePresence initial={false}>
          {authStep === 'email' && (
            <motion.div
              key="more"
              initial={alternatePresence.initial}
              animate={alternatePresence.animate}
              exit={alternatePresence.exit}
              transition={alternateTransition}
              className="space-y-2"
            >
              {promotedOption && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full justify-between"
                  disabled={busy}
                  onClick={promotedOption.onSelect}
                >
                  {promotedOption.label}
                  <LastUsedMarker />
                </Button>
              )}

              {moreOpen ? (
                <div className="space-y-2">
                  {drawerOptions.map((o) => (
                    <Button
                      key={o.key}
                      variant="secondary"
                      size="lg"
                      className="w-full"
                      disabled={busy}
                      onClick={o.onSelect}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <TextLink onClick={() => setMoreOpen(true)}>More sign-in options</TextLink>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-role-caption text-text-soft">
          New here? <a href="/signup" className="font-semibold text-blue-600 hover:text-blue-700">Create a workspace</a>
        </p>
      </AuthCard>
      <PhoneSigninQrDialog open={showPhoneQr} onClose={() => setShowPhoneQr(false)} />
    </Shell>
  );
}

// ── Card chrome ─────────────────────────────────────────────────────────────

/** The one card on the page. Panel + the raised-soft elevation role (SoT). */
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <Panel
      padding="lg"
      radius="2xl"
      elevation="none"
      className={cn('w-full max-w-sm space-y-5', elevationClass('raised', 'soft'))}
    >
      {children}
    </Panel>
  );
}

interface AuthHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

/** Left-aligned. The eyebrow is for real context (an org name), never a restatement. */
function AuthHeader({ eyebrow, title, subtitle }: AuthHeaderProps) {
  return (
    <div className="space-y-1">
      {eyebrow && <p className="text-role-eyebrow uppercase text-text-soft">{eyebrow}</p>}
      <h1 className="text-role-title text-text-default">{title}</h1>
      {subtitle && <p className="text-role-caption text-text-soft">{subtitle}</p>}
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="h-px flex-1 bg-border-hairline" />
      <span className="text-role-micro uppercase text-text-soft">{children}</span>
      <div className="h-px flex-1 bg-border-hairline" />
    </div>
  );
}

function StatusBox({ tone, children }: { tone: 'danger' | 'accent'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'inset-field rounded-lg border text-role-caption',
        tone === 'danger'
          ? 'border-border-danger bg-surface-danger text-text-danger'
          : 'border-border-accent bg-surface-accent text-text-accent',
      )}
    >
      {children}
    </div>
  );
}

/** Quiet tertiary control — the only text-button shape on this page. */
function TextLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    // ds-raw-button: tertiary text control; a DS Button variant would read as an action.
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded text-left text-role-caption font-semibold text-text-soft transition-colors hover:text-text-default',
      )}
    >
      {children}
    </button>
  );
}

interface RememberMeFieldProps {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/**
 * One shape for one job — the account form and the station PIN pad share this.
 * The shared-computer warning is the part that actually changes behavior, so it
 * ships with the control rather than only on one of the two surfaces.
 */
function RememberMeField({ id, checked, onChange }: RememberMeFieldProps) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <label htmlFor={id} className="cursor-pointer leading-tight">
        <span className="block text-role-caption font-medium text-text-default">Keep me signed in</span>
        <span className="block text-role-micro font-normal normal-case tracking-normal text-text-soft">
          30 days on this device — uncheck on shared computers
        </span>
      </label>
    </div>
  );
}

interface StaffChoiceRowButtonProps {
  staff: StaffChoiceRow;
  disabled: boolean;
  onPick: (s: StaffChoiceRow) => void;
  isRecent?: boolean;
}

function StaffChoiceRowButton({ staff: s, disabled, onPick, isRecent }: StaffChoiceRowButtonProps) {
  return (
    // ds-raw-button: staff-picker row — custom avatar + meta layout, not a DS Button
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onPick(s)}
      aria-label={`Sign in as ${s.name}${s.role ? `, ${s.role}` : ''}`}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border bg-surface-card px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50',
        isRecent ? 'border-blue-200 ring-1 ring-inset ring-blue-100' : 'border-border-soft',
      )}
    >
      <span className="relative shrink-0">
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full text-role-caption font-semibold uppercase text-text-inverse',
            !s.color_hex && 'bg-surface-inverse',
          )}
          style={s.color_hex ? { backgroundColor: s.color_hex } : undefined}
          aria-hidden
        >
          {initials(s.name)}
        </span>
        {isRecent && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-surface-card" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-role-body font-semibold text-text-default">{s.name}</span>
        {s.role && (
          <span className="block truncate text-role-eyebrow uppercase text-text-soft">{s.role}</span>
        )}
      </span>
      <svg
        className="h-4 w-4 shrink-0 text-text-soft transition group-hover:translate-x-0.5 group-hover:text-blue-500"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/**
 * Phone hand-off QR. Composes the DS `Dialog` (Radix) so focus trap, focus
 * restore on close, Escape, scroll lock, and `aria-modal` come from the SoT —
 * this used to hand-roll a `fixed inset-0` scrim and had none of them.
 */
function PhoneSigninQrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(`${window.location.origin}/m/signin`);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan to sign in on your phone</DialogTitle>
          <DialogDescription>Point your phone camera at the code.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          {/* QR stays on a light tile in every theme — scanners need the contrast. */}
          <div className="rounded-2xl border border-border-soft bg-surface-card p-3">
            {url ? <QRCode value={url} size={196} level="M" /> : <div className="h-[196px] w-[196px] animate-pulse rounded-lg bg-surface-sunken" />}
          </div>
        </div>
        <div className="break-all rounded-lg bg-surface-canvas px-3 py-2 text-center font-mono text-role-micro text-text-soft">{url || ' '}</div>
      </DialogContent>
    </Dialog>
  );
}

function SignInTitle({ workspaceName }: { workspaceName: string | null }) {
  const titlePresence = useMotionPresence(framerPresence.signInTitle);
  const titleTransition = useMotionTransition(framerTransition.signInTitle);

  return (
    <div className="space-y-1">
      <h1 className="min-h-[1.5rem] text-role-title text-text-default">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={workspaceName ?? '__generic__'}
            className="block"
            initial={titlePresence.initial}
            animate={titlePresence.animate}
            exit={titlePresence.exit}
            transition={titleTransition}
          >
            {workspaceName ? `Sign in to ${workspaceName}` : 'Sign in to Cycle Forge'}
          </motion.span>
        </AnimatePresence>
      </h1>
      <p className="text-role-caption text-text-soft">Use the account you signed up with.</p>
    </div>
  );
}

/**
 * Page canvas. Deliberately plain: one flat surface, no ambient gradients, no
 * texture overlay, no glass. The card is the design.
 *
 * iOS/iPadOS geometry — two rules, both learned the hard way:
 *  1. The inner column is `min-h-full`, NOT `min-h-dvh`. Root layout pins <body>
 *     to the visual viewport with `overflow-hidden` (see app/layout.tsx) — a
 *     `100dvh` child inside this already-viewport-sized `fixed inset-0` box
 *     overflows it whenever Safari's chrome collapses, and the page scrolls past
 *     the painted area.
 *  2. A dedicated `fixed inset-0` paint layer sits behind the content, so
 *     rubber-band overscroll and any sub-pixel rounding still reveal the canvas
 *     color rather than the body underneath.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-modal overflow-y-auto overscroll-none bg-surface-canvas text-text-default antialiased">
      <div className="pointer-events-none fixed inset-0 z-base bg-surface-canvas" aria-hidden />
      <div className="relative z-sticky flex min-h-full flex-col items-center justify-center px-6 py-12">
        {/*
          NO mount entrance here. The card is the LCP element of the one public
          route, and it server-renders. A framer mount fade SSRs it at
          `opacity: 0` and only reveals it once hydration runs the animation, so
          LCP stopped tracking the HTML (~0.4s) and started tracking hydration
          (~8.7s simulated on the mobile profile) — a 24-point Lighthouse hit
          for a 260ms fade. First-paint content shows immediately; see
          `framerPresence.signInCard`, which is now exit-only.
        */}
        <div className="flex w-full justify-center">{children}</div>
      </div>
    </div>
  );
}
