'use client';

/**
 * Mint an on-hold placeholder for a product the catalog has never heard of.
 * of the pair screen's "SKU exception" verb (operator 2026-09-25: a triage
 * (operator 2026-09-25: "the identification and triageability and
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Check, X } from '@/components/Icons';
import { DetailDock } from '@/design-system/components/DetailDock';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { ScanValueField } from '@/components/mobile/repair/ScanValueField';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { captureTimeFromFile } from '@/lib/photos/capture-time';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { MobileNativePhotoInput } from '@/components/mobile/photos/MobileNativePhotoCapture';

const DESCRIPTION_MAX = 2000;

interface StagedFile extends StagedPhoto {
  file: File;
}

/** Does this look like something a scanner produced rather than something a person typed? */
function looksLikeBarcode(value: string): boolean {
  const compact = value.trim().replace(/[\s-]/g, '');
  return compact.length >= 8 && /^[0-9]+$/.test(compact);
}

export function ProvisionalCreateSheet({
  open,
  seed,
  staffId,
  locationFace,
  onCancel,
  onCreated,
}: {
  open: boolean;
  /** Whatever was in the search box when the operator gave up on the catalog. */
  seed: string;
  staffId: number;
  /** The location being filled (`C-04-01-3-00`) — shown in the Put-away band. */
  locationFace: string;
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
    <Sheet open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      {/* The sheet portals out of the page's region; re-declare triage. The
          body drops its inset so the bands and the footer cells run the full
          width of the panel, like every flat screen. */}
      <ModeRegion mode="triage" asChild>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>New SKU exception</SheetTitle>
          </SheetHeader>
          <SheetBody className="divide-y divide-mode-rule px-0 pt-0 pb-0">
            <DetailSectionHeading id="exception-identify">Identify · what is it</DetailSectionHeading>
            <div className="space-y-3 bg-mode-panel px-mode-page py-3">
              <TextField
                value={title}
                onChange={setTitle}
                label="What is it? (required)"
                inputMode="text"
                autoComplete="off"
                autoFocus={seedIsBarcode}
              />
              <ScanValueField
                id="exception-barcode"
                label="Barcode / UPC (optional)"
                value={barcode}
                onChange={setBarcode}
                mono
                helper={hasBarcode ? undefined : 'No barcode? Leave it empty — scan one on later from its details.'}
              />
            </div>

            <DetailSectionHeading id="exception-triage">Triage · for whoever merges it</DetailSectionHeading>
            <div className="space-y-3 bg-mode-panel px-mode-page py-3">
              <TextField
                value={description}
                onChange={(next) => setDescription(next.slice(0, DESCRIPTION_MAX))}
                label="Notes — model, colour, markings, damage"
                multiline
                rows={3}
                maxLength={DESCRIPTION_MAX}
                autoComplete="off"
              />
              <MobileNativePhotoInput
                ref={fileInput}
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <ComposerStagedPhotoStrip staged={staged} onRemove={busy ? () => {} : removeStaged} />
              <Button
                variant="secondary"
                size="lg"
                radius="flush"
                className="w-full"
                icon={<Camera />}
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {staged.length > 0 ? `Add photos (${staged.length})` : 'Add photos'}
              </Button>
            </div>

            <DetailSectionHeading id="exception-put-away">Put away</DetailSectionHeading>
            <DetailFacts label="Put away">
              <DetailFact label="Location" value={locationFace} mono />
              <DetailFact label="Next" value="Count how many" />
              <DetailFact
                label="Status"
                value="On hold — stock counts now, not sellable until it is merged into a real SKU"
              />
            </DetailFacts>

            {error ? (
              <p role="alert" className="bg-rose-50 px-mode-page py-3 text-role-caption font-semibold text-rose-700">
                {error}
              </p>
            ) : null}
          </SheetBody>

          <DetailDock<'cancel' | 'create'>
            label="SKU exception actions"
            placement="sheet"
            verbs={[
              { id: 'cancel', label: 'Cancel', icon: <X />, disabled: busy },
              {
                id: 'create',
                label: phase === 'creating' ? 'Creating…' : phase === 'uploading' ? 'Uploading photos…' : 'Create & count',
                icon: <Check />,
                primary: true,
                disabled: !ready,
                loading: busy,
              },
            ]}
            onVerb={(verb) => (verb === 'cancel' ? onCancel() : submit())}
          />
        </SheetContent>
      </ModeRegion>
    </Sheet>
  );
}
