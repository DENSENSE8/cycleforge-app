'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { AdminEmptyDetail, useAdminUrlState } from './shared';

interface FbaFnskuRow {
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  fnsku: string | null;
}

interface FBAManagementTabProps {
  // Search term used to live in this prop; it now lives in the URL and is
  // owned by FbaCatalogSidebarPanel. Kept for backwards compatibility with
  // the admin page's prop pass-through.
  searchTerm?: string;
}

export function FBAManagementTab(_props: FBAManagementTabProps = {}) {
  const { searchParams, setParam } = useAdminUrlState();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isUploadInfoOpen, setIsUploadInfoOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [productTitle, setProductTitle] = useState('');
  const [asin, setAsin] = useState('');
  const [sku, setSku] = useState('');
  const [fnsku, setFnsku] = useState('');

  // Edit-in-place state for the detail view.
  const [editTitle, setEditTitle] = useState('');
  const [editAsin, setEditAsin] = useState('');
  const [editSku, setEditSku] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const selectedFnsku = searchParams.get('fnsku') ?? '';

  const { data: detail, isLoading } = useQuery<FbaFnskuRow | null>({
    queryKey: ['admin-fba-fnsku-detail', selectedFnsku],
    queryFn: async () => {
      if (!selectedFnsku) return null;
      const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(selectedFnsku)}`);
      if (!res.ok) throw new Error('Failed to fetch FNSKU detail');
      const json = await res.json();
      // API responds with { success, fnsku: <row> }. Fall back to legacy
      // shapes (`row`, or a bare row) so we never hand the envelope to render.
      return (json?.fnsku ?? json?.row ?? json) as FbaFnskuRow;
    },
    enabled: Boolean(selectedFnsku),
  });

  useEffect(() => {
    if (detail) {
      setEditTitle(detail.product_title ?? '');
      setEditAsin(detail.asin ?? '');
      setEditSku(detail.sku ?? '');
      setIsEditing(false);
    }
  }, [detail]);

  const createMutation = useMutation({
    mutationFn: async (payload: { product_title: string; asin: string; sku: string; fnsku: string }) => {
      const res = await fetch('/api/admin/fba-fnskus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to add FBA row');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminFbaFnskus.all });
      setIsAddOpen(false);
      setProductTitle('');
      setAsin('');
      setSku('');
      setFnsku('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFnsku) return;
      const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(selectedFnsku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_title: editTitle, asin: editAsin, sku: editSku }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to update');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminFbaFnskus.all });
      queryClient.invalidateQueries({ queryKey: ['admin-fba-fnsku-detail', selectedFnsku] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFnsku) return;
      const res = await fetch(`/api/admin/fba-fnskus/${encodeURIComponent(selectedFnsku)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to delete');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminFbaFnskus.all });
      queryClient.removeQueries({ queryKey: ['admin-fba-fnsku-detail', selectedFnsku] });
      setIsDeleteOpen(false);
      // Clear the selection so the detail pane returns to the empty state.
      setParam((p) => p.delete('fnsku'));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/fba-fnskus/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to upload CSV');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminFbaFnskus.all });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  useEffect(() => {
    const openAdd = () => setIsAddOpen(true);
    const openUpload = () => setIsUploadInfoOpen(true);
    window.addEventListener('admin-fba-open-add', openAdd as EventListener);
    window.addEventListener('admin-fba-open-upload', openUpload as EventListener);
    return () => {
      window.removeEventListener('admin-fba-open-add', openAdd as EventListener);
      window.removeEventListener('admin-fba-open-upload', openUpload as EventListener);
    };
  }, []);

  const isStub = useMemo(() => {
    if (!detail) return false;
    return (
      !String(detail.product_title || '').trim() &&
      !String(detail.asin || '').trim() &&
      !String(detail.sku || '').trim()
    );
  }, [detail]);

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-canvas">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
        }}
      />

      {!selectedFnsku ? (
        <AdminEmptyDetail
          title="Pick an FNSKU"
          hint="Select an FNSKU from the catalog on the left, or use the buttons there to add a row or upload a CSV."
        />
      ) : isLoading ? (
        <AdminEmptyDetail title="Loading FNSKU…" />
      ) : !detail ? (
        <AdminEmptyDetail
          title="FNSKU not found"
          hint="The selected FNSKU isn't in the catalog. Clear the selection and pick another."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto max-w-2xl space-y-5">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-role-micro uppercase tracking-widest text-text-soft">FNSKU</p>
                <h2 className="mt-0.5 break-all font-mono text-xl font-semibold text-text-default">
                  {detail.fnsku}
                </h2>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-role-micro font-semibold uppercase tracking-wider ${
                    isStub ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {isStub ? 'Stub' : 'Hydrated'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDeleteOpen(true)}
                  className="border border-red-200 bg-surface-card text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  }
                >
                  Delete
                </Button>
              </div>
            </header>

            <div className="rounded-xl border border-border-soft bg-surface-card p-4 space-y-3">
              <FieldRow label="Product Title">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    setIsEditing(true);
                  }}
                  className="w-full rounded-lg border border-border-soft bg-surface-card inset-field text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </FieldRow>
              <FieldRow label="ASIN">
                <input
                  type="text"
                  value={editAsin}
                  onChange={(e) => {
                    setEditAsin(e.target.value);
                    setIsEditing(true);
                  }}
                  className="w-full rounded-lg border border-border-soft bg-surface-card inset-field font-mono text-role-caption outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </FieldRow>
              <FieldRow label="SKU">
                <input
                  type="text"
                  value={editSku}
                  onChange={(e) => {
                    setEditSku(e.target.value);
                    setIsEditing(true);
                  }}
                  className="w-full rounded-lg border border-border-soft bg-surface-card inset-field font-mono text-role-caption outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                />
              </FieldRow>

              {isEditing ? (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditTitle(detail.product_title ?? '');
                      setEditAsin(detail.asin ?? '');
                      setEditSku(detail.sku ?? '');
                      setIsEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                  >
                    {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-role-caption font-semibold uppercase tracking-wider">
              Delete FNSKU
            </DialogTitle>
            <DialogDescription className="text-role-caption leading-relaxed">
              Remove <span className="font-mono font-semibold">{selectedFnsku}</span> from the catalog?
              It will no longer appear in the FNSKU directory. Re-adding or re-uploading the same
              FNSKU restores it.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError ? (
            <p className="text-role-caption font-semibold text-red-600">
              {(deleteMutation.error as Error)?.message || 'Failed to delete.'}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setIsDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadInfoOpen} onOpenChange={setIsUploadInfoOpen}>
        <DialogContent hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-role-caption font-semibold uppercase tracking-wider">
              Upload FNSKU CSV
            </DialogTitle>
            <DialogDescription className="text-role-caption leading-relaxed">
              Include <span className="font-semibold">fnsku</span>,{' '}
              <span className="font-semibold">product_title</span>,{' '}
              <span className="font-semibold">asin</span>, and <span className="font-semibold">sku</span>{' '}
              columns. Rows with duplicate <span className="font-semibold">fnskus</span> in the same
              file are skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setIsUploadInfoOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                setIsUploadInfoOpen(false);
                fileInputRef.current?.click();
              }}
              className="bg-emerald-600 shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700"
            >
              Choose File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent hideClose className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-role-caption font-semibold uppercase tracking-wider">
              Add FNSKU Mapping
            </DialogTitle>
            <DialogDescription className="text-role-caption">
              Create one catalog row manually when you don&apos;t want to use a CSV upload.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Product Title">
              <input
                type="text"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                placeholder="Enter product title"
                className="w-full rounded-xl border border-border-soft bg-surface-canvas inset-field text-role-caption outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="ASIN">
              <input
                type="text"
                value={asin}
                onChange={(e) => setAsin(e.target.value)}
                placeholder="Enter ASIN"
                className="w-full rounded-xl border border-border-soft bg-surface-canvas inset-field text-role-caption outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="SKU">
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Enter SKU"
                className="w-full rounded-xl border border-border-soft bg-surface-canvas inset-field text-role-caption outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="FNSKU">
              <input
                type="text"
                value={fnsku}
                onChange={(e) => setFnsku(e.target.value.toUpperCase())}
                placeholder="Enter FNSKU"
                className="w-full rounded-xl border border-border-soft bg-surface-canvas inset-field text-role-caption outline-none focus:border-blue-500"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setIsAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={createMutation.isPending || !fnsku.trim()}
              onClick={() =>
                createMutation.mutate({
                  product_title: productTitle,
                  asin,
                  sku,
                  fnsku,
                })
              }
            >
              {createMutation.isPending ? 'Saving…' : 'Save Row'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <p className="text-role-micro uppercase tracking-widest text-text-soft">{label}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-role-micro uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
