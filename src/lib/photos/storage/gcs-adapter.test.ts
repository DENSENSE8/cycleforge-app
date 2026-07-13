import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultGcsBucket,
  isGcsConfigured,
  resolveGcsBucket,
} from './gcs-adapter';

function withEnv(
  patch: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prior[key] = process.env[key];
    const next = patch[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(patch)) {
      const prev = prior[key];
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }
}

test('defaultGcsBucket: production fallback is usav-photos-prod when env unset', () => {
  withEnv(
    {
      PHOTOS_GCS_BUCKET: undefined,
      VERCEL_ENV: 'production',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(defaultGcsBucket(), 'usav-photos-prod');
    },
  );
});

test('defaultGcsBucket: preview deployments use usav-photos-prod when env unset', () => {
  withEnv(
    {
      PHOTOS_GCS_BUCKET: undefined,
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(defaultGcsBucket(), 'usav-photos-prod');
    },
  );
});

test('defaultGcsBucket: non-production fallback is usav-photos-dev when env unset', () => {
  withEnv(
    {
      PHOTOS_GCS_BUCKET: undefined,
      VERCEL_ENV: undefined,
      NODE_ENV: 'development',
    },
    () => {
      assert.equal(defaultGcsBucket(), 'usav-photos-dev');
    },
  );
});

test('defaultGcsBucket: normalizes quoted PHOTOS_GCS_BUCKET', () => {
  withEnv({ PHOTOS_GCS_BUCKET: '"usav-photos-prod"' }, () => {
    assert.equal(defaultGcsBucket(), 'usav-photos-prod');
  });
});

test('resolveGcsBucket: prefers org config over platform fallback', () => {
  withEnv({ PHOTOS_GCS_BUCKET: undefined, VERCEL_ENV: 'production' }, () => {
    assert.equal(resolveGcsBucket('tenant-bucket'), 'tenant-bucket');
    assert.equal(resolveGcsBucket(''), 'usav-photos-prod');
    assert.equal(resolveGcsBucket(null), 'usav-photos-prod');
  });
});

test('isGcsConfigured: requires credentials, not bucket name alone', () => {
  withEnv(
    {
      PHOTOS_GCS_BUCKET: 'usav-photos-prod',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: undefined,
      GOOGLE_CLIENT_EMAIL: undefined,
      GOOGLE_PRIVATE_KEY: undefined,
    },
    () => {
      assert.equal(isGcsConfigured(), false);
    },
  );

  withEnv(
    {
      PHOTOS_GCS_BUCKET: 'usav-photos-prod',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"client_email":"a@b.c","private_key":"x"}',
    },
    () => {
      assert.equal(isGcsConfigured(), true);
    },
  );
});
