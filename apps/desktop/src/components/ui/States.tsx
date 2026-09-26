import type { ReactNode } from 'react';
import { CloudOff, RotateCw } from 'lucide-react';
import { describeError, isNavidromeError } from '@sonora/api';
import { Button } from './Button';

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-surface-hover text-fg-2 [&>svg]:size-7">{icon}</div>}
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-sm text-fg-2">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const network = isNavidromeError(error) && (error.kind === 'network' || error.kind === 'timeout');
  const title = network ? 'Unable to connect to your music server.' : isNavidromeError(error) && error.kind === 'not-found' ? 'Not found' : 'Something went wrong';
  const message = network ? 'Check your connection and try again.' : describeError(error);
  return (
    <div role="alert" className={compact ? 'flex items-center gap-4 rounded-lg bg-surface px-4 py-3' : 'animate-fade-in flex flex-col items-center justify-center px-6 py-16 text-center'}>
      {!compact && (
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-danger/10 text-danger">
          <CloudOff className="size-7" />
        </div>
      )}
      <div className={compact ? 'min-w-0 flex-1' : ''}>
        <h3 className={compact ? 'text-sm font-semibold' : 'font-display text-lg font-bold'}>{title}</h3>
        <p className={compact ? 'text-[13px] text-fg-2' : 'mt-1.5 max-w-sm text-sm text-fg-2'}>{message}</p>
      </div>
      {onRetry && (
        <Button variant={compact ? 'ghost' : 'secondary'} size={compact ? 'sm' : 'md'} icon={<RotateCw className="size-4" />} onClick={onRetry} className={compact ? '' : 'mt-5'}>
          Retry
        </Button>
      )}
    </div>
  );
}
