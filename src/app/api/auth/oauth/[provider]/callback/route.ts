/** GET /api/auth/oauth/[provider]/callback (PUBLIC) — provider ∈ google | apple | microsoft */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { exchangeCode, decodeIdTokenClaimsUnsafe, fetchUserInfo } from '@/lib/auth/sso-oidc';
import {
  type PlatformProvider,
  platformProviderConfig,
  resolveRedirectUri,
  decodeOAuthState,
  OAUTH_STATE_COOKIE,
} from '@/lib/auth/platform-oauth';
import {
  getAccountIdByIdentity,
  linkAccountIdentity,
  getAccountByEmail,
  createAccount,
} from '@/lib/identity/accounts';
import { listMembershipsForAccount, logAuthEvent, resolveAccountIdForStaff } from '@/lib/identity/memberships';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getOrganizationBySlug } from '@/lib/tenancy/organizations';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { oauthOrigin } from '@/lib/auth/oauth-origin';
import { loadSharedStaffChoices } from '@/lib/identity/shared-staff-choice';
import { resolveOAuthPostLoginPath } from '@/lib/identity/oauth-post-login-path';
import { recordStaffLogin } from '@/lib/auth/record-staff-login';
import { resolveLandingPath } from '@/lib/auth/landing-path';
import pool from '@/lib/db';

export const runtime = 'nodejs';

function clearStateCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
  });
}

function fail(req: NextRequest, code: string): NextResponse {
  const url = new URL('/signin', oauthOrigin(req));
  url.searchParams.set('login_error', code);
  const res = NextResponse.redirect(url);
  clearStateCookie(res);
  return res;
}

interface CallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
  userName: string | null;
}

async function extractCallbackParams(req: NextRequest): Promise<CallbackParams> {
  if (req.method === 'POST') {
    try {
      const formData = await req.formData();
      const code = formData.get('code')?.toString() || null;
      const state = formData.get('state')?.toString() || null;
      const error = formData.get('error')?.toString() || null;
      let userName: string | null = null;
      const userRaw = formData.get('user')?.toString();
      if (userRaw) {
        try {
          const userObj = JSON.parse(userRaw) as { name?: { firstName?: string; lastName?: string } };
          if (userObj.name) {
            const parts = [userObj.name.firstName, userObj.name.lastName].filter(Boolean);
            if (parts.length > 0) userName = parts.join(' ');
          }
        } catch {
          // ignore malformed user json
        }
      }
      return { code, state, error, userName };
    } catch {
      return { code: null, state: null, error: 'invalid_form_data', userName: null };
    }
  }
  return {
    code: req.nextUrl.searchParams.get('code'),
    state: req.nextUrl.searchParams.get('state'),
    error: req.nextUrl.searchParams.get('error'),
    userName: null,
  };
}

