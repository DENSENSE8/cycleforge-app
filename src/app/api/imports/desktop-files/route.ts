import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';

/**
 * POST /api/imports/desktop-files — the desktop app's file-import mouth.
 *
 * N6 (LAWS T30, desktop-first): the desktop Files tool scans and organizes
 * local folders (FBA sheets first), then feeds them here to land in the
 * workspace's tables so every staffer sees them.
 *
 * ## Deliberately a SEAM today, not a write
 *
 * The durable half needs a documents table that does not exist yet, and D6
 * rules the migration lands BEFORE the code that reads it (expand → code →
 * contract). Until that migration ships, this route validates, authenticates
 * and then says so with 501 — it never pretends a file landed. The payload
 * shape below is the contract the migration will be written against, so the
 * desktop build shipping now stays forward-compatible with the table that
 * lands next (and the table stays backward-compatible with files already
 * organized on disk: `relPath` carries the operator's folder structure).
 */

const DesktopFileImportBody = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        /** Path relative to the opened workspace root — the organization IS data. */
        relPath: z.string().min(1).max(1024),
        size: z.number().int().min(0),
        contentBase64: z.string().max(90 * 1024 * 1024), // 64 MB of bytes, base64-inflated
      }),
    )
    .min(1)
    .max(50),
});

export const POST = withAuth(
  async (req: NextRequest) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(DesktopFileImportBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    return NextResponse.json(
      {
        success: false,
        error: 'IMPORT_PIPE_NOT_WIRED',
        detail:
          `Received ${parsed.files.length} file(s), validated and authenticated — but the documents ` +
          'table has not shipped yet (D6: the migration lands before the code that reads it). ' +
          'Nothing was stored; retry after the documents migration lands.',
      },
      { status: 501 },
    );
  },
  { permission: 'orders.import' },
);
