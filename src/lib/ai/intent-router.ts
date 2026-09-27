import { normalizeTrackingCanonical } from '@/lib/tracking-format';

export type IntentDomain =
  | 'orders'
  | 'shipped'
  | 'staff'
  | 'repair'
  | 'receiving'
  | 'fba'
  | 'inventory'
  | 'exceptions'
  | 'photos'
  | 'bose_manual';

export type IntentParams = {
  staffName?: string;
  orderId?: string;
  trackingNumber?: string;
  sku?: string;
  ticketNumber?: string;
  repairStatus?: string;
  poRef?: string;
  damageDetected?: boolean;
  rawQuery?: string;
  modelNumber?: string;
};

const STAFF_QUESTION_HINTS = [
  /\bwho\b/i,
  /\bhow is\b/i,
  /\bhow's\b/i,
  /\bdoing\b/i,
  /\bhit their goal\b/i,
  /\bperformance\b/i,
];

const REPAIR_STATUS_MAP: Array<[RegExp, string]> = [
  [/\bwaiting for parts\b/i, 'waiting_for_parts'],
  [/\bout of stock\b/i, 'waiting_for_parts'],
  [/\bpending repair\b/i, 'Pending Repair'],
  [/\brepaired\b/i, 'Repaired, Contact Customer'],
  [/\bawaiting pickup\b/i, 'Awaiting Pickup'],
  [/\bpicked up\b/i, 'Picked Up'],
  [/\bshipped\b/i, 'Shipped'],
  [/\bdone\b/i, 'Done'],
];

export function extractParams(message: string, intents: IntentDomain[]): IntentParams {
  const params: IntentParams = {};
  const text = message.trim();

  const orderIdMatch =
    text.match(/\border\s*#?\s*([A-Z0-9-]{4,})\b/i) ||
    text.match(/\b(1\d{2}-\d{4,}-\d{4,})\b/) ||
    text.match(/\b#([A-Z0-9-]{4,})\b/);
  if (orderIdMatch?.[1]) {
    params.orderId = orderIdMatch[1].trim();
  }

  const trackingMatch =
    text.match(/\b(1Z[0-9A-Z]{16,})\b/i) ||
    text.match(/\b(9[0-9A-Z]{15,30})\b/i) ||
    text.match(/\b([A-Z]{2}[0-9]{9}[A-Z]{2})\b/i);
  if (trackingMatch?.[1]) {
    params.trackingNumber = normalizeTrackingCanonical(trackingMatch[1]);
  }

  const skuMatch =
    text.match(/\bsku\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{1,})\b/i) ||
    text.match(/\bstock for\s+([A-Z0-9][A-Z0-9._/-]{1,})\b/i);
  if (skuMatch?.[1]) {
    params.sku = skuMatch[1].trim();
  }

  const ticketMatch =
    text.match(/\bticket\s*[:#-]?\s*([A-Z]{1,5}-?\d{1,6})\b/i) ||
    text.match(/\b(RS-?\d{1,6})\b/i);
  if (ticketMatch?.[1]) {
    params.ticketNumber = ticketMatch[1].trim().toUpperCase();
  }

  for (const [pattern, value] of REPAIR_STATUS_MAP) {
    if (pattern.test(text)) {
      params.repairStatus = value;
      break;
    }
  }

  if (intents.includes('photos') || intents.includes('receiving')) {
    const poMatch = text.match(/\bpo\s*#?\s*(\d[\d-]{0,20})\b/i);
    if (poMatch?.[1]) params.poRef = poMatch[1].trim();
  }

  if (intents.includes('photos')) {
    params.rawQuery = text;
    if (/\bdamage(d)?\b/i.test(text)) params.damageDetected = true;
  }

  if (intents.includes('bose_manual')) {
    params.rawQuery = text;
    const modelMatch =
      text.match(/\bbose\s+(\d{2,4}[A-Z]?(?:\s*series\s*[IVX\d]+)?)/i) ||
      text.match(/\b(acoustimass|lifestyle|soundtouch|sounddock|soundlink|wave\s*radio|freespace|roommate)\s*(\d{0,4})/i);
    if (modelMatch) {
      params.modelNumber = (modelMatch[1] + (modelMatch[2] || '')).trim();
    }
  }

  if (intents.includes('staff') || STAFF_QUESTION_HINTS.some((pattern) => pattern.test(text))) {
    const staffMatch =
      text.match(/\b(?:how is|how's|is|show|tell me about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) ||
      text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:doing|performing)\b/);
    if (staffMatch?.[1]) {
      params.staffName = staffMatch[1].trim();
    }
  }

  return params;
}
