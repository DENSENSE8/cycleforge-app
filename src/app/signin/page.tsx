'use client';

/** /signin — unified SMB login. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

/** WebAuthn, the QR dialog's renderer and the whole shared-station (PIN) tree are loaded ON DEMAND, not with the page. */
type StartAuthentication = typeof import('@simplewebauthn/browser')['startAuthentication'];
const startAuthentication: StartAuthentication = async (...args) => {
  const mod = await import('@simplewebauthn/browser');
  return mod.startAuthentication(...args);
};
type StartRegistration = typeof import('@simplewebauthn/browser')['startRegistration'];
const startRegistration: StartRegistration = async (...args) => {
  const mod = await import('@simplewebauthn/browser');
  return mod.startRegistration(...args);
};
import { toast } from '@/lib/toast';
// Deliberately NO `@/design-system/motion` import here.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SignInAuthStepPanels } from '@/components/auth/SignInAuthStepPanels';
import { StaffChoiceRowButton } from '@/components/auth/StaffChoiceRowButton';
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
/**
 * GateGuard: /signin + /m/signin re-export. No API. User asked for Sign in with
 * QR below identity providers on mobile, rounded scan popover.
 */
const MobileSignInQrChooser = dynamic(
  () => import('@/components/auth/SignInQrScanDialog').then((m) => m.MobileSignInQrChooser),
  { ssr: false },
);
import { resolveLandingPath } from '@/lib/auth/landing-path';
// Deep paths, NOT the `@/design-system/primitives` barrel.
import { CheckCircle2, Fingerprint } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Panel } from '@/design-system/primitives/Panel';
import { RadiantLines } from '@/components/ui/radiant-lines';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { elevationClass } from '@/design-system/tokens/shadows';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { LastUsedMarker, ProviderSignInButton } from '@/components/auth/ProviderSignInButton';
import type { PlatformProvider } from '@/lib/auth/platform-oauth-types';
import { SignInQrPanel } from '@/components/auth/SignInQrPanel';
import {
  readLastSigninEmail,
  readLastSigninMethod,
  readRecentSignins,
  writeLastSigninEmail,
  writeLastSigninMethod,
  writeRecentSignin,
  type SigninMethod,
} from '@/lib/auth/recent-signins';

