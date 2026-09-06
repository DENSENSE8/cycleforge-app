import { nasConfigured } from '@/lib/nas-photos';
import { Button } from '@/design-system/primitives';
import { STATIONS } from './nas-folders-config';
import type { StationNasFoldersController } from './useStationNasFolders';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/** Per-station picker default-folder panel. */
export function StationFoldersPanel({ c }: { c: StationNasFoldersController }) {
  const { draft, setFolder, dirty, save, isLoading, setPicking } = c;
  return (
    <>
      <div className="divide-y divide-border-hairline overflow-hidden rounded-none border border-border-soft bg-surface-card">
        {STATIONS.map((s) => (
          <div key={s.key} className="flex items-center gap-3 px-4 py-3">
            <div className="w-36 shrink-0">
              <p className="text-role-caption font-semibold text-text-default">{s.label}</p>
              <p className="text-role-micro uppercase tracking-widest text-text-faint">{s.key}</p>
            </div>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={draft[s.key] ?? ''}
                onChange={(e) => setFolder(s.key, e.target.value)}
                placeholder="Root (no folder)"
                className={cn("w-full rounded-lg border border-border-soft bg-surface-card inset-field text-role-caption text-text-default placeholder:text-text-faint", focusRing('field', 'accent'))}
              />
              {s.hint ? <p className="mt-1 text-role-micro text-text-faint">{s.hint}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {nasConfigured() ? (
                <Button variant="secondary" size="sm" type="button" onClick={() => setPicking(s.key)}>
                  Browse
                </Button>
              ) : null}
              {draft[s.key] ? (
                <Button variant="secondary" size="sm" type="button" onClick={() => setFolder(s.key, '')}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-role-micro uppercase tracking-widest text-text-warning">Unsaved changes</span> : null}
        <Button
          variant="primary"
          size="md"
          type="button"
          disabled={!dirty || save.isPending || isLoading}
          onClick={() => save.mutate(draft)}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </>
  );
}
