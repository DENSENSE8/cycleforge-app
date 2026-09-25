/**
 * DB-free tests for the media-link parser — the one function that decides
 * what a pasted URL is stored and framed as.
 * Run: npx tsx --test src/lib/tasks/media-links.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMediaLink, type ParsedMediaLink } from './media-links';

function parsed(raw: string): ParsedMediaLink {
  const result = parseMediaLink(raw);
  assert.ok(result.ok, `${raw} should parse, got ${JSON.stringify(result)}`);
  return result.link;
}

function refused(raw: string): string {
  const result = parseMediaLink(raw);
  assert.equal(result.ok, false, `${raw} should be refused, got ${JSON.stringify(result)}`);
  return result.ok ? '' : result.reason;
}

const YT_ID = 'dQw4w9WgXcQ';

test('every YouTube spelling of one clip lands on one canonical URL and a nocookie embed', () => {
  const expected: ParsedMediaLink = {
    kind: 'video',
    provider: 'youtube',
    url: `https://www.youtube.com/watch?v=${YT_ID}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${YT_ID}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
  };
  for (const raw of [
    `https://youtu.be/${YT_ID}?si=share-tracking`,
    `https://www.youtube.com/watch?v=${YT_ID}&t=42s`,
    `https://m.youtube.com/watch?v=${YT_ID}`,
    `https://www.youtube.com/shorts/${YT_ID}`,
    `https://www.youtube.com/embed/${YT_ID}`,
    `https://www.youtube-nocookie.com/embed/${YT_ID}`,
    // Scheme-less paste straight from a share sheet.
    `youtu.be/${YT_ID}`,
    `  www.youtube.com/watch?v=${YT_ID}  `,
  ]) {
    assert.deepEqual(parsed(raw), expected, raw);
  }
});

test('a YouTube URL without a real video id is not a video', () => {
  assert.equal(refused('https://www.youtube.com/@somechannel'), 'unsupported_link');
  assert.equal(refused('https://youtu.be/short'), 'unsupported_link');
  assert.equal(refused('https://www.youtube.com/watch?list=PL123'), 'unsupported_link');
});

test('unlisted Vimeo keeps its hash: the path form and ?h= form embed identically', () => {
  const fromPath = parsed('https://vimeo.com/123456789/abc123def0');
  const fromPlayer = parsed('https://player.vimeo.com/video/123456789?h=abc123def0');
  const expected = {
    kind: 'video',
    provider: 'vimeo',
    url: 'https://vimeo.com/123456789/abc123def0',
    embedUrl: 'https://player.vimeo.com/video/123456789?h=abc123def0',
    thumbnailUrl: null,
  };
  assert.deepEqual(fromPath, expected);
  assert.deepEqual(fromPlayer, expected);

  const publicClip = parsed('https://vimeo.com/123456789');
  assert.equal(publicClip.embedUrl, 'https://player.vimeo.com/video/123456789', 'no hash, no ?h=');
});

test('a Loom share link embeds through /embed/', () => {
  const id = '0123456789abcdef0123456789abcdef';
  assert.deepEqual(parsed(`https://www.loom.com/share/${id}?sid=abc`), {
    kind: 'video',
    provider: 'loom',
    url: `https://www.loom.com/share/${id}`,
    embedUrl: `https://www.loom.com/embed/${id}`,
    thumbnailUrl: null,
  });
  assert.equal(refused('https://www.loom.com/looms/videos'), 'unsupported_link');
});

test('a Google Drive file link frames its /preview, from /view or open?id=', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const expected = {
    kind: 'video',
    provider: 'drive',
    url: `https://drive.google.com/file/d/${id}/view`,
    embedUrl: `https://drive.google.com/file/d/${id}/preview`,
    thumbnailUrl: null,
  };
  assert.deepEqual(parsed(`https://drive.google.com/file/d/${id}/view?usp=sharing`), expected);
  assert.deepEqual(parsed(`https://drive.google.com/open?id=${id}`), expected);
  assert.equal(refused('https://drive.google.com/drive/my-drive'), 'unsupported_link');
});

test('a direct https image is a photo; a direct https video file is a video', () => {
  const photo = parsed('https://cdn.example.com/bikes/frame.JPG?w=800');
  assert.equal(photo.kind, 'photo');
  assert.equal(photo.provider, 'image');
  assert.equal(photo.embedUrl, 'https://cdn.example.com/bikes/frame.JPG?w=800');
  assert.equal(photo.thumbnailUrl, photo.embedUrl, 'the image is its own still');

  const clip = parsed('https://cdn.example.com/walkthrough.mp4');
  assert.equal(clip.kind, 'video');
  assert.equal(clip.provider, 'video_file');
  assert.equal(clip.embedUrl, 'https://cdn.example.com/walkthrough.mp4');
  assert.equal(clip.thumbnailUrl, null);
});

test('a plain-http file is refused: the desk is https and would block mixed content', () => {
  assert.equal(refused('http://cdn.example.com/frame.jpg'), 'unsupported_link');
  assert.equal(refused('http://cdn.example.com/walkthrough.mp4'), 'unsupported_link');
});

test('a non-web scheme is not a web address', () => {
  assert.equal(refused('javascript:alert(1)'), 'invalid_url');
  assert.equal(refused('ftp://example.com/frame.jpg'), 'invalid_url');
  assert.equal(refused('data:image/png;base64,iVBORw0KGgo='), 'invalid_url');
  assert.equal(refused('mailto:ops@example.com'), 'invalid_url');
  assert.equal(refused('   '), 'invalid_url');
  assert.equal(refused(`https://example.com/${'a'.repeat(2000)}.jpg`), 'invalid_url', 'over the URL ceiling');
});

test('an https page we cannot frame is unsupported, not embedded', () => {
  assert.equal(refused('https://example.com/some/article'), 'unsupported_link');
  assert.equal(refused('https://www.dropbox.com/s/abc/clip.mp4.html'), 'unsupported_link');
});