function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function humanError(code: string | undefined): string {
  switch (code) {
    case 'WRONG':              return 'PIN incorrect. Try again.';
    case 'LOCKED':             return 'Too many wrong PINs. Try again in 15 minutes or ask an admin to reset it.';
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
    case 'NO_SESSION':         return 'Sign in again to pick a staff member.';
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

type MobileSessionIdentity = {
  staffId: number;
  name: string;
  role: string;
};

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const next = params.get('next') || '';
  const isMobileSigninPath = pathname?.startsWith('/m/signin') ?? false;

  // A phone can reach this route after a successful sign-in via a stale link or an app retry.
  const [mobileSession, setMobileSession] = useState<MobileSessionIdentity | null | undefined>(
    isMobileSigninPath ? undefined : null,
  );
  useEffect(() => {
    if (!isMobileSigninPath) {
      setMobileSession(null);
      return;
    }

    let alive = true;
    void fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((data: { user?: MobileSessionIdentity | null }) => {
        if (alive) setMobileSession(data.user ?? null);
      })
      .catch(() => { if (alive) setMobileSession(null); });
    return () => { alive = false; };
  }, [isMobileSigninPath]);

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
  // Chooser face first (QR + providers + passkey are the fast paths); "Sign in with email" opens the credential face, which shows BOTH…
  const [authStep, setAuthStep] = useState<'choose' | 'credentials'>('choose');

  // No Google/Apple providers and no SSO on this workspace (and the fetch has RESOLVED - the skeleton tier covered the in-flight window)?
  // (operator 2026-09-08, re-affirmed 2026-09-09).
  useEffect(() => {
    const federated =
      (workspace?.platformProviders?.length ?? 0) > 0 || workspace?.sso != null;
    if (workspace?.resolved && !federated && authStep === 'choose') {
      setAuthStep('credentials');
    }
  }, [workspace, authStep]);
  // Sessions are ALWAYS persistent — there is no "keep me signed in" option.
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

  // Desk Face ID CTA is intentionally absent — shared stations use QR; the
  // phone authorizes the desk from its existing session (/m/qr-auth).
  // Phone /m sign-in may still offer Face ID for signing into the phone.
  const [platformPasskey, setPlatformPasskey] = useState(false);
  useEffect(() => {
    void import('@/lib/auth/webauthn-client').then(({ browserSupportsWebAuthn }) => {
      setPlatformPasskey(browserSupportsWebAuthn());
    });
  }, []);
  // Holds the deferred finish while the upgrade question is answered.
  const [passkeyPrompt, setPasskeyPrompt] = useState<{ proceed: () => void; saving: boolean } | null>(null);

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
  // Phone /m shell or UA-CH mobile → no desk companion QR (phone cannot scan itself).
  const [mobileSignInFace, setMobileSignInFace] = useState(false);
  const [showDeskQr, setShowDeskQr] = useState(false);
  useEffect(() => {
    const onMobilePath = window.location.pathname.startsWith('/m');
    const mobile = onMobilePath || isMobileDevice();
    setMobileSignInFace(mobile);
    setShowDeskQr(!mobile);
  }, []);

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
    if (staffId != null) writeRecentSignin(staffId);
    const onMobile = isMobileDevice();
    const target = resolveLandingPath({ next, role, defaultHomePath, defaultHomePathMobile, mobile: onMobile });
    if (typeof window !== 'undefined') window.location.assign(target);
    else router.replace(target);
  }, [router, next, picked, staffChoices]);

  const signOutMobileSession = useCallback(async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
    } finally {
      // Even if the network drops while revoking, leave this recovery face so
      // the operator can choose a different account instead of being trapped
      // behind the restored-session card.
      setMobileSession(null);
      router.replace('/m/signin');
    }
  }, [router]);

  // Google/Apple on a shared-account org mint the umbrella session then
  // bounce here with ?choose_staff=1 — same name picker as email+password.
  useEffect(() => {
    if (params.get('choose_staff') !== '1') return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const r = await fetch('/api/auth/staff-choice', { credentials: 'include', cache: 'no-store' });
        const data = (await r.json().catch(() => ({}))) as {
          needsStaffChoice?: boolean;
          organizationName?: string;
          staff?: StaffChoiceRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          setError(humanError(data.error));
          return;
        }
        if (data.needsStaffChoice && data.staff) {
          setStaffChoices(data.staff);
          setStaffChoiceOrg(data.organizationName ?? null);
          return;
        }
        // The umbrella session the OAuth callback minted needs no staff pick —
        // this is the sign-in, so it lands with the welcome.
        finish(null, null, null, null);
      } catch {
        if (!cancelled) setError('Sign-in failed. Try again.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, finish]);

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
        body: JSON.stringify({
          email: email.trim(),
          password,
          persistent: true,
          ...(orgId ? { organizationId: orgId } : {}),
        }),
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
        role?: string | null;
        defaultHomePath?: string | null;
        defaultHomePathMobile?: string | null;
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
      const proceed = () =>
        finish(null, data.role, data.defaultHomePath, data.defaultHomePathMobile);
      // Password worked on a Face ID-capable device and they haven't saved a passkey (or asked us to stop asking):
      if (platformPasskey && !window.localStorage.getItem('cf.passkeyPrompt.dismissed')) {
        setPasskeyPrompt({ proceed, saving: false });
        return;
      }
      proceed();
    } catch {
      setError('Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }, [email, password, finish, platformPasskey]);

  // Save an account passkey from the upgrade prompt. Best effort by design:
  // the sign-in is already valid — a failed save must never block the
  // redirect, it just means we ask again next time.
  const saveAccountPasskey = useCallback(async (proceed: () => void) => {
    setPasskeyPrompt({ proceed, saving: true });
    try {
      const beginRes = await fetch('/api/auth/account/passkey/register/begin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!beginRes.ok) throw new Error('begin failed');
      const beginData = (await beginRes.json()) as {
        options: Parameters<typeof startRegistration>[0]['optionsJSON'];
      };
      const attResp = await startRegistration({ optionsJSON: beginData.options });
      const finishRes = await fetch('/api/auth/account/passkey/register/finish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: attResp, label: navigator.userAgent.slice(0, 64) }),
      });
      if (!finishRes.ok) throw new Error('finish failed');
      writeLastSigninMethod('passkey');
    } catch {
      // Swallowed on purpose (comment above); the prompt closes either way.
    } finally {
      proceed();
    }
  }, []);

  // The finish half of the passkey ceremony, shared by the modal button and
  // the conditional-UI autofill bar: post the assertion, remember the method,
  // finish signing in. Throws on failure so each caller can react its own way.
  const completeAccountPasskey = useCallback(async (assertion: unknown) => {
    const finishRes = await fetch('/api/auth/account/passkey/authenticate/finish', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response: assertion, persistent: true }),
    });
    if (!finishRes.ok) {
      const data = await finishRes.json().catch(() => ({}));
      throw new Error(humanError((data as { error?: string }).error));
    }
    const data = (await finishRes.json().catch(() => ({}))) as {
      role?: string | null;
      defaultHomePath?: string | null;
      defaultHomePathMobile?: string | null;
    };
    writeLastSigninMethod('passkey');
    finish(null, data.role, data.defaultHomePath, data.defaultHomePathMobile);
  }, [finish]);

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
      await completeAccountPasskey(assertion);
    } catch (e) {
      // A cancelled or timed-out ceremony is a CHOICE, not a failure — and
      // the browser's raw message quotes the WebAuthn spec at the operator.
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError' || name === 'SecurityError') {
        toast('Passkey cancelled — nothing happened. Any sign-in way still works.');
        return;
      }
      const { humanizeWebAuthnError } = await import('@/lib/auth/webauthn-client');
      setError(humanizeWebAuthnError(e));
    } finally {
      setBusy(false);
    }
  }, [completeAccountPasskey]);

  // Conditional UI only on the phone face — never on a shared desk (avoids a
  // sudden WebAuthn / Face ID prompt where QR is the companion path).
  useEffect(() => {
    if (!mobileSignInFace || !platformPasskey) return;
    let cancelled = false;
    void (async () => {
      try {
        const beginRes = await fetch('/api/auth/account/passkey/authenticate/begin', {
          method: 'POST', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!beginRes.ok || cancelled) return;
        const begin = await beginRes.json() as { options: Parameters<typeof startAuthentication>[0]['optionsJSON'] };
        const assertion = await startAuthentication({ optionsJSON: begin.options, useBrowserAutofill: true });
        if (!cancelled) await completeAccountPasskey(assertion);
      } catch {
        // Swallowed on purpose (comment above).
      }
    })();
    return () => { cancelled = true; };
  }, [mobileSignInFace, platformPasskey, completeAccountPasskey]);

  // Redirect flows record on *attempt* — we navigate away before the outcome is
  // known, and this is only ever a display hint on the next visit.
  const startProvider = useCallback((p: PlatformProvider) => {
    writeLastSigninMethod(p);
    // Sessions are always persistent; /start stashes that in its httpOnly
    // state cookie so it survives the provider round trip.
    const qs = new URLSearchParams();
    if (next) qs.set('next', next);
    qs.set('persist', '1');
    qs.set('signin', pathname?.startsWith('/m') ? '/m/signin' : '/signin');
    const query = qs.toString();
    window.location.href = `/api/auth/oauth/${p}/start${query ? `?${query}` : ''}`;
  }, [next, pathname]);

  const startSso = useCallback((slug: string) => {
    writeLastSigninMethod('sso');
    const qs = new URLSearchParams({ slug });
    if (next) qs.set('next', next);
    // Carried on the sso_auth_state row — the only thing that survives the IdP
    // redirect — so a federated sign-in is persistent like any other.
    qs.set('persist', '1');
    window.location.href = `/api/auth/sso/start?${qs.toString()}`;
  }, [next]);

  // ── Station PIN handlers (reused bricks) ──────────────────────────────────
  const submitPin = useCallback(async (pin: string) => {
    if (!picked) return { ok: false as const, error: 'INTERNAL' };
    const r = await fetch('/api/auth/signin', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        staffId: picked.id, pin,
        deviceKind: 'personal',
        persistent: true,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return { ok: false as const, error: humanError((data as { error?: string }).error) };
    }
    const data = await r.json().catch(() => ({}));
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(picked.id, picked.role, d.defaultHomePath, d.defaultHomePathMobile);
    return { ok: true as const };
  }, [picked, finish]);

  const submitPinless = useCallback(async (row: StaffPickerRow) => {
    const r = await fetch('/api/auth/signin', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        staffId: row.id,
        deviceKind: 'personal',
        persistent: true,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setPickerMessage(humanError((data as { error?: string }).error));
      setPicked(null);
      return;
    }
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(row.id, row.role, d.defaultHomePath, d.defaultHomePathMobile);
  }, [finish]);

  // DOGFOOD / QA — pick a staff to act as (no PIN); owner session already set.
  const actAsStaff = useCallback(async (row: StaffChoiceRow) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/act-as-staff', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          staffId: row.id,
          deviceKind: 'personal',
          persistent: true,
        }),
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
  }, [finish]);

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
      body: JSON.stringify({
        staffId: picked.id, pin,
        deviceKind: 'personal',
        persistent: true,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return { ok: false as const, error: humanError((data as { error?: string }).error) };
    }
    const data = await r.json().catch(() => ({}));
    const d = data as { defaultHomePath?: string | null; defaultHomePathMobile?: string | null };
    finish(picked.id, picked.role, d.defaultHomePath, d.defaultHomePathMobile);
    return { ok: true as const };
  }, [picked, finish]);

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
      body: JSON.stringify({ response: assertion, deviceKind: 'personal', persistent: true }),
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

  // ── Tier 3: everything that isn't federated identity, QR, or the email form ─
  const extraOptions = useMemo(() => {
    const opts: { key: string; label: string; method?: SigninMethod; onSelect: () => void }[] = [
      { key: 'passkey', label: 'Sign in with a passkey', method: 'passkey', onSelect: () => void submitAccountPasskey() },
    ];
    // Shared-station PIN entry — hidden when the org forces email-first login.
    if (!workspace?.emailFirstSignin) {
      opts.push({ key: 'station', label: 'Sign in on a shared station', onSelect: () => setStationOpen(true) });
    }
    // Desk: never list passkey in More — QR is the phone handoff.
    // Phone: Face ID is a primary row when available, so keep it out of More.
    if (!mobileSignInFace || platformPasskey) return opts.filter((o) => o.key !== 'passkey');
    return opts;
  }, [submitAccountPasskey, workspace?.emailFirstSignin, platformPasskey, mobileSignInFace]);

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

  if (isMobileSigninPath && mobileSession === undefined) {
    return <MobileSigninSessionCheck />;
  }

  if (isMobileSigninPath && mobileSession) {
    return (
      <MobileSigninWelcome
        name={mobileSession.name}
        onContinue={() =>
          finish(mobileSession.staffId, mobileSession.role, null, null)
        }
        onSignOut={() => void signOutMobileSession()}
      />
    );
  }

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
            <div className="space-y-3">
              <div className="max-h-[22rem] space-y-4 overflow-y-auto p-px">
                {recentStaff.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="px-1 text-role-caption text-text-soft">Recent</p>
                    {recentStaff.map((s) => (
                      <StaffChoiceRowButton key={s.id} staffId={s.id} name={s.name} role={s.role} colorHex={s.color_hex} disabled={busy} onPick={() => actAsStaff(s)} isRecent />
                    ))}
                  </div>
                )}

                {(recentStaff.length === 0 || showAllStaff) && otherStaff.length > 0 && (
                  <div className="space-y-1.5">
                    {recentStaff.length > 0 && (
                      <p className="px-1 text-role-caption text-text-soft">All staff</p>
                    )}
                    {otherStaff.map((s) => (
                      <StaffChoiceRowButton key={s.id} staffId={s.id} name={s.name} role={s.role} colorHex={s.color_hex} disabled={busy} onPick={() => actAsStaff(s)} />
                    ))}
                  </div>
                )}
              </div>

              {recentStaff.length > 0 && !showAllStaff && otherStaff.length > 0 && (
                <Button variant="secondary" size="sm" className="w-full ring-inset" onClick={() => setShowAllStaff(true)}>
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
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!chosenOrg || busy) return;
              void submitAccount(chosenOrg);
            }}
          >
            <SearchableSelectField
              value={chosenOrg}
              onChange={(value) => setChosenOrg(value == null ? null : String(value))}
              options={orgChoices.map((m) => ({
                value: m.organizationId,
                label: m.organizationName,
              }))}
              placeholder="Search or choose a workspace"
              searchPlaceholder="Search workspaces…"
              emptyMessage="No matching workspaces"
              ariaLabel="Choose a workspace"
              autoFocus
              testId="workspace-combobox"
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={!chosenOrg}
            >
              {busy ? 'Signing in…' : 'Continue'}
            </Button>
          </form>
          {error && <StatusBox tone="danger">{error}</StatusBox>}
        </AuthCard>
      </Shell>
    );
  }

  // ── Primary: federated identity → email + password → more ─────────────────
  return (
    <Shell>
      {passkeyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4">
          <Panel padding="lg" radius="2xl" className="w-full max-w-sm space-y-4">
            <AuthHeader
              title="Save a passkey?"
              subtitle="Next time, this device signs in with Face ID — no password."
            />
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={passkeyPrompt.saving}
              onClick={() => void saveAccountPasskey(passkeyPrompt.proceed)}
            >
              {passkeyPrompt.saving ? 'Saving…' : 'Save passkey'}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={passkeyPrompt.saving}
              onClick={passkeyPrompt.proceed}
            >
              Not now
            </Button>
            <div className="flex justify-center">
              <TextLink
                onClick={() => {
                  window.localStorage.setItem('cf.passkeyPrompt.dismissed', '1');
                  passkeyPrompt.proceed();
                }}
              >
                Don't ask on this device
              </TextLink>
            </div>
          </Panel>
        </div>
      )}
      <AuthCard
        qrPanel={
          // Desk-only: companion QR is scanned BY the phone. Never on /m/signin
          // (WhatsApp Web / Discord / QRAuth — QR on phone is a dead-end).
          showDeskQr
            ? (
              <SignInQrPanel
                onSuccess={(data) => {
                  finish(
                    data?.staffId ?? null,
                    data?.role ?? null,
                    data?.defaultHomePath ?? null,
                    data?.defaultHomePathMobile ?? null,
                  );
                }}
              />
            )
            : undefined
        }
      >
        <SignInTitle workspaceName={workspaceName} />

