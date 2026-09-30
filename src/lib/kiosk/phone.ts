/**
 * The ONE phone shape a person's number is typed into — `555-867-5309`.
 *
 * Its own session-free module so every intake that takes a phone (kiosk
 * contact step, desk repair intake, local pickup) formats through the same
 * function without importing the kiosk cart store. Formatting on the way in
 * means every channel writes the same string, so a lookup by phone matches
 * whichever surface took the customer's details.
 *
 * Callers: `KioskCustomerIntake` (re-exports it), `CustomerInfoForm`.
 * Affected API: none. Schemas: none.
 */
export function formatKioskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
