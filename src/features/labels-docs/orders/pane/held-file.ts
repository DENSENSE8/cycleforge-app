'use client';

/**
 * Read a same-origin document's bytes BEFORE a delete, so the delete's Undo
 * can file the very same bytes again. A read that fails stops the delete
 * (nothing is removed that could not be put back).
 */
export async function holdFile(src: string, name: string): Promise<File> {
  const res = await fetch(src, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not read ${name} before removing it — nothing was removed.`);
  const blob = await res.blob();
  const type = blob.type || res.headers.get('content-type') || 'application/pdf';
  const extension = type === 'application/pdf' ? 'pdf' : type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : null;
  const filename = /\.[a-z0-9]{2,4}$/i.test(name) || !extension ? name : `${name}.${extension}`;
  return new File([blob], filename, { type });
}
