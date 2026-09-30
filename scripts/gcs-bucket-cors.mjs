#!/usr/bin/env node
/**
 * The photo bucket's CORS rule — what lets a browser PUT a video straight to
 * GCS (`uploadVideoClient` → signed URL from `POST /api/photos/upload/video`).
 * Without it every recorded-video upload dies in the browser's preflight
 * ("Access to XMLHttpRequest … blocked by CORS policy"); photos are unaffected
 * because they upload through the app server.
 *
 * The signed URL is the credential; the origin list only says which app hosts
 * may use one. A new staff host (tenant subdomain, preview domain) goes here.
 *
 * Usage:
 *   node scripts/gcs-bucket-cors.mjs           # print the bucket's current rule
 *   node scripts/gcs-bucket-cors.mjs --apply   # write APP_ORIGINS to the bucket
 *
 * Reads PHOTOS_GCS_BUCKET and GOOGLE_APPLICATION_CREDENTIALS_JSON or
 * GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY from .env.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });
dotenv.config({ path: path.resolve(REPO_ROOT, '.env.local') });

const APP_ORIGINS = [
  'https://app.cycleforge.ai',
  'https://usav.app.cycleforge.ai',
  'https://usav-dev.michaelgarisek.com',
  'https://usav-orders-backend.vercel.app',
  'http://localhost:3050',
  // The dev lane also listens on the tailnet (phone testing): an iPhone on
  // http://avion:3050 had every recorded-video PUT blocked (2026-09-30).
  'http://avion:3050',
  'http://avion.tail2cddbd.ts.net:3050',
  'http://100.72.226.55:3050',
];

const CORS = [
  {
    origin: APP_ORIGINS,
    method: ['PUT', 'GET', 'HEAD'],
    responseHeader: ['content-type', 'x-goog-content-length-range', 'range', 'content-range', 'etag'],
    maxAgeSeconds: 3600,
  },
];

function unquote(value) {
  return (value || '').trim().replace(/^['"]|['"]$/g, '');
}

function credentials() {
  const json = unquote(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  if (json) return JSON.parse(json);
  const email = unquote(process.env.GOOGLE_CLIENT_EMAIL);
  const key = unquote(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('No Google service-account credentials in .env');
  return { client_email: email, private_key: key };
}

const bucketName = unquote(process.env.PHOTOS_GCS_BUCKET) || 'usav-photos-prod';
const bucket = new Storage({ credentials: credentials() }).bucket(bucketName);

if (process.argv.includes('--apply')) {
  await bucket.setCorsConfiguration(CORS);
  console.log(`Applied CORS to gs://${bucketName}`);
}
const [meta] = await bucket.getMetadata();
console.log(`gs://${bucketName} cors:`, JSON.stringify(meta.cors ?? null, null, 2));
