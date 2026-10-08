/**
 * Phone-card display law (operator 2026-10-08; SURFACE_LAW §4 desktop frame).
 *
 * An informational display on the desk — a notice, warning, status, error,
 * empty state or result — never stretches edge to edge as a square tinted
 * band: that "boxy" face reads as an alarm and makes the eye travel the whole
 * screen. It reads like the phone: one centred, phone-width column with the
 * big mobile corner. Inside a narrower host (popover, rail, the phone itself)
 * the cap is a no-op and the card simply fills it.
 */

import { cn } from '@/utils/_cn';
import { cornerClass } from './radius';

/** Centred, phone-width measure (`max-w-md`, the {@link MobileFirstFrame} phone column). */
export const PHONE_CARD_COLUMN = 'mx-auto w-full max-w-md';

/** The phone-card face: phone-width column + the mobile card corner. Add the tone's fill / border. */
export const PHONE_CARD_FACE = cn(PHONE_CARD_COLUMN, cornerClass('card'));
