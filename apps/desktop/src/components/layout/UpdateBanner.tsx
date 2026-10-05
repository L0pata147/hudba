import { Download, X } from 'lucide-react';
import { useUpdater } from '../../lib/updater';

/** "New version available" bar at the top of the desktop app. */
export function UpdateBanner() {
  const { status, version, progress, dismissed, install, dismiss, error } = useUpdater();
  const visible = ['available', 'downloading', 'installing'].includes(status) || (status === 'error' && !!version);
  if (dismissed || !visible) return null;
  const busy = status === 'downloading' || status === 'installing';
  return (
    <div role="status" className="relative flex shrink-0 items-center gap-3 overflow-hidden rounded-lg bg-accent-soft px-4 py-2 text-[14px] ring-1 ring-accent/40">
      {status === 'downloading' && <div className="absolute inset-y-0 left-0 bg-accent/20 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} aria-hidden />}
      <Download className="relative size-4 shrink-0 text-accent" />
      <p className="relative min-w-0 flex-1 truncate">
        {status === 'downloading'
          ? `Downloading Sonora ${version}… ${Math.round(progress * 100)} %`
          : status === 'installing'
            ? `Installing Sonora ${version} — the app restarts in a moment`
            : status === 'error'
              ? `Update failed: ${error ?? 'unknown error'}`
              : `Sonora ${version} is available.`}
      </p>
      {!busy && (
        <button type="button" onClick={() => void install()} className="relative rounded-full bg-accent px-3 py-1 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">
          {status === 'error' ? 'Try again' : 'Update & restart'}
        </button>
      )}
      {!busy && (
        <button type="button" aria-label="Later" title="Later" onClick={dismiss} className="relative rounded-full p-1 text-fg-2 hover:bg-surface-hover hover:text-fg">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
