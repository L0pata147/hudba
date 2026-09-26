import { useEffect } from 'react';
import clsx from 'clsx';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { toastStore, useToasts, type Toast } from '@sonora/core';

function ToastItem({ t }: { t: Toast }) {
  useEffect(() => {
    if (!t.duration) return;
    const timer = setTimeout(() => toastStore.getState().dismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration]);
  const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertCircle : Info;
  return (
    <div
      role={t.tone === 'error' ? 'alert' : 'status'}
      className="animate-rise pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-lg bg-fg py-2.5 pr-2 pl-3.5 text-[14px] font-medium text-bg shadow-pop sm:max-w-md"
    >
      <Icon className={clsx('size-[18px] shrink-0', t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : 'text-bg/60')} aria-hidden />
      <span className="min-w-0 flex-1">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="rounded-full px-3 py-1 text-[13px] font-bold hover:bg-bg/10"
          onClick={() => {
            t.action?.run();
            toastStore.getState().dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="rounded-full p-1 text-bg/60 hover:bg-bg/10 hover:text-bg" onClick={() => toastStore.getState().dismiss(t.id)}>
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-chrome,96px)+12px)] z-[100] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
