/** Next's "you read a request-scoped value during a static prerender" signal. */

export function isNextDynamicUsage(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('DYNAMIC_SERVER_USAGE');
}
