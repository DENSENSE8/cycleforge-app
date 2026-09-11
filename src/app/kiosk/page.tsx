/**
 * /kiosk — same consult catalog shell as `/kiosk/v2`.
 *
 * Callers: public `/kiosk`. Affected API: POST `/api/kiosk/dev-autopair` then
 * device-authed catalog. Data schemas: none.
 * User: "Remove the welcome, how can we help you? This does not matter, I do
 * not need it."
 */

export { default } from './v2/page';
