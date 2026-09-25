'use client';

/**
 * Mint an on-hold placeholder for a product the catalog has never heard of.
 *
 * ## The name is required, the barcode is not
 *
 * The name is what a human reads on the rack today, so it is the one required
 * field. The barcode is what a LATER merge matches on — worth having, but a box
 * with no label, a torn label or a label nobody can find must still be counted
 * now, not left on the floor until someone locates a code. Leave the barcode
 * empty and the placeholder is keyed by a per-sheet `sourceRef` instead (one
 * `safeRandomUUID()` per mount, so a double tap joins its own placeholder
 * rather than minting a twin); the real barcode is scanned onto it later from
 * its `/m/on-hold/[sku]/info` edit (attach-once).
 *
 * The search query the operator already typed seeds whichever field it looks
 * like, so the common path is one field plus Create. A wedge scanner firing
 * into the focused barcode field works for the same reason the station's
 * manual-entry field works — it is just keystrokes ending in Enter.
 *
 * ## This is a modal, and should be
 *
 * Unlike `MobileStationSheet` (the station's always-present working surface),
 * this interrupts to ask a few questions and goes away. It mounts inside the
 * bind sheet's own slot rather than over the whole screen so the location code
 * stays visible above it — you are naming a thing that goes in THAT bin.
 *
 * ## Description and photos are optional, and follow the SKU
 *
 * The person holding the box is the only one who can see it; whoever pairs it
 * to the real SKU later is working from what they wrote and shot. Photos
 * upload AFTER the placeholder exists (they attach to its `sku_stock` row), so
 * a failed upload is a toast, never a lost SKU.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { captureTimeFromFile } from '@/lib/photos/capture-time';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

const DESCRIPTION_MAX = 2000;

interface StagedFile extends StagedPhoto {
  file: File;
}

/**
 * Does this look like something a scanner produced rather than something a
 * person typed? Digits and dashes, long enough to be a real symbology — UPC-A
 * is 12, EAN-13 is 13, and the shortest thing worth treating as a code is an
 * EAN-8.
 */
function looksLikeBarcode(value: string): boolean {
  const compact = value.trim().replace(/[\s-]/g, '');
  return compact.length >= 8 && /^[0-9]+$/.test(compact);
}

