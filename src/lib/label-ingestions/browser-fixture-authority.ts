import 'server-only';

const browserFixtureSession: unique symbol = Symbol('browserFixtureSession');
export type BrowserFixtureSession = { readonly [browserFixtureSession]: true };

/**
 * The composition root may hand this opaque capability to browser adapters
 * only on an explicitly enabled non-production test server. A query string,
 * localStorage value, or public environment variable cannot mint it.
 */
export function createBrowserFixtureSession(): BrowserFixtureSession {
  if (process.env.NODE_ENV === 'production' || process.env.CYCLEFORGE_BROWSER_FIXTURE_TEST_MODE !== 'enabled') {
    throw new Error('Browser fixture adapters are disabled outside the authorized test server.');
  }
  return { [browserFixtureSession]: true };
}
