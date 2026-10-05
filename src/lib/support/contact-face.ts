/**
 * The ONE face a Support surface prints for the customer (record header, list
 * row, alerts, inbox, banner, Timeline, phone sheet). Marketplace / private
 * relay addresses (`…@members.ebay.com`) are routing identifiers: they stay in
 * the data (Copy & open, transports) and never reach the screen — the face
 * says "eBay relay email" instead (`classifyEmail`, the same rule Outbound uses).
 * Pure and client-safe.
 */

import { classifyEmail, type ClassifiedEmail } from '@/lib/customers/classified-email';

export interface SupportContactInput {
  name?: string | null;
  email?: string | null;
  handle?: string | null;
}

export interface SupportContactFace {
  /** What a surface prints first: the buyer's name, else a real email, else the handle, else the relay label. Null = nobody known. */
  label: string | null;
  /** A second line when the first is a name: the real email, else the relay label. Never a relay address. */
  detail: string | null;
  /** A non-relay email a human may read and copy; null for relay addresses. */
  email: string | null;
  /** Set when the stored address is a relay. */
  relay: ClassifiedEmail | null;
}

const EMAIL_IN_TEXT = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * Replace every relay address inside free text with its label
 * ("Reply to abc@members.ebay.com" → "Reply to eBay relay email"). Real
 * addresses are left alone.
 */
export function scrubRelayAddresses(text: string): string {
  return text.replace(EMAIL_IN_TEXT, (address) => classifyEmail(address)?.label ?? address);
}

/** A name / handle that is itself a relay address is not a name. */
function nameOrNull(value: string | null | undefined): string | null {
  const text = clean(value);
  if (!text) return null;
  if (classifyEmail(text) && text.includes('@')) return null;
  return scrubRelayAddresses(text);
}

export function supportContactFace(input: SupportContactInput): SupportContactFace {
  const name = nameOrNull(input.name);
  const handle = nameOrNull(input.handle);
  const rawEmail = clean(input.email);
  const relay = classifyEmail(rawEmail);
  const email = rawEmail && !relay ? rawEmail : null;
  const label = name ?? email ?? handle ?? relay?.label ?? null;
  const detail = label === name && name ? (email ?? relay?.label ?? null) : label === handle && handle ? (relay?.label ?? null) : null;
  return { label, detail, email, relay };
}

/** One line: "Jane Doe · eBay relay email", "jane@x.com", "eBay relay email", or null. */
export function supportContactLine(input: SupportContactInput): string | null {
  const face = supportContactFace(input);
  if (!face.label) return null;
  return face.detail ? `${face.label} · ${face.detail}` : face.label;
}
