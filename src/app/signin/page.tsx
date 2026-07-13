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
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { SignInAuthStepPanels } from '@/components/auth/SignInAuthStepPanels';
import QRCode from 'react-qr-code';
import { StaffPickerList, type StaffPickerRow } from '@/components/auth/StaffPickerList';
import { StaffPinPad } from '@/components/auth/StaffPinPad';
import { StaffSigningIn } from '@/components/auth/StaffSigningIn';
import { SetPinPad } from '@/components/auth/SetPinPad';
import { BootSplash } from '@/components/boot/BootSplash';
import { armBootSplash } from '@/lib/boot-flag';
import { Button, IconButton } from '@/design-system/primitives';
import {
  readLastSigninEmail,
  readRecentSignins,
  writeLastSigninEmail,
  writeRecentSignin,
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

type PlatformProvider = 'google' | 'microsoft';

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

const PROVIDER_LABEL: Record<PlatformProvider, string> = {
  google: 'Continue with Google',
  microsoft: 'Continue with Microsoft',
};

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
      // Credentials accepted — remember the email for next time on this device.
      writeLastSigninEmail(email);
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

  const backToEmail = useCallback(() => {
    setError(null);
    setAuthStep('email');
  }, []);

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
      finish(null, null, null, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Passkey sign-in failed.');
    } finally {
      setBusy(false);
    }
  }, [finish]);

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
            <RememberMeToggle checked={rememberMe} onChange={setRememberMe} />
          </div>
        )}
        {showPhoneQr && <PhoneSigninQrPopover onClose={() => setShowPhoneQr(false)} />}
      </Shell>
    );
  }

  // ── Staff picker (SHARED-account workspace — sign in as any staff, no PIN) ──
  if (staffChoices) {
    return (
      <Shell>
        <div className="relative w-full max-w-sm space-y-5 rounded-3xl border border-border-soft/50 bg-surface-card/80 p-8 shadow-xl shadow-navy-900/5 backdrop-blur-xl">
          <div className="space-y-1 text-center">
            {staffChoiceOrg && (
              <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{staffChoiceOrg}</p>
            )}
            <h1 className="text-lg font-bold text-text-default">Sign in as a staff member</h1>
            <p className="text-xs text-text-soft">Tap your name to start.</p>
          </div>

          {staffChoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-xs text-text-soft">
              No staff members yet. Add your team in Settings, then come back to pick a name.
            </div>
          ) : (
            <div className="-mr-1 max-h-[22rem] space-y-4 overflow-y-auto pr-1">
              {recentStaff.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-role-micro font-semibold uppercase tracking-[0.18em] text-text-faint">Recent</p>
                  {recentStaff.map((s) => (
                    <StaffChoiceRowButton key={s.id} staff={s} disabled={busy} onPick={actAsStaff} isRecent />
                  ))}
                </div>
              )}

              {(recentStaff.length === 0 || showAllStaff) && otherStaff.length > 0 && (
                <div className="space-y-1.5">
                  {recentStaff.length > 0 && (
                    <p className="px-1 text-role-micro font-semibold uppercase tracking-[0.18em] text-text-faint">All staff</p>
                  )}
                  {otherStaff.map((s) => (
                    <StaffChoiceRowButton key={s.id} staff={s} disabled={busy} onPick={actAsStaff} />
                  ))}
                </div>
              )}

              {recentStaff.length > 0 && !showAllStaff && otherStaff.length > 0 && (
                // ds-raw-button: inline disclosure to reveal the rest of the roster
                <button
                  type="button"
                  onClick={() => setShowAllStaff(true)}
                  className="group flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-soft bg-surface-card px-3 py-2.5 text-role-caption font-semibold text-text-soft transition hover:border-blue-300 hover:text-text-default"
                >
                  More
                  <span className="text-text-faint">·</span>
                  <span className="font-medium text-text-faint">{otherStaff.length} more staff</span>
                  <svg
                    className="h-3.5 w-3.5 text-text-faint transition group-hover:translate-y-0.5"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* ds-raw-button: inline text link below staff roster */}
          <button
            type="button"
            onClick={() => { setStaffChoices(null); setError(null); }}
            className="w-full text-center text-role-caption font-semibold text-text-soft hover:text-text-default"
          >
            Use a different login
          </button>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        </div>
      </Shell>
    );
  }

  // ── Workspace picker (multi-org account) ──────────────────────────────────
  if (orgChoices) {
    return (
      <Shell>
        <div className="relative w-full max-w-sm space-y-5 rounded-3xl border border-border-soft/50 bg-surface-card/80 p-8 shadow-xl shadow-navy-900/5 backdrop-blur-xl">
          <div className="space-y-1">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Choose a workspace</p>
            <h1 className="text-lg font-bold text-text-default">Where do you want to go?</h1>
          </div>
          <div className="divide-y divide-border-hairline overflow-hidden rounded-xl border border-border-soft">
            {orgChoices.map((m) => (
              <label
                key={m.organizationId}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm ${
                  chosenOrg === m.organizationId ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-canvas'
                }`}
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
            className="w-full"
            disabled={busy || !chosenOrg}
            onClick={() => chosenOrg && void submitAccount(chosenOrg)}
          >
            {busy ? 'Signing in…' : 'Continue'}
          </Button>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        </div>
      </Shell>
    );
  }

  // ── Primary: email + password ─────────────────────────────────────────────
  return (
    <Shell>
      <div className="relative w-full max-w-sm space-y-5 rounded-3xl border border-border-soft/50 bg-surface-card/80 px-8 pb-8 pt-7 shadow-xl shadow-navy-900/5 backdrop-blur-xl">
        <div className="space-y-2">
          <div className="space-y-1 text-center">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Cycle Forge</p>
            <SignInTitle workspaceName={workspaceName} />
          </div>

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
              onBackToEmail={backToEmail}
            />

            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-3.5 w-3.5 rounded border-border-default" />
              Remember this device
            </label>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={busy || (authStep === 'email' ? !email.trim() : !password)}
            >
              {authStep === 'email' ? 'Continue' : busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {error && (
            <motion.div
              key="error"
              initial={messagePresence.initial}
              animate={messagePresence.animate}
              exit={messagePresence.exit}
              transition={messageTransition}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {error}
            </motion.div>
          )}
          {notice && (
            <motion.div
              key="notice"
              initial={messagePresence.initial}
              animate={messagePresence.animate}
              exit={messagePresence.exit}
              transition={messageTransition}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700"
            >
              {notice}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alternate methods live on the identity (email) step; the password
            step stays a single, focused row. Tap the email chip to come back. */}
        <AnimatePresence initial={false}>
        {authStep === 'email' && (
        <motion.div
          key="alternate"
          initial={alternatePresence.initial}
          animate={alternatePresence.animate}
          exit={alternatePresence.exit}
          transition={alternateTransition}
          className="space-y-5"
        >
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border-hairline" />
          <span className="text-role-micro font-semibold uppercase tracking-widest text-text-faint">or</span>
          <div className="h-px flex-1 bg-border-hairline" />
        </div>

        {(workspace?.platformProviders?.length || workspace?.sso) && (
          <div className="space-y-2">
            {workspace?.platformProviders?.map((p) => {
              const qs = next ? `?next=${encodeURIComponent(next)}` : '';
              return (
                <Button key={p} variant="secondary" className="w-full" onClick={() => { window.location.href = `/api/auth/oauth/${p}/start${qs}`; }}>
                  {PROVIDER_LABEL[p]}
                </Button>
              );
            })}
            {workspace?.sso && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  const params2 = new URLSearchParams({ slug: workspace.sso!.slug });
                  if (next) params2.set('next', next);
                  window.location.href = `/api/auth/sso/start?${params2.toString()}`;
                }}
              >
                {workspace.sso.label}
              </Button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void submitMagicLink()}>
            Email me a sign-in link
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void submitAccountPasskey()}>
            Sign in with a passkey
          </Button>
          {/* ds-raw-button: tertiary text link below primary auth buttons */}
          <button
            type="button"
            onClick={() => setShowPhoneQr(true)}
            className="w-full text-center text-role-caption font-semibold text-text-soft hover:text-text-default"
          >
            Use your phone to sign in
          </button>
        </div>

        {/* Shared-station PIN mode — collapsed; only offered when a workspace is
            resolved AND the org hasn't forced email-first login. */}
        {!workspace?.emailFirstSignin && (
        <div className="border-t border-border-hairline pt-4">
          {stationOpen ? (
            workspace?.resolved ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-role-micro uppercase tracking-widest text-text-soft">Shared station — pick your name</p>
                  {/* ds-raw-button: inline text cancel control in station sub-panel */}
                  <button type="button" onClick={() => { setStationOpen(false); setPicked(null); }} className="text-role-caption font-semibold text-text-soft hover:text-text-default">Cancel</button>
                </div>
                <StaffPickerList
                  recent={recent}
                  recentReady={recentReady}
                  onPick={handlePick}
                  onMessage={setPickerMessage}
                  onPolicy={handlePolicy}
                />
                {pickerMessage && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{pickerMessage}</div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-4 text-center text-xs text-text-soft">
                Station sign-in happens on your workspace URL. Open <span className="font-semibold text-text-default">yourteam.app.cycleforge.ai</span> to pick your name and enter a PIN.
                {/* ds-raw-button: inline text back link inside dashed teaching box */}
                <button type="button" onClick={() => setStationOpen(false)} className="mt-2 block w-full text-role-caption font-semibold text-blue-600 hover:text-blue-700">Back</button>
              </div>
            )
          ) : (
            // ds-raw-button: collapsed disclosure trigger for station mode
            <button
              type="button"
              onClick={() => setStationOpen(true)}
              className="w-full text-center text-xs font-semibold text-text-soft hover:text-text-default"
            >
              Signing in on a shared station?
            </button>
          )}
        </div>
        )}
        </motion.div>
        )}
        </AnimatePresence>

        <p className="text-center text-xs text-text-soft">
          New here? <a href="/signup" className="font-semibold text-blue-600 hover:text-blue-700">Create a workspace</a>
        </p>
      </div>
      {showPhoneQr && <PhoneSigninQrPopover onClose={() => setShowPhoneQr(false)} />}
    </Shell>
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
      className={`group flex w-full items-center gap-3 rounded-xl border bg-surface-card px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50 ${
        isRecent ? 'border-blue-200 ring-1 ring-inset ring-blue-100' : 'border-border-soft'
      }`}
    >
      <span className="relative shrink-0">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-black uppercase tracking-wide text-text-inverse ${s.color_hex ? '' : 'bg-surface-inverse'}`}
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
        <span className="block truncate text-sm font-semibold text-text-default">{s.name}</span>
        {s.role && (
          <span className="block truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">{s.role}</span>
        )}
      </span>
      <svg
        className="h-4 w-4 shrink-0 text-text-faint transition group-hover:translate-x-0.5 group-hover:text-blue-500"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function PhoneSigninQrPopover({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(`${window.location.origin}/m/signin`);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in with your phone" className="fixed inset-0 z-modal flex items-center justify-center px-4">
      {/* ds-raw-button: full-bleed modal scrim/overlay dismiss target, not a DS Button */}
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-scrim/40 backdrop-blur-sm transition-opacity" />
      <div className="relative w-full max-w-sm rounded-3xl border border-border-soft bg-surface-card p-7 shadow-2xl shadow-navy-900/20">
        <IconButton
          type="button"
          onClick={onClose}
          ariaLabel="Close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-sunken"
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 6l12 12" /><path d="M18 6L6 18" />
            </svg>
          }
        />
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight text-text-default">Scan to sign in on your phone</h2>
          <p className="mt-1.5 text-role-caption leading-relaxed text-text-soft">Point your phone camera at the code.</p>
        </div>
        <div className="mt-5 flex justify-center">
          <div className="rounded-2xl border border-border-soft bg-surface-card p-3 shadow-inner shadow-navy-900/[0.03]">
            {url ? <QRCode value={url} size={196} level="M" /> : <div className="h-[196px] w-[196px] animate-pulse rounded-lg bg-surface-sunken" />}
          </div>
        </div>
        <div className="mt-5 break-all rounded-lg bg-surface-canvas px-3 py-2 text-center text-role-micro font-mono text-text-soft">{url || ' '}</div>
      </div>
    </div>
  );
}

interface RememberMeToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
}

function RememberMeToggle({ checked, onChange }: RememberMeToggleProps) {
  return (
    <label className="group inline-flex cursor-pointer items-center gap-3 rounded-full border border-border-soft bg-surface-card/80 px-4 py-2 text-role-caption font-medium text-text-muted shadow-sm shadow-navy-900/[0.03] backdrop-blur transition-all hover:border-border-default hover:text-text-default">
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-surface-inverse' : 'bg-surface-strong'}`} aria-hidden>
        <span className={`inline-block h-4 w-4 rounded-full bg-surface-card shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
      </span>
      <span className="flex flex-col leading-tight">
        <span>Keep me signed in</span>
        <span className="text-role-micro text-text-faint group-hover:text-text-soft">30 days on this device — uncheck on shared computers</span>
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SignInTitle({ workspaceName }: { workspaceName: string | null }) {
  const titlePresence = useMotionPresence(framerPresence.signInTitle);
  const titleTransition = useMotionTransition(framerTransition.signInTitle);

  return (
    <h1 className="min-h-[1.75rem] text-lg font-bold text-text-default">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={workspaceName ?? '__generic__'}
          className="block"
          initial={titlePresence.initial}
          animate={titlePresence.animate}
          exit={titlePresence.exit}
          transition={titleTransition}
        >
          {workspaceName ? (
            <>Sign in to <span className="text-blue-600">{workspaceName}</span></>
          ) : (
            'Sign in'
          )}
        </motion.span>
      </AnimatePresence>
    </h1>
  );
}

/** Soft color washes — radial gradients avoid `blur` + `overflow-hidden` clip. */
const SIGNIN_ORB_GRADIENT = [
  'radial-gradient(ellipse 46% 42% at 8% 14%, rgba(59, 130, 246, 0.42), transparent 72%)',
  'radial-gradient(ellipse 52% 48% at 94% 22%, rgba(168, 85, 247, 0.34), transparent 74%)',
  'radial-gradient(ellipse 44% 40% at 26% 92%, rgba(99, 102, 241, 0.38), transparent 70%)',
].join(', ');

function Shell({ children }: { children: React.ReactNode }) {
  const cardPresence = useMotionPresence(framerPresence.signInCard);
  const cardTransition = useMotionTransition(framerTransition.signInCardMount);

  return (
    <div className="fixed inset-0 z-modal overflow-y-auto text-text-default antialiased">
      {/* Viewport-fixed washes — `absolute inset-0` only covered the scrollport, leaving a white strip below long cards */}
      <div className="pointer-events-none fixed inset-0 z-base bg-gradient-to-br from-surface-canvas via-surface-card to-surface-canvas" aria-hidden />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-base"
        style={{ background: SIGNIN_ORB_GRADIENT }}
        animate={{ opacity: [0.88, 1, 0.88] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-base"
        style={{
          background: 'radial-gradient(ellipse 38% 34% at 72% 78%, rgba(56, 189, 248, 0.22), transparent 68%)',
        }}
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [1, 1.04, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      <div
        className="pointer-events-none fixed inset-0 z-raised opacity-[0.06] dark:opacity-[0.08]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
        aria-hidden
      />
      <div className="relative z-sticky flex min-h-dvh flex-col items-center justify-start px-6 pt-[12vh] pb-16">
        <motion.div
          initial={cardPresence.initial}
          animate={cardPresence.animate}
          transition={cardTransition}
          className="flex w-full justify-center"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
