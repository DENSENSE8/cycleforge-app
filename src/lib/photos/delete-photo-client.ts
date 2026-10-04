import { deleteNasPhoto, isNasPhotoUrl } from '@/lib/nas-photos';

/**
 * Delete a photo from a browser surface. NAS originals are removed directly
 * first (best effort), then the authenticated API removes the database row and
 * any managed blob objects. Feature components own confirmation and rollback.
 */
export async function deletePhoto(photoId: number, url: string | undefined): Promise<void> {
  if (url && isNasPhotoUrl(url)) {
    const nasDelete = await deleteNasPhoto(url);
    if (!nasDelete.ok) console.warn('NAS file delete failed:', nasDelete.error);
  }

  const response = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `HTTP ${response.status}`);
  }
}
