/**
 * The "product sent to customer" token — how a pick from the ticket composer's
 * `+` → "Product sent to customer" rides inside a comment body.
 *
 *   [[product:<skuCatalogId>|<role>|<qty>]]
 *
 * The token names the product BY REFERENCE (task-principles P6): it carries the
 * catalog id, never a copied title or photo, so the thread card reads the
 * identity title / photo / SKU at view time. The structured row in
 * `support_ticket_items` stays the system of record (P7); the token only says
 * where in the comment the card belongs.
 *
 * Zendesk derives a comment's stored `body` from `html_body` (verified
 * 2026-10-03 against ticket #10092), so the customer email — and the mirrored
 * body — carry the READABLE line from {@link productTokenReadable}, never the
 * raw token. {@link stripSentProductLines} removes that readable line again when
 * the thread paints the card for the same item from its log row.
 *
 * Client-safe: no DB, no React.
 */

export const TICKET_ITEM_ROLES = ['replacement', 'return', 'exchange', 'sent'] as const;
export type TicketItemRole = (typeof TICKET_ITEM_ROLES)[number];

export const TICKET_ITEM_ROLE_LABEL: Record<TicketItemRole, string> = {
  replacement: 'Replacement',
  return: 'Return',
  exchange: 'Exchange',
  sent: 'Sent',
};

/** The composer's default role (owner 2026-10-03). */
export const DEFAULT_TICKET_ITEM_ROLE: TicketItemRole = 'replacement';

/** A qty past this is a typo, not a shipment. */
export const TICKET_ITEM_MAX_QTY = 999;

export interface ProductTokenRef {
  skuCatalogId: number;
  role: TicketItemRole;
  qty: number;
}

/** What a reader needs to say the product out loud (identity title + SKU). */
export interface ProductTokenFace {
  title: string;
  sku: string;
}

export function isTicketItemRole(v: unknown): v is TicketItemRole {
  return typeof v === 'string' && (TICKET_ITEM_ROLES as readonly string[]).includes(v);
}

/** Global regex source shared with the inline markdown tokenizer. */
export const PRODUCT_TOKEN_SOURCE = String.raw`\[\[product:(\d{1,10})\|(replacement|return|exchange|sent)\|(\d{1,4})\]\]`;

function validRef(skuCatalogId: number, role: string, qty: number): ProductTokenRef | null {
  if (!Number.isSafeInteger(skuCatalogId) || skuCatalogId <= 0) return null;
  if (!isTicketItemRole(role)) return null;
  if (!Number.isInteger(qty) || qty < 1 || qty > TICKET_ITEM_MAX_QTY) return null;
  return { skuCatalogId, role, qty };
}

/** Build a token from its three parts; throws on an invalid ref (a caller bug). */
export function serializeProductToken(ref: ProductTokenRef): string {
  const ok = validRef(ref.skuCatalogId, ref.role, ref.qty);
  if (!ok) throw new Error(`invalid product token ref: ${JSON.stringify(ref)}`);
  return `[[product:${ok.skuCatalogId}|${ok.role}|${ok.qty}]]`;
}

/** Parse ONE whole token string (`[[product:…]]`); `null` for anything else. */
export function parseProductToken(raw: string): ProductTokenRef | null {
  const m = new RegExp(`^${PRODUCT_TOKEN_SOURCE}$`).exec(raw.trim());
  if (!m) return null;
  return validRef(Number(m[1]), m[2], Number(m[3]));
}

/** Every valid token in a body, in order. */
export function parseProductTokens(text: string): ProductTokenRef[] {
  const out: ProductTokenRef[] = [];
  const re = new RegExp(PRODUCT_TOKEN_SOURCE, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text ?? ''))) !== null) {
    const ref = validRef(Number(m[1]), m[2], Number(m[3]));
    if (ref) out.push(ref);
  }
  return out;
}

/**
 * Append picks to a draft — one token per line after a blank line, so each
 * becomes its own paragraph (its own card in the thread, its own line in the
 * email). An empty draft is just the tokens.
 */
export function appendProductTokens(body: string, refs: readonly ProductTokenRef[]): string {
  if (refs.length === 0) return body;
  const tokens = refs.map(serializeProductToken).join('\n\n');
  const head = body.trimEnd();
  return head ? `${head}\n\n${tokens}` : tokens;
}

/** "Replacement × 1 — Bose SoundLink Mini II (SKU 12345)" — what the customer reads. */
export function productTokenReadable(ref: Pick<ProductTokenRef, 'role' | 'qty'>, face: ProductTokenFace | null): string {
  const head = `${TICKET_ITEM_ROLE_LABEL[ref.role]} × ${ref.qty}`;
  if (!face) return head;
  const title = face.title.trim();
  const sku = face.sku.trim();
  if (!sku) return `${head} — ${title}`;
  return title && title !== sku ? `${head} — ${title} (SKU ${sku})` : `${head} — SKU ${sku}`;
}

/**
 * Drop the readable lines {@link productTokenReadable} wrote for `items` from a
 * (Zendesk-round-tripped) body, so the thread shows the card once instead of
 * card + sentence. Matches on role, qty and SKU only — the title may have been
 * edited since; each SKU character may arrive backslash-escaped by the
 * helpdesk's HTML→text pass (`\_`).
 */
export function stripSentProductLines(
  body: string,
  items: ReadonlyArray<{ role: TicketItemRole; qty: number; sku: string }>,
): string {
  if (items.length === 0) return body;
  const lit = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = items.map((it) => {
    const head = lit(`${TICKET_ITEM_ROLE_LABEL[it.role]} × ${it.qty}`);
    const sku = [...it.sku.trim()].map((c) => `\\\\?${lit(c)}`).join('');
    return new RegExp(`^\\s*${head} — (?:.*\\(SKU ${sku}\\)|SKU ${sku})\\s*$`);
  });
  const kept = String(body ?? '')
    .split(/\r?\n/)
    .filter((line) => !patterns.some((re) => re.test(line)));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
