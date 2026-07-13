import { test, expect } from '@playwright/test';

const RECEIVING_ID = Number(process.env.PW_TEST_RECEIVING_ID || '1');
const EXPECTED_BUCKET = process.env.PHOTOS_GCS_BUCKET?.trim().replace(/^['"]|['"]$/g, '') || 'usav-photos-prod';

// Minimal valid 1×1 JPEG — same fixture as unit-photo-scan.spec.ts.
const TINY_JPEG = Buffer.from(
  '/9j/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

/**
 * Photos platform E2E — GCS adapter upload path (mobile unboxing + library).
 * Requires .env with PHOTOS_GCS_BUCKET + Google credentials; opt in via E2E_PHOTOS_GCS=1.
 */
test.describe('Photos GCS platform', () => {
  test.skip(!process.env.E2E_PHOTOS_GCS, 'Set E2E_PHOTOS_GCS=1 to run photo platform E2E');

  test('photo library page loads for authenticated staff', async ({ page }) => {
    await page.goto('/ops/photos');
    await expect(page.getByRole('heading', { name: /media library/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('share pack public route returns 404 for bogus token', async ({ request }) => {
    const res = await request.get('/api/photos/share-packs/not-a-real-token');
    expect(res.status()).toBe(404);
  });

  test('receiving GCS upload round-trip (mobile /api/photos/upload path)', async ({ request }) => {
    expect(EXPECTED_BUCKET).toBe('usav-photos-prod');

    const upload = await request.post('/api/photos/upload', {
      multipart: {
        entityType: 'RECEIVING',
        entityId: String(RECEIVING_ID),
        photoType: 'receiving_package',
        file: { name: 'e2e-unboxing.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
      },
    });
    const uploadText = await upload.text();
    expect(upload.status(), uploadText).toBe(200);
    const uploaded = JSON.parse(uploadText) as { id: number; url: string; thumbUrl: string };
    const photoId = Number(uploaded.id);
    expect(photoId).toBeGreaterThan(0);
    expect(String(uploaded.url || '')).toMatch(/^https?:\/\/|^\/api\/photos\//);

    try {
      const listRes = await request.get(
        `/api/receiving-photos?receivingId=${RECEIVING_ID}&scope=po`,
      );
      expect(listRes.ok()).toBeTruthy();
      const list = (await listRes.json()) as { photos: Array<{ id: number; photoUrl: string }> };
      const row = list.photos.find((p) => p.id === photoId);
      expect(row, 'uploaded photo should appear in receiving-photos GET').toBeTruthy();
      expect(String(row!.photoUrl)).toMatch(/^https?:\/\/|^\/api\/photos\//);

      const contentRes = await request.get(`/api/photos/${photoId}/content`, {
        maxRedirects: 0,
      });
      expect([200, 302]).toContain(contentRes.status());
    } finally {
      const del = await request.delete(`/api/photos/${photoId}`);
      expect(del.ok()).toBeTruthy();
    }
  });
});
