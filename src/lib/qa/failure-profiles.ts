export const FAILURE_PROFILES = [
  'timeout',
  'http_400',
  'http_401',
  'http_403',
  'http_409',
  'http_429',
  'http_500',
  'malformed',
  'partial',
  'delayed',
  'duplicate_callback',
] as const;

export type FailureProfile = (typeof FAILURE_PROFILES)[number];
