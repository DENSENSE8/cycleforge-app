/**
 * Test-label mode — the guard that keeps development and sandbox orgs from
 * ever buying (or voiding) real postage.
 *
 * ShipStation API v2's only documented free label path is a SANDBOX key
 * (prefixed `TEST_`, https://docs.shipstation.com/sandbox). `test_label` is
 * no longer in the v2 label schema, and ShipStation-platform accounts have no
 * sandbox at all, so a live key with `test_label: true` is NOT verifiably
 * free. Test mode therefore:
 *   • is on whenever NODE_ENV !== 'production' or the org is a sandbox org;
 *   • refuses every label purchase and void unless the engine key is a
 *     sandbox key (checked before any request leaves the process);
 *   • still sends `test_label: true` on `POST /labels` (belt and braces);
 *   • prefers `SHIPSTATION_SANDBOX_API_KEY` (a `TEST_` key) over the org's
 *     stored key, so a developer can run the whole flow against the sandbox.
 * Rates are free in every mode and are never blocked.
 */

export const SHIPSTATION_SANDBOX_KEY_PREFIX = 'TEST_';
/** The env var a developer sets to run label purchases against the ShipStation sandbox. */
export const SHIPSTATION_SANDBOX_KEY_ENV = 'SHIPSTATION_SANDBOX_API_KEY';

export function isShipStationSandboxKey(apiKey: string | null | undefined): boolean {
  return typeof apiKey === 'string' && apiKey.trim().startsWith(SHIPSTATION_SANDBOX_KEY_PREFIX);
}

/** True when this process + org may only ever buy test labels. */
export function labelTestModeRequired(nodeEnv: string | undefined, orgIsSandbox: boolean): boolean {
  return nodeEnv !== 'production' || orgIsSandbox;
}

/** The sandbox key to use in test mode (null when unset or not a `TEST_` key). */
export function sandboxKeyFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const key = env[SHIPSTATION_SANDBOX_KEY_ENV]?.trim();
  return key && isShipStationSandboxKey(key) ? key : null;
}

export const TEST_MODE_BLOCKED_MESSAGE =
  `Test-label mode: this environment only buys or voids ShipStation TEST labels, and the connected ShipStation key is a live key — nothing was bought or voided. Set ${SHIPSTATION_SANDBOX_KEY_ENV} to a ShipStation sandbox key (TEST_…) to run labels here.`;
