/** Client helpers for receiving NAS photos (picker + capture upload). */

import type { PhotoScope } from '@/components/mobile/receiving/PhotoUploadQueue';

// Base URL of the NAS file server, e.g.
let runtimeBase = (process.env.NEXT_PUBLIC_NAS_PHOTOS_BASE_URL || '').replace(/\/+$/, '');

export function setNasBaseUrl(url: string | null | undefined): void {
  runtimeBase = (url || '').replace(/\/+$/, '');
}

export function getNasBaseUrl(): string {
  return runtimeBase;
}

// Only web-renderable formats. HEIC (iPhone default) is intentionally excluded
// — Chrome/Android can't display it, and we attach by URL with no transcode.
// Configure the phones/NAS sync to export JPEG, or add a transcode step later.
const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

export function nasConfigured(): boolean {
  return getNasBaseUrl().length > 0;
}

/** True when `url` points at the NAS file server (so a delete must go browser-direct over WebDAV — the Vercel API route can't reach the LAN). */
export function isNasPhotoUrl(url: string): boolean {
  if (!url) return false;
  if (/vercel-storage\.com|blob\.vercel-storage/.test(url)) return false;
  const base = getNasBaseUrl();
  if (base && url.startsWith(base)) return true;
  // Same-origin proxy paths: the prod /api/nas CRUD proxy and the dev mount proxy.
  return url.startsWith('/api/nas-dev') || url.startsWith('/api/nas');
}

export interface NasEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  /** ISO-ish mtime string from nginx autoindex. */
  mtime?: string;
  /** Path relative to the NAS photos root, e.g. "2026-06/IMG_1.jpg". */
  relPath: string;
  /** Absolute URL used both to display the thumbnail and as the stored photoUrl. */
  url: string;
}

// One directory entry from the NAS file server.
interface RawEntry {
  name: string;
  size?: number;
  // nginx
  type?: string; // "file" | "directory"
  mtime?: string;
  // Caddy
  is_dir?: boolean;
  mod_time?: string;
}

function rawIsDir(e: RawEntry): boolean {
  return e.is_dir === true || e.type === 'directory';
}
function rawMtime(e: RawEntry): string | undefined {
  return e.mod_time ?? e.mtime;
}

function joinUrl(relPath: string): string {
  // Encode each segment but keep the slashes so nested folders resolve.
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `${getNasBaseUrl()}/${encoded}`;
}

/**
 * List one directory of the NAS photos tree. `relDir` is relative to the root
 * ("" for the top level). Returns directories first, then files newest-first.
 * Throws a receiver-friendly message on the common failure modes.
 */