export function ProvisionalCreateSheet({
  seed,
  staffId,
  onCancel,
  onCreated,
}: {
  /** Whatever was in the search box when the operator gave up on the catalog. */
  seed: string;
  staffId: number;
  onCancel: () => void;
  /** Hands back a catalog-shaped item so the caller's normal pairing path runs. */
  onCreated: (item: SkuCatalogItem) => void;
}) {
  const queryClient = useQueryClient();
  const seedIsBarcode = useMemo(() => looksLikeBarcode(seed), [seed]);
  const [barcode, setBarcode] = useState(seedIsBarcode ? seed.trim() : '');
  const [title, setTitle] = useState(seedIsBarcode ? '' : seed.trim());
  const [description, setDescription] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [phase, setPhase] = useState<'idle' | 'creating' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Idempotency key for a barcode-less create — one per sheet mount, never re-rolled. */
  const [sourceRef] = useState(safeRandomUUID);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  // Blob previews are revoked when the sheet goes away, created or not.
  useEffect(
    () => () => {
      for (const photo of stagedRef.current) URL.revokeObjectURL(photo.previewUrl);
    },
    [],
  );

  const busy = phase !== 'idle';
  const ready = title.trim().length >= 2;
  const hasBarcode = barcode.trim().length > 0;

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: StagedFile[] = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file, index) => ({
        tempId: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        status: 'done',
        file,
      }));
    setStaged((prev) => [...prev, ...next]);
  }, []);

  const removeStaged = useCallback((tempId: string) => {
    setStaged((prev) => {
      const gone = prev.find((photo) => photo.tempId === tempId);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((photo) => photo.tempId !== tempId);
    });
  }, []);

  const submit = useCallback(async () => {
    if (!ready || busy) return;
    setPhase('creating');
    setError(null);
    let item: ProvisionalSku;
    try {
      const res = await fetch('/api/sku-catalog/provisional', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(hasBarcode ? { barcode: barcode.trim() } : { sourceRef }),
          productTitle: title.trim(),
          description: description.trim() || undefined,
          staffId: staffId > 0 ? staffId : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        item?: ProvisionalSku;
      } | null;
      if (!res.ok || !data?.success || !data.item) {
        throw new Error(data?.error || `Could not create (${res.status})`);
      }
      item = data.item;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create');
      setPhase('idle');
      return;
    }

    // The SKU exists from here on; a photo that fails is reported and skipped.
    if (staged.length > 0) {
      setPhase('uploading');
      let failed = 0;
      for (const photo of staged) {
        setStaged((prev) =>
          prev.map((p) => (p.tempId === photo.tempId ? { ...p, status: 'uploading' } : p)),
        );
        try {
          await uploadPhotoClient({
            file: photo.file,
            entityType: 'SKU_STOCK',
            entityId: item.stockId,
            clientCapturedAtMs: captureTimeFromFile(photo.file),
          });
          setStaged((prev) =>
            prev.map((p) => (p.tempId === photo.tempId ? { ...p, status: 'done' } : p)),
          );
        } catch {
          failed += 1;
          setStaged((prev) =>
            prev.map((p) => (p.tempId === photo.tempId ? { ...p, status: 'error' } : p)),
          );
        }
      }
      if (failed > 0) {
        toast.error(
          `${failed} photo${failed === 1 ? '' : 's'} did not upload — add ${failed === 1 ? 'it' : 'them'} again from ${item.sku}.`,
        );
      }
    }
    void invalidateSkuExceptions(queryClient);

    // Shaped as a catalog hit so the caller pairs it through the exact same
    // keypad path a real SKU takes — one pairing flow, not two.
    onCreated({
      id: -1,
      sku: item.sku,
      zoho_sku: null,
      product_title: item.productTitle,
      category: null,
      upc: item.barcode || null,
      image_url: null,
      is_active: true,
    });
  }, [barcode, busy, description, hasBarcode, onCreated, queryClient, ready, sourceRef, staffId, staged, title]);

  return (
    <div
      className={cn(
        // The border delimits this form; a second GROUND inside a white flow is
        // the wrap the kiosk retired ("There should just be a white
        // background", `kiosk-chrome.ts`) and the phone follows it.
        'flex flex-col gap-2 border border-border-soft bg-surface-card p-3',
        cornerClass('surface'),
      )}
    >
      <p className="text-role-caption font-semibold text-text-default">SKU exception</p>

      <TextField
        value={barcode}
        onChange={setBarcode}
        label="Barcode / UPC (optional)"
        mono
        inputMode="text"
        autoComplete="off"
        autoFocus={!seedIsBarcode ? false : undefined}
      />
      {!hasBarcode ? (
        <p className="text-role-micro text-text-faint">
          No barcode? Leave it empty — add one later from the product’s details.
        </p>
      ) : null}
      <TextField
        value={title}
        onChange={setTitle}
        label="What is it?"
        inputMode="text"
        autoComplete="off"
        autoFocus={seedIsBarcode}
      />
      <TextField
        value={description}
        onChange={(next) => setDescription(next.slice(0, DESCRIPTION_MAX))}
        label="Description (optional)"
        multiline
        rows={3}
        maxLength={DESCRIPTION_MAX}
        autoComplete="off"
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <ComposerStagedPhotoStrip
        staged={staged}
        onRemove={busy ? () => {} : removeStaged}
      />
      <Button
        variant="secondary"
        size="lg"
        radius="flush"
        icon={<Camera />}
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        {staged.length > 0 ? `Add photos (${staged.length})` : 'Add photos'}
      </Button>

      {error && (
        <p role="alert" className="text-role-caption text-text-danger">
          {error}
        </p>
      )}

      <p className="text-role-micro text-text-faint">
        Stock counts immediately. Not sellable until it is merged into a real SKU.
      </p>

      <div className="flex items-stretch gap-2">
        <Button
          variant="ghost"
          size="lg"
          radius="flush"
          className="flex-1"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          radius="flush"
          className="flex-1"
          disabled={!ready || busy}
          icon={busy ? <Loader2 className="animate-spin" /> : undefined}
          onClick={() => void submit()}
        >
          {phase === 'creating'
            ? 'Creating…'
            : phase === 'uploading'
              ? 'Uploading photos…'
              : 'Create & count'}
        </Button>
      </div>
    </div>
  );
}
