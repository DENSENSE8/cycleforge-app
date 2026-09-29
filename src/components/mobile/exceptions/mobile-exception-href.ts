import { MOBILE_EXCEPTIONS_PATH } from '@/lib/exceptions/types';
import { withJobReturn } from '@/lib/mobile/nav-trail';

/** The phone record route for one exception; `back` is the list it was opened from (the record's X). */
export function mobileExceptionHref(key: string, back?: string): string {
  const href = `${MOBILE_EXCEPTIONS_PATH}/${encodeURIComponent(key)}`;
  return back ? withJobReturn(href, back) : href;
}