{/* ONE HEIGHT (operator 2026-09-09): title pins to the top edge, New-here
    pins to the bottom edge; the provider tier (skeletons, absent, loaded)
    lives in the centered middle, so nothing jumps when it resolves. */}
<div className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-2">


        {/* Tier 1 — identity providers lead. Desk: federated → or → email;
            QR lives in the side panel (phone scans → authorize desktop).
            Phone /m: federated → Sign in with QR code → Face ID → or → email. */}
        {authStep === 'choose' && workspace === null && (
          <div className="space-y-2.5" aria-label="Loading sign-in providers" data-testid="provider-skeleton">
            {[0, 1].map((i) => (
              <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-surface-sunken" />
            ))}
          </div>
        )}

        {authStep === 'choose' && hasFederated && (
          <div key="federated" className="space-y-2.5" aria-label="Identity provider sign-in">
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
                className={lastMethod === 'sso' ? 'relative w-full px-10' : 'w-full'}
                disabled={busy}
                onClick={() => startSso(sso.slug)}
              >
                {sso.label}
                {lastMethod === 'sso' && <LastUsedMarker />}
              </Button>
            )}
            {mobileSignInFace ? <MobileSignInQrChooser disabled={busy} /> : null}
            {mobileSignInFace && platformPasskey ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className={lastMethod === 'passkey' ? 'relative w-full px-10' : 'w-full'}
                disabled={busy}
                icon={<Fingerprint className="h-4 w-4" />}
                onClick={() => void submitAccountPasskey()}
              >
                Sign in with Face ID
                {lastMethod === 'passkey' && <LastUsedMarker />}
              </Button>
            ) : null}
          </div>
        )}

        {/* No federated providers: still offer desk QR scan on mobile, above email. */}
        {authStep === 'choose' && workspace !== null && !hasFederated && mobileSignInFace ? (
          <div key="mobile-qr" className="space-y-2.5">
            <MobileSignInQrChooser disabled={busy} />
            {platformPasskey ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className={lastMethod === 'passkey' ? 'relative w-full px-10' : 'w-full'}
                disabled={busy}
                icon={<Fingerprint className="h-4 w-4" />}
                onClick={() => void submitAccountPasskey()}
              >
                Sign in with Face ID
                {lastMethod === 'passkey' && <LastUsedMarker />}
              </Button>
            ) : null}
          </div>
        ) : null}

        {authStep === 'choose' && (
          <div key="choose" className="space-y-2.5">
            {(hasFederated || (mobileSignInFace && workspace !== null)) && <Divider>or</Divider>}
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setError(null);
                setNotice(null);
                setAuthStep('credentials');
              }}
            >
              Sign in with email
            </Button>
          </div>
        )}

        {/* Tier 2 (opened) — the credential face: email + password together,
            one submit. */}
        {authStep === 'credentials' && (
          <form
            className="space-y-4"
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              if (email.trim() && password) void submitAccount();
            }}
          >
            <SignInAuthStepPanels
              email={email}
              password={password}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onAllOptions={() => { setAuthStep('choose'); setError(null); setNotice(null); }}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={!email.trim() || !password}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        )}

        {error && <StatusBox tone="danger">{error}</StatusBox>}
        {notice && <StatusBox tone="accent">{notice}</StatusBox>}


        {/* Tier 3 — one promoted option (what you used last) + a quiet drawer.
            Lives on the chooser face: the email form stays a single focused
            action once opened. */}
        {authStep === 'choose' && (
          <div key="more" className="space-y-2">
              {promotedOption && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="relative w-full px-10"
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
          </div>
        )}

</div>

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
function AuthCard({ children, qrPanel }: { children: React.ReactNode; qrPanel?: React.ReactNode }) {
  if (!qrPanel) {
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

  return (
    <>
      <style>{`
        .cf-auth-card { width: 100%; border-radius: 1rem; overflow: hidden; }
        @media (min-width: 768px) {
          .cf-auth-card { max-width: 660px !important; }
          .cf-auth-left { flex: 1 1 0% !important; min-width: 0 !important; }
          .cf-auth-qr { width: 230px !important; flex-shrink: 0 !important; }
        }
        @media (max-width: 767px) {
          .cf-auth-card { max-width: 384px !important; }
        }
      `}</style>
      <Panel
        padding="none"
        radius="2xl"
        elevation="none"
        className={cn('cf-auth-card', elevationClass('raised', 'soft'))}
      >
        <div className="flex flex-col md:flex-row md:items-stretch">
          <div className="cf-auth-left p-5 md:p-6 space-y-4 block my-auto">
            {children}
          </div>

          <div className="hidden md:block w-px bg-border-hairline self-stretch my-4" />

          {/* Desktop-only, and a PEER ROW of the left column — same height, same padding, so the QR tile reads as one card with two equal halves, not… */}
          <div className="cf-auth-qr hidden md:flex self-stretch bg-surface-sunken/30 p-5 md:p-6 flex-col items-center justify-center">
            {qrPanel}
          </div>
        </div>
      </Panel>
    </>
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
      {eyebrow && <p className="text-role-eyebrow text-text-soft">{eyebrow}</p>}
      <h1 className="text-role-title text-text-default">{title}</h1>
      {subtitle && <p className="text-role-caption text-text-soft">{subtitle}</p>}
    </div>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="h-px flex-1 bg-border-hairline" />
      <span className="text-role-caption text-text-soft">{children}</span>
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

/**
 * Phone deep-link QR (`/m/signin`) — opens the mobile site; does not mint a
 * pairing token. Real desk pairing is {@link SignInQrPanel}. Composes the DS
 * `Dialog` so focus trap / Escape / scroll lock come from the SoT.
 */
function PhoneSigninQrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(`${window.location.origin}/m/signin`);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className={cn('max-w-sm overflow-hidden', COMPOSER_SHELL_CORNER)}>
        <DialogHeader>
          <DialogTitle>Scan to open on your phone</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center">
          {/* Grounds itself white — scanners need the contrast; no wrapper
              tile, it double-boxed the code and sat off-centre. */}
          {url ? <QRCode value={url} size={196} level="M" /> : <div className="h-[196px] w-[196px] animate-pulse rounded-lg bg-surface-sunken" />}
        </div>

        <div className="break-all rounded-lg bg-surface-canvas px-3 py-2 text-center font-mono text-role-micro text-text-soft">{url || ' '}</div>
      </DialogContent>
    </Dialog>
  );
}

function SignInTitle({ workspaceName }: { workspaceName: string | null }) {
  return (
    <div className="space-y-1">
      <h1 className="min-h-[1.5rem] text-role-title text-text-default">
        <span key={workspaceName ?? '__generic__'} className="block">
          {workspaceName ? `Sign in to ${workspaceName}` : 'Sign in to Cycle Forge'}
        </span>
      </h1>
    </div>
  );
}

/** Page canvas. Deliberately plain: */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-modal overflow-y-auto overscroll-none bg-surface-canvas text-text-default antialiased">
      <div className="pointer-events-none fixed inset-0 z-base bg-surface-canvas" aria-hidden />
      <RadiantLines
        className="bg-transparent opacity-30"
        colors={["#60A5FA", "#2DD4BF", "#FBBF24", "#94A3B8"]}
        starCount={180}
        displacement={0.35}
      />
      <div className="relative z-sticky flex min-h-full flex-col items-center justify-center px-6 py-12">
        {/* NO mount entrance here. */}
        <div className="flex w-full justify-center">{children}</div>
      </div>
    </div>
  );
}

function MobileSigninSessionCheck() {
  return (
    <Shell>
      <Panel padding="lg" radius="2xl" className="w-full max-w-sm text-center">
        <p className="text-role-body text-text-soft">Checking your sign-in…</p>
      </Panel>
    </Shell>
  );
}

function MobileSigninWelcome({
  name,
  onContinue,
  onSignOut,
}: {
  name: string;
  onContinue: () => void;
  onSignOut: () => void;
}) {
  return (
    <Shell>
      <Panel padding="lg" radius="2xl" className="w-full max-w-sm space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-12 text-text-success" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-role-title text-text-default">Welcome back</h1>
          <p className="text-role-body text-text-soft">
            Signed in as <span className="font-semibold text-text-default">{name}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button size="lg" onClick={onContinue}>
            Continue
          </Button>
          <Button variant="ghost" size="md" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </Panel>
    </Shell>
  );
}
