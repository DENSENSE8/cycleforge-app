import { createHash } from 'node:crypto';
import { normalizeEnvValue, normalizeMultilineEnvValue } from '@/lib/env-utils';
import type { PhotoStorageAdapter, PutObjectInput, PutObjectResult, SignedUrlInput } from './types';

let storageClient: import('@google-cloud/storage').Storage | null = null;

function loadStorageCtor(): typeof import('@google-cloud/storage').Storage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@google-cloud/storage') as typeof import('@google-cloud/storage')).Storage;
}

/**
 * A service-account `private_key` pasted into the Vercel dashboard frequently
 * arrives with literal `\n` sequences instead of real newlines, which makes the
 * PEM invalid and causes v4 URL signing (and object reads) to throw — the exact
 * failure this used to hit silently. Route every key through the house
 * `normalizeMultilineEnvValue` helper (same fix `src/lib/google-auth.ts` applies
 * to the Sheets JWT) so signing always gets a well-formed PEM.
 */
function normalizeCredentialKey<T extends { private_key?: unknown }>(credentials: T): T {
  if (typeof credentials.private_key === 'string') {
    credentials.private_key = normalizeMultilineEnvValue(credentials.private_key);
  }
  return credentials;
}

function getStorage(): import('@google-cloud/storage').Storage {
  if (storageClient) return storageClient;
  const projectId = normalizeEnvValue(process.env.PHOTOS_GCS_PROJECT_ID) || undefined;
  const json = normalizeEnvValue(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  if (json) {
    try {
      const credentials = normalizeCredentialKey(JSON.parse(json) as Record<string, unknown>);
      storageClient = new (loadStorageCtor())({
        projectId: projectId || (credentials.project_id as string) || undefined,
        credentials,
      });
      return storageClient;
    } catch (err) {
      console.warn(
        '[gcs-adapter] GOOGLE_APPLICATION_CREDENTIALS_JSON is invalid; falling back to GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY',
        err instanceof Error ? err.message : err,
      );
    }
  }
  const clientEmail =
    normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL) ||
    normalizeEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY);
  if (clientEmail && privateKey) {
    storageClient = new (loadStorageCtor())({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });
    return storageClient;
  }
  storageClient = new (loadStorageCtor())({ projectId });
  return storageClient;
}

function hasGcsCredentials(): boolean {
  if (normalizeEnvValue(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)) return true;
  const clientEmail =
    normalizeEnvValue(process.env.GOOGLE_CLIENT_EMAIL) ||
    normalizeEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = normalizeMultilineEnvValue(process.env.GOOGLE_PRIVATE_KEY);
  return Boolean(clientEmail && privateKey);
}

/** Platform default when PHOTOS_GCS_BUCKET is unset — prod bucket exists; dev bucket may not. */
function gcsBucketEnvFallback(): string {
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  const useProdBucket =
    vercelEnv === 'production' ||
    vercelEnv === 'preview' ||
    process.env.NODE_ENV === 'production';
  return useProdBucket ? 'usav-photos-prod' : 'usav-photos-dev';
}

export function isGcsConfigured(): boolean {
  return hasGcsCredentials() && Boolean(defaultGcsBucket());
}

/** SoT bucket name — normalized env override, then prod/dev platform fallback. */
export function defaultGcsBucket(): string {
  const fromEnv = normalizeEnvValue(process.env.PHOTOS_GCS_BUCKET);
  return fromEnv || gcsBucketEnvFallback();
}

/** Per-org provider config.bucket with the same normalization + fallback chain. */
export function resolveGcsBucket(configBucket?: string | null): string {
  const fromConfig = normalizeEnvValue(configBucket ?? '');
  return fromConfig || defaultGcsBucket();
}

export const gcsAdapter: PhotoStorageAdapter = {
  provider: 'gcs',

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const storage = getStorage();
    const bucket = storage.bucket(input.bucket);
    const sha256Hex = createHash('sha256').update(input.buffer).digest('hex');

    await bucket.file(input.objectKey).save(input.buffer, {
      contentType: input.contentType,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=3600' },
    });

    if (input.thumbBuffer && input.thumbObjectKey) {
      await bucket.file(input.thumbObjectKey).save(input.thumbBuffer, {
        contentType: 'image/jpeg',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=3600' },
      });
    }

    return {
      bucket: input.bucket,
      objectKey: input.objectKey,
      thumbObjectKey: input.thumbObjectKey ?? null,
      fileSizeBytes: input.buffer.length,
      sha256Hex,
    };
  },

  async getSignedReadUrl(input: SignedUrlInput): Promise<string> {
    const storage = getStorage();
    const [url] = await storage.bucket(input.bucket).file(input.objectKey).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + input.ttlSeconds * 1000,
    });
    return url;
  },

  async getObjectBytes(input: { bucket: string; objectKey: string }): Promise<Buffer> {
    const storage = getStorage();
    const [buf] = await storage.bucket(input.bucket).file(input.objectKey).download();
    return buf;
  },

  async deleteObject(input: { bucket: string; objectKey: string }): Promise<void> {
    const storage = getStorage();
    await storage.bucket(input.bucket).file(input.objectKey).delete({ ignoreNotFound: true });
  },
};
