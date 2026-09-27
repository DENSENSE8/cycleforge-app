import { z } from 'zod';

/** Customer contact writes: */

/** Digits a non-empty phone needs — same floor `parseLegacyContactInfo` uses. */
const MIN_PHONE_DIGITS = 7;

const phone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === '' || v.replace(/\D/g, '').length >= MIN_PHONE_DIGITS, {
    message: `Phone needs at least ${MIN_PHONE_DIGITS} digits`,
  });

const email = z.union([z.literal(''), z.string().trim().email('Email is not a valid address').max(200)]);

const name = z.string().trim().min(1, 'Name cannot be blank').max(200);

/** Fields a contact correction may set. Blank phone/email clears the column. */
export const CustomerContactPatchBody = z
  .object({
    name: name.optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    phone: phone.nullable().optional(),
    email: email.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Nothing to change' });
export type CustomerContactPatch = z.infer<typeof CustomerContactPatchBody>;

/** A new customer typed on the phone for a repair that has none. */
export const RepairCustomerCreateBody = z
  .object({
    name,
    phone: phone.optional().default(''),
    email: email.optional().default(''),
  })
  .strict();
export type RepairCustomerCreate = z.infer<typeof RepairCustomerCreateBody>;

/** Point a repair at an existing customer of the same org. */
export const RepairCustomerLinkBody = z.object({ customerId: z.number().int().positive() }).strict();

const addressLine = (max: number) => z.string().trim().max(max).optional().default('');

/** A ship-to typed on the phone — `customers.shipping_*`, which `order-ship-to.ts` reads for rates and labels. */
export const CustomerShipToBody = z
  .object({
    address1: addressLine(200),
    address2: addressLine(200),
    city: addressLine(100),
    state: addressLine(60),
    postalCode: addressLine(20),
    country: addressLine(60),
  })
  .strict();
export type CustomerShipTo = z.infer<typeof CustomerShipToBody>;

/** `POST /api/customers` — a customer typed on the phone (manual phone order, gap 3). */
export const CustomerCreateBody = z
  .object({
    name,
    phone: phone.optional().default(''),
    email: email.optional().default(''),
    shipTo: CustomerShipToBody.optional(),
  })
  .strict();
export type CustomerCreate = z.infer<typeof CustomerCreateBody>;

/** The contact columns of a `customers` row this module reads and writes. */
export interface CustomerContactColumns {
  customer_name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

/** "Jane Q Doe" → first "Jane", last "Q Doe" — the split `createRepairCustomer` stores. */
export function splitCustomerName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

/** The column writes that turn `before` into what `patch` asks for — only the columns whose value actually changes, so an unchanged save… */
export function customerContactColumns(
  before: CustomerContactColumns,
  patch: CustomerContactPatch,
): { ok: true; columns: Partial<CustomerContactColumns> } | { ok: false; error: string } {
  const next: Partial<CustomerContactColumns> = {};

  if (patch.name !== undefined) {
    const split = splitCustomerName(patch.name);
    next.display_name = patch.name;
    next.customer_name = patch.name;
    next.first_name = patch.firstName ?? split.first;
    next.last_name = patch.lastName ?? split.last;
  } else if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const first = (patch.firstName ?? before.first_name ?? '').trim();
    const last = (patch.lastName ?? before.last_name ?? '').trim();
    const full = [first, last].filter(Boolean).join(' ');
    if (!full) return { ok: false, error: 'Name cannot be blank' };
    next.first_name = first;
    next.last_name = last;
    next.display_name = full;
    next.customer_name = full;
  }
  if (patch.phone !== undefined) next.phone = patch.phone || null;
  if (patch.email !== undefined) next.email = patch.email || null;

  const columns: Partial<CustomerContactColumns> = {};
  for (const key of Object.keys(next) as (keyof CustomerContactColumns)[]) {
    if ((next[key] ?? null) !== (before[key] ?? null)) columns[key] = next[key] ?? null;
  }
  return { ok: true, columns };
}
