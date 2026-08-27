/** Pure helpers for the header work-order chip. No React. */

/**
 * True when the header would duplicate the entity already open in the page.
 * Strips query + trailing slash; rejects `/` so a bad sourcePath never hides the chip globally.
 */
export function isOnWorkOrderSourcePath(pathname: string, sourcePath: string): boolean {
  const pathOnly = sourcePath.split('?')[0]?.replace(/\/$/, '') || '';
  if (!pathOnly || pathOnly === '/') return false;
  const current = pathname.replace(/\/$/, '') || '/';
  return current === pathOnly || current.startsWith(`${pathOnly}/`);
}