export async function listNasDir(relDir: string): Promise<NasEntry[]> {
  const base = getNasBaseUrl();
  if (!base) throw new Error('NAS photo server is not configured.');
  const clean = relDir.replace(/^\/+|\/+$/g, '');
  // autoindex only triggers on a trailing slash.
  const url = `${base}/${clean ? `${clean.split('/').map(encodeURIComponent).join('/')}/` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    // Network error, CORS rejection, or mixed-content block all land here.
    throw new Error(
      "Can't reach the NAS. Check you're on the office network, the file " +
        'server is running, and (on the live site) that it is served over HTTPS.',
    );
  }
  if (!res.ok) throw new Error(`NAS listing failed (HTTP ${res.status}).`);

  let raw: RawEntry[];
  try {
    raw = (await res.json()) as RawEntry[];
  } catch {
    throw new Error('NAS returned an unexpected response (is autoindex JSON enabled?).');
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((e) => e && (rawIsDir(e) || IMAGE_RE.test(e.name)))
    .map<NasEntry>((e) => {
      const rel = clean ? `${clean}/${e.name}` : e.name;
      return {
        name: e.name,
        type: rawIsDir(e) ? 'directory' : 'file',
        size: e.size,
        mtime: rawMtime(e),
        relPath: rel,
        url: joinUrl(rel),
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return (b.mtime || '').localeCompare(a.mtime || '');
    });
}

/** Build the NAS destination URL for a freshly captured receiving photo. */
export function buildNasPhotoUrl(opts: {
  baseUrl: string;
  folder: string;
  scope: PhotoScope;
  filename: string;
}): string {
  const { baseUrl, folder, scope, filename } = opts;
  // Prefer the human PO# for the filename; sanitise to filename-safe chars and
  // fall back to the internal package id if it's missing or sanitises to empty.
  const sanitizedPo = (scope.poRef ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const poPart = sanitizedPo || `PO_${scope.receivingId}`;
  const cleanFilename = (filename || 'photo.jpg')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const hasCleanSequence = scope.fileIndex != null && /^\d+\.jpe?g$/i.test(cleanFilename);
  const finalName = hasCleanSequence
    ? scope.receivingLineId != null
      ? `${poPart}_L${scope.receivingLineId}_${cleanFilename}`
      : `${poPart}_${cleanFilename}`
    : scope.receivingLineId != null
      ? `${poPart}_L${scope.receivingLineId}__${cleanFilename}`
      : `${poPart}__${cleanFilename}`;
  const segments: string[] = [];
  const cleanFolder = (folder || '').replace(/^\/+|\/+$/g, '');
  if (cleanFolder) segments.push(...cleanFolder.split('/'));
  segments.push(finalName);
  const encoded = segments.map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encoded}`;
}

/** Destination URL for an outbound shipping LABEL on the NAS. */
export function buildNasLabelUrl(opts: {
  baseUrl: string;
  folder: string;
  orderRef: string;
  filename: string;
  /** Eyeball-distinct doc-kind prefix. Defaults to 'LABEL' for the original
   * shipping-label caller; outbound packing slips pass 'SLIP'. */
  kindPrefix?: string;
}): string {
  const { baseUrl, folder, orderRef, filename, kindPrefix = 'LABEL' } = opts;
  const sanitized = (orderRef ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefix = `${kindPrefix}_${sanitized || 'order'}__`;
  const segments: string[] = [];
  const cleanFolder = (folder || '').replace(/^\/+|\/+$/g, '');
  if (cleanFolder) segments.push(...cleanFolder.split('/'));
  segments.push(`${prefix}${filename}`);
  const encoded = segments.map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encoded}`;
}

interface PutResult {
  ok: boolean;
  /** Canonical URL the file now lives at — store this as the photoUrl. */
  url: string;
  error?: string;
}

/** Write one captured photo straight to the NAS over WebDAV (HTTP PUT). */
export async function putNasPhoto(url: string, blob: Blob): Promise<PutResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    // Network error, CORS rejection, or mixed-content block all land here.
    return {
      ok: false,
      url,
      error:
        "Can't reach the NAS to save the photo. Check you're on the office " +
        'network and the NAS is reachable (and served over HTTPS on the live site).',
    };
  }
  // 200/201 (created) and 204 (overwritten) are all success for WebDAV PUT.
  if (res.ok || res.status === 201 || res.status === 204) return { ok: true, url };
  return { ok: false, url, error: `NAS write failed (HTTP ${res.status}).` };
}

/** Delete one photo file from the NAS over WebDAV (HTTP DELETE), browser-direct — mirroring the capture upload PUT. */
export async function deleteNasPhoto(url: string): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'DELETE', credentials: 'include', cache: 'no-store' });
  } catch {
    return {
      ok: false,
      error:
        "Can't reach the NAS to delete the photo. Check you're on the office " +
        'network and the NAS is reachable.',
    };
  }
  // 200/202/204 = deleted; 404 = already gone — both mean the file is no longer there.
  if (res.ok || res.status === 204 || res.status === 404) return { ok: true };
  return { ok: false, error: `NAS delete failed (HTTP ${res.status}).` };
}
