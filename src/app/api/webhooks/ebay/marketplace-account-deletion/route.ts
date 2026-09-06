/**
 * GET/POST /api/webhooks/ebay/marketplace-account-deletion
 *
 * eBay Marketplace Account Deletion / Closure notification endpoint.
 * Required to unlock Production keysets in the eBay Developer Portal.
 *
 * Public HTTPS URL (must match portal + EBAY_MARKETPLACE_DELETION_ENDPOINT_URL):
 *   https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion
 *
 * Auth: anonymous webhook under /api/webhooks/* (proxy exemption). Gate is the
 * challenge verification token (GET) + X-EBAY-SIGNATURE (POST). POST signature
 * verification is mandatory — without EBAY_APP_ID + EBAY_CERT_ID the endpoint
 * returns 503 rather than purging on an unverified body (production has no
 * override; non-production needs ALLOW_UNSIGNED_WEBHOOKS=1).
 *
 * Developer-portal note: configuring this URL requires an eBay Developer
 * Program team member with Admin (or equivalent) access on the application.
 * Cycle Forge OAuth account_role (seller|buyer) is unrelated — both are purged
 * when eBay notifies for that ebay_user_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  buildChallengeResponse,
  extractDeletionSubjects,
  getMarketplaceDeletionConfig,
  isValidVerificationToken,
  purgeEbayUserData,
  verifyEbayNotificationSignature,
  type MarketplaceDeletionNotification,
} from '@/lib/ebay/marketplace-account-deletion';
import { checkRateLimitAsync } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

/**
 * Challenge handshake — eBay fires this when you Save the endpoint in
 * Application Keys → Marketplace account deletion/closure.
 */
export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get('challenge_code');
  if (!challengeCode) {
    return NextResponse.json(
      { ok: true, endpoint: 'ebay.marketplace_account_deletion' },
      { status: 200 },
    );
  }

  const config = getMarketplaceDeletionConfig();
  if (!config.verificationToken || !isValidVerificationToken(config.verificationToken)) {
    console.error(
      '[ebay/marketplace-account-deletion] EBAY_VERIFICATION_TOKEN missing or invalid (need 32–80 [A-Za-z0-9_-])',
    );
    return NextResponse.json({ error: 'Verification token not configured' }, { status: 500 });
  }

  const challengeResponse = buildChallengeResponse(
    challengeCode,
    config.verificationToken,
    config.endpointUrl,
  );

  return NextResponse.json(
    { challengeResponse },
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/**
 * Deletion notification. Ack with 200 ASAP; eBay retries for 24h on non-ack,
 * then marks the endpoint down.
 */
export async function POST(req: NextRequest) {
  // IP rate limit before any body/crypto work — this is an unauthenticated
  // route whose sink hard-deletes rows, so cap it like the sibling receivers.
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'webhooks-ebay-account-deletion',
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  const rawBody = await req.text();
  let payload: MarketplaceDeletionNotification;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as MarketplaceDeletionNotification) : {};
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  const signatureHeader =
    req.headers.get('x-ebay-signature') ?? req.headers.get('X-EBAY-SIGNATURE');
  const config = getMarketplaceDeletionConfig();

  // Signature verification is MANDATORY: the sink below hard-deletes
  // ebay_accounts rows in ANY org, keyed on a public seller username. An
  // unconfigured keyset therefore parks the endpoint (503) instead of falling
  // through unverified. In production there is no override at all; outside
  // production an operator must opt in explicitly with ALLOW_UNSIGNED_WEBHOOKS=1
  // (unset ⇒ closed) so a forgotten env var can never open it by itself.
  if (!config.appId || !config.certId) {
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.ALLOW_UNSIGNED_WEBHOOKS === '1'
    ) {
      console.warn(
        '[ebay/marketplace-account-deletion] EBAY_APP_ID/EBAY_CERT_ID unset — processing UNVERIFIED notification (ALLOW_UNSIGNED_WEBHOOKS=1, non-production)',
      );
    } else {
      console.error(
        '[ebay/marketplace-account-deletion] EBAY_APP_ID/EBAY_CERT_ID unset — cannot verify signature, refusing to purge',
      );
      return NextResponse.json(
        { error: 'Signature verification unavailable' },
        { status: 503 },
      );
    }
  } else {
    if (!signatureHeader) {
      return NextResponse.json({ error: 'Missing X-EBAY-SIGNATURE' }, { status: 412 });
    }
    try {
      const ok = await verifyEbayNotificationSignature(
        rawBody,
        signatureHeader,
        config,
        payload,
      );
      if (!ok) {
        console.warn('[ebay/marketplace-account-deletion] invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 412 });
      }
    } catch (err) {
      console.warn(
        '[ebay/marketplace-account-deletion] signature verify failed:',
        err instanceof Error ? err.message : err,
      );
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 412 });
    }
  }

  const topic = payload?.metadata?.topic;
  if (topic && topic !== 'MARKETPLACE_ACCOUNT_DELETION') {
    // Ack unknown topics so eBay does not mark the endpoint down.
    return NextResponse.json({ ok: true, ignored: topic });
  }

  const { userId, username, notificationId } = extractDeletionSubjects(payload);
  if (!userId && !username) {
    return NextResponse.json({ ok: true, purged: 0, reason: 'no_subject' });
  }

  try {
    const purged = await purgeEbayUserData({ userId, username, notificationId });
    return NextResponse.json({
      ok: true,
      purged: purged.length,
      accounts: purged.map((p) => ({
        organizationId: p.organizationId,
        accountId: p.accountId,
        accountName: p.accountName,
        accountRole: p.accountRole,
      })),
    });
  } catch (err) {
    console.error(
      '[ebay/marketplace-account-deletion] purge failed:',
      err instanceof Error ? err.message : err,
    );
    // Still ack — eBay retries amplify load; ops can reconcile from logs/audit.
    // Returning 5xx for 24h would mark the endpoint down and block prod keysets.
    return NextResponse.json({ ok: true, purged: 0, error: 'purge_failed' });
  }
}