async function handleCallback(req: NextRequest, provider: string): Promise<NextResponse> {
  if (provider !== 'google' && provider !== 'apple' && provider !== 'microsoft') return fail(req, 'oauth_unknown_provider');

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: `auth-oauth-callback-${provider}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) return fail(req, 'rate_limited');

  const { code, state: stateParam, error, userName } = await extractCallbackParams(req);
  if (error) return fail(req, 'oauth_denied');

  const cfg = platformProviderConfig(provider as PlatformProvider);
  if (!cfg) return fail(req, 'oauth_unconfigured');

  const payload = decodeOAuthState(req.cookies.get(OAUTH_STATE_COOKIE)?.value);
  // CSRF: the state in the URL / form post must match the one we stashed in the httpOnly cookie.
  if (!code || !stateParam || !payload || payload.provider !== provider || payload.state !== stateParam) {
    return fail(req, 'oauth_state');
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');

  // Exchange the code directly with the provider token endpoint (TLS +
  // our client secret ⇒ the id_token is provider-authenticated).
  let sub: string | undefined;
  let email: string | undefined;
  // OIDC Core §5.7: an unverified email must never be used as a unique
  // identifier. Absent claim ⇒ NOT verified. Same rule as sso/callback.
  let emailVerified = false;
  let name: string | undefined = userName || undefined;
  try {
    const token = await exchangeCode({
      endpoint: cfg.tokenUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      code,
      redirectUri: resolveRedirectUri(cfg, oauthOrigin(req)),
      codeVerifier: provider === 'apple' ? undefined : payload.verifier,
    });
    const claims = token.id_token ? decodeIdTokenClaimsUnsafe(token.id_token) : null;
    // Nonce binding, unconditional:
    if (!claims || (claims as { nonce?: string }).nonce !== payload.nonce) {
      return fail(req, 'oauth_nonce');
    }
    if (claims.sub) {
      sub = claims.sub;
      email = claims.email;
      emailVerified = claims.email_verified === true;
      name = claims.name || name;
    }
    // Fallback to userinfo when the id_token lacks the claims.
    if ((!sub || !email) && token.access_token && cfg.userinfoUrl) {
      const info = await fetchUserInfo({ endpoint: cfg.userinfoUrl, accessToken: token.access_token });
      sub = sub || info.sub;
      if (!email && info.email) {
        email = info.email;
        emailVerified = info.email_verified === true;
      }
      name = name || info.name;
    }
  } catch (err) {
    console.error(`[oauth/${provider}/callback] exchange failed:`, err);
    return fail(req, 'oauth_exchange');
  }
  if (!sub) return fail(req, 'oauth_no_subject');

  // IDENTITY LINKING:
  if (payload.linkAccountId) {
    const me = await getCurrentUser();
    const sessionAccountId = me ? await resolveAccountIdForStaff(me.staffId) : null;
    if (sessionAccountId !== payload.linkAccountId) {
      return fail(req, 'link_session_mismatch');
    }
    const ownerOfIdentity = await getAccountIdByIdentity(provider, sub);
    if (ownerOfIdentity && ownerOfIdentity !== payload.linkAccountId) {
      return fail(req, 'identity_in_use');
    }
    await linkAccountIdentity({
      accountId: payload.linkAccountId,
      provider,
      subject: sub,
      emailAtLink: email ?? null,
    });
    await logAuthEvent({
      accountId: payload.linkAccountId,
      orgId: null,
      event: 'identity_linked',
      ip,
      userAgent: ua,
    });
    const dest = new URL(payload.next || '/settings/security', oauthOrigin(req));
    dest.searchParams.set('linked', provider);
    return NextResponse.redirect(dest);
  }

  // Resolve or provision the account by the stable federated identity.
  let accountId = await getAccountIdByIdentity(provider, sub);
  if (!accountId) {
    // Adoption by email is a takeover primitive when the provider has not verified it (nOAuth:
    const existing = email && emailVerified ? await getAccountByEmail(email) : null;
    if (existing) {
      accountId = existing.id;
    } else {
      accountId = await createAccount({ displayName: name || email || 'Member', email: email ?? null, password: null });
    }
    await linkAccountIdentity({ accountId, provider, subject: sub, emailAtLink: email ?? null });
  }

  const memberships = await listMembershipsForAccount(accountId);
  if (memberships.length === 0) {
    await logAuthEvent({ accountId, orgId: null, event: 'failed_login', ip, userAgent: ua });
    return fail(req, 'no_workspace');
  }

  // Prefer the workspace the login started from (slug in state); else first.
  let target = memberships[0]!;
  if (payload.slug) {
    const org = await getOrganizationBySlug(payload.slug);
    const match = org ? memberships.find((m) => m.organization_id === org.id) : undefined;
    if (match) target = match;
  }

  // `persistent` is the "Keep me signed in" checkbox, carried through the
  // provider round trip in the httpOnly state cookie set by /start.
  const session = await createSession({
    staffId: target.staff_id, deviceKind: 'personal', ip, userAgent: ua,
    persistent: payload.persistent,
  });

  await audit({
    staffId: target.staff_id, sid: session.sid, event: 'signin.account', result: 'ok', ip, userAgent: ua,
    detail: { accountId, orgId: target.organization_id, via: `oauth_${provider}` },
  });
  await logAuthEvent({ accountId, orgId: target.organization_id, event: 'login', ip, userAgent: ua });
  const login = await recordStaffLogin(pool, target.staff_id);

  // Shared-account orgs: keep the umbrella session and land on the same
  // staff-name picker as email+password. Do not treat the Google/Apple email
  // as a person identity.
  const shared = await loadSharedStaffChoices(target.organization_id, target.staff_id);
  const mobile = payload.signinPath === '/m/signin';
  const home = resolveLandingPath({
    role: login.role,
    defaultHomePath: login.defaultHomePath,
    defaultHomePathMobile: login.defaultHomePathMobile,
    mobile,
  });
  const postLogin = resolveOAuthPostLoginPath({
    sharedStaffOrg: shared != null,
    next: payload.next,
    signinPath: payload.signinPath,
    home,
  });
  const dest = postLogin;
  const res = NextResponse.redirect(new URL(dest, oauthOrigin(req)));
  res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    maxAge: cookieMaxAgeForSession(session),
  });
  res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
  });
  clearStateCookie(res);
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return handleCallback(req, provider);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return handleCallback(req, provider);
}
