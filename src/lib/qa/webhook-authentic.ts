/**
 * Provider-authentic Zoho webhook delivery.
 *
 * Signs a stored payload with THIS org's webhook secret and runs it through
 * processZohoWebhook (resolve token → HMAC → normalize → dedupe → dispatch).
 * That is the production path. Application replay (dispatchWebhookEvent only)
 * is a different tool and is never labeled authentic.
 *
 * A successful authentic delivery of an already-reserved event_id is still
 * proof of signature + org routing; dispatch is skipped by the production
 * dedupe ledger (deduped: true).
 */

import { NextRequest } from 'next/server';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  type ZohoCredentials,
} from '@/lib/integrations/credentials';
import { processZohoWebhook } from '@/lib/zoho/webhooks/process';
import { signZohoWebhookBody, verifyZohoWebhookSignature } from '@/lib/zoho/webhooks/verify';
import { loadStoredWebhookEnvelope } from './webhook-replay';
import { redactRecord } from './redact';
import { hashPayload } from './test-run-id';

export type AuthenticWebhookExpect = 'accepted' | 'rejected_signature';

export function freshAuthenticEventId(now = Date.now()): string {
  return `qa-auth-${now.toString(36)}`;
}

export interface AuthenticWebhookResult {
  authentic: true;
  label: 'Provider-authentic signed delivery';
  verified: boolean;
  httpStatus: number;
  tokenPath: string;
  requestHash: string;
  eventId: string;
  body: Record<string, unknown>;
  notes: string[];
}

export interface ZohoWebhookIdentity {
  token: string;
  secret: string;
}

export interface AuthenticWebhookDeps {
  loadIdentity: (orgId: OrgId) => Promise<ZohoWebhookIdentity | null>;
  loadRawBody: (orgId: OrgId, eventId: string) => Promise<string>;
  process: (request: NextRequest, token: string) => Promise<{ status: number; body: unknown }>;
}

async function defaultLoadIdentity(orgId: OrgId): Promise<ZohoWebhookIdentity | null> {
  const creds = await getIntegrationCredentials<ZohoCredentials>(orgId, 'zoho');
  if (!creds?.webhookToken || !creds?.webhookSecret) return null;
  return { token: creds.webhookToken, secret: creds.webhookSecret };
}

async function defaultLoadRawBody(orgId: OrgId, eventId: string): Promise<string> {
  const row = await loadStoredWebhookEnvelope(orgId, eventId);
  return JSON.stringify(row.raw_payload ?? {});
}

async function defaultProcess(request: NextRequest, token: string): Promise<{ status: number; body: unknown }> {
  const res = await processZohoWebhook(request, { token });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { parseError: true };
  }
  return { status: res.status, body };
}

const defaultDeps: AuthenticWebhookDeps = {
  loadIdentity: defaultLoadIdentity,
  loadRawBody: defaultLoadRawBody,
  process: defaultProcess,
};

export function buildSignedZohoWebhookRequest(args: {
  token: string;
  rawBody: string;
  signature: string;
}): NextRequest {
  const url = `https://qa.cycleforge.local/api/zoho/webhooks/${encodeURIComponent(args.token)}`;
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-zoho-webhook-signature': args.signature,
    },
    body: args.rawBody,
  });
}

export async function deliverAuthenticZohoWebhook(
  orgId: OrgId,
  input: {
    eventId?: string;
    envelope?: Record<string, unknown>;
    mintFreshEventId?: boolean;
    expect?: AuthenticWebhookExpect;
  },
  deps: AuthenticWebhookDeps = defaultDeps,
): Promise<AuthenticWebhookResult> {
  const identity = await deps.loadIdentity(orgId);
  if (!identity) {
    throw new Error(
      'Zoho webhook token/secret are not provisioned on this organization. Connect Zoho and mint the per-tenant webhook identity first.',
    );
  }

  let rawBody: string;
  if (input.envelope) {
    rawBody = JSON.stringify(input.envelope);
  } else if (input.eventId) {
    rawBody = await deps.loadRawBody(orgId, input.eventId);
  } else {
    throw new Error('eventId or envelope is required');
  }
  if (input.mintFreshEventId) {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    parsed.event_id = freshAuthenticEventId();
    rawBody = JSON.stringify(parsed);
  }
  const expect = input.expect ?? 'accepted';
  const signingSecret = expect === 'rejected_signature' ? 'qa-wrong-secret' : identity.secret;
  const signature = signZohoWebhookBody(rawBody, signingSecret);
  const localVerify = verifyZohoWebhookSignature(
    rawBody,
    new Headers({ 'x-zoho-webhook-signature': signature }),
    { secret: identity.secret },
  );

  const request = buildSignedZohoWebhookRequest({
    token: identity.token,
    rawBody,
    signature,
  });
  const processed = await deps.process(request, identity.token);
  const body = redactRecord(processed.body ?? {});

  const notes: string[] = [
    'Signed with HMAC-SHA256 of the raw body (same function production verifies).',
    `Token path /api/zoho/webhooks/{token} — org resolved from the URL, not the envelope.`,
  ];
  if (expect === 'rejected_signature') {
    notes.push('Signed with a wrong secret on purpose. Production must reject this as 401.');
  } else if (body.deduped === true) {
    notes.push('event_id was already reserved — dispatch skipped. Signature and org routing still ran.');
  }

  return {
    authentic: true,
    label: 'Provider-authentic signed delivery',
    verified: localVerify.ok,
    httpStatus: processed.status,
    tokenPath: `/api/zoho/webhooks/${identity.token.slice(0, 6)}…`,
    requestHash: hashPayload(rawBody),
    eventId: String(
      (JSON.parse(rawBody) as { event_id?: string }).event_id
        ?? input.eventId
        ?? 'unknown',
    ),
    body,
    notes,
  };
}
