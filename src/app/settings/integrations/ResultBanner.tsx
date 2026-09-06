'use client';

/**
 * Shows the outcome of an OAuth round-trip. The provider callbacks redirect back
 * to /settings/integrations?success=…|error=… ; this fires a toast, renders a
 * dismissible inline banner, and strips the query params so a refresh is quiet.
 */
import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import { AlertTriangle, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { IntegrationConnectSuccess } from './IntegrationConnectSuccess';

type SuccessSpec = {
  message: string;
  href?: string;
  linkLabel?: string;
};

const SUCCESS: Record<string, SuccessSpec> = {
  amazon_connected: { message: 'Amazon connected.' },
  ebay_connected: { message: 'eBay account linked successfully.' },
  ebay_buyer_connected: {
    message:
      'Purchasing account linked — open Incoming and run Marketplace refresh to pull buyer orders.',
    href: '/incoming',
    linkLabel: 'Open Incoming →',
  },
  ebay_seller_connected: {
    message: 'Selling account linked — storefront orders and tracking sync from this account.',
  },
  zoho_connected: { message: 'Zoho connected.' },
  google_drive_connected: {
    message: 'Google Drive connected — photo backups will start automatically.',
  },
  grok_connected: {
    message: 'Grok connected — Ask will use your SuperGrok subscription.',
  },
};

const ERRORS: Record<string, string> = {
  amazon_missing_oauth_params: 'Amazon sign-in returned no authorization code — please retry.',
  amazon_invalid_oauth_state: 'The Amazon connection link was invalid — please retry.',
  amazon_incomplete_oauth_state: 'The Amazon connection link was incomplete — please retry.',
  amazon_oauth_state_expired: 'The Amazon connection link expired — please retry.',
  amazon_server_configuration: 'The Amazon app is not fully configured on the server.',
  amazon_callback_failed: 'Amazon connection failed — please retry.',
  ebay_consent_declined: 'eBay sign-in was cancelled.',
  ebay_missing_oauth_params: 'eBay sign-in returned no authorization code — please retry.',
  ebay_invalid_oauth_state: 'The eBay connection link was invalid — please retry.',
  ebay_incomplete_oauth_state: 'The eBay connection link was incomplete — please retry.',
  ebay_oauth_state_expired: 'The eBay connection link expired — please retry.',
  ebay_server_configuration: 'The eBay app is not fully configured on the server.',
  ebay_app_credentials_invalid: 'eBay rejected the app credentials (Cert ID / Client Secret). Update EBAY_CERT_ID with the full Production Cert ID from developer.ebay.com, then reconnect.',
  ebay_oauth_runame_invalid:
    'eBay rejected the OAuth authorize request (invalid_request). Confirm in developer.ebay.com → Application Keys → Production that EBAY_APP_ID matches the Production App ID, EBAY_RU_NAME is the Production RuName (not Sandbox) for that same keyset, OAuth is selected, accept URL is https://app.cycleforge.ai/api/ebay/callback, and the RuName is Saved. Then update Vercel Production EBAY_RU_NAME and redeploy.',
  ebay_oauth_authorize_rejected:
    'eBay rejected the OAuth authorize request. Confirm Production EBAY_APP_ID, EBAY_CERT_ID, and EBAY_RU_NAME match the CycleForge app in developer.ebay.com, then retry.',
  ebay_token_exchange_failed: 'Token exchange with eBay failed — please retry.',
  // Detail codes appended via ?ebay_oauth_error=… from /api/ebay/callback
  ebay_oauth_invalid_code:
    'eBay rejected the authorization code (expired, already used, or RuName / App ID mismatch). Start Add purchasing again — do not refresh the callback URL. Confirm EBAY_RU_NAME matches the Production RuName whose accept URL is app.cycleforge.ai/api/ebay/callback.',
  ebay_oauth_invalid_grant:
    'eBay rejected the authorization grant — start Add purchasing again with a fresh consent.',
  ebay_callback_failed: 'eBay connection failed — please retry.',
  missing_oauth_params: 'Sign-in returned no authorization code — please retry.',
  token_exchange_failed: 'Token exchange with the provider failed — please retry.',
  google_drive_missing_oauth_params: 'Google sign-in returned no authorization code — please retry.',
  google_drive_invalid_oauth_state: 'The Google Drive connection link was invalid — please retry.',
  google_drive_incomplete_oauth_state: 'The Google Drive connection link was incomplete — please retry.',
  google_drive_oauth_state_expired: 'The Google Drive connection link expired — please retry.',
  google_drive_server_configuration: 'Google Drive backup is not fully configured on the server.',
  google_drive_no_refresh_token: 'Google did not return offline access — remove this app at myaccount.google.com/permissions, then reconnect.',
  google_drive_callback_failed: 'Google Drive connection failed — please retry.',
  google_drive_access_denied: 'Google sign-in was cancelled.',
  grok_device_start_failed: 'Could not start SuperGrok sign-in — retry Connect, or run `grok login` on this machine first.',
  grok_login_required: 'No SuperGrok session on this machine. Run `grok login`, then Connect again.',
};

function resolveEbayTokenExchangeMessage(ebayOauthError?: string): string {
  const code = String(ebayOauthError ?? '').trim().toLowerCase();
  if (code && ERRORS[`ebay_oauth_${code}`]) return ERRORS[`ebay_oauth_${code}`];
  if (code) {
    return `Token exchange with eBay failed (${code}) — please retry. If this persists, confirm Production EBAY_APP_ID / EBAY_CERT_ID / EBAY_RU_NAME match the eBay Developer Portal keyset.`;
  }
  return ERRORS.ebay_token_exchange_failed;
}

export function ResultBanner({
  success,
  error,
  ebayOauthError,
}: {
  success?: string;
  error?: string;
  /** Short eBay OAuth error from token exchange (e.g. invalid_code). */
  ebayOauthError?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const successSpec = success
    ? (SUCCESS[success] ?? { message: 'Connected.' })
    : null;
  const successMsg = successSpec?.message ?? null;
  const errorMsg = error
    ? error === 'ebay_token_exchange_failed'
      ? resolveEbayTokenExchangeMessage(ebayOauthError)
      : (ERRORS[error] ?? 'The connection could not be completed.')
    : null;

  useEffect(() => {
    if (successMsg) toast.success(successMsg);
    else if (errorMsg) toast.error(errorMsg);
    if (successMsg || errorMsg) {
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('error');
      url.searchParams.delete('ebay_oauth_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [successMsg, errorMsg]);

  if (dismissed || (!successMsg && !errorMsg)) return null;

  if (successMsg && successSpec) {
    return (
      <div className="relative">
        <IntegrationConnectSuccess
          message={successMsg}
          href={successSpec.href}
          linkLabel={successSpec.linkLabel}
        />
        <IconButton
          icon={<X className="h-3.5 w-3.5" />}
          ariaLabel="Dismiss"
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-2 shrink-0 text-text-success hover:text-text-success"
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border-danger bg-surface-danger px-3 py-2 text-text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1 text-role-caption">{errorMsg}</span>
      <IconButton
        icon={<X className="h-3.5 w-3.5" />}
        ariaLabel="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 opacity-60 hover:opacity-100"
      />
    </div>
  );
}
