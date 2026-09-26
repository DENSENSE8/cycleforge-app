import { timingSafeEqual } from 'node:crypto';

/** Constant-time string equality for shared-secret / bearer-token checks. */
export function safeStrEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
