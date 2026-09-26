import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  icon?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
  size?: 'md' | 'lg';
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, icon, hint, error, trailing, size = 'lg', className, id, type, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-fg-2">
          {label}
        </label>
      )}
      <div
        className={clsx(
          'group flex items-center gap-2.5 rounded-md bg-surface-hover px-3.5 ring-1 ring-inset transition-[box-shadow,background] duration-150 focus-within:bg-surface-active focus-within:ring-2',
          size === 'lg' ? 'h-12' : 'h-10',
          error ? 'ring-danger/70 focus-within:ring-danger' : 'ring-transparent hover:ring-line focus-within:ring-accent',
        )}
      >
        {icon && <span className="text-fg-3 group-focus-within:text-fg-2 [&>svg]:size-[18px]">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error || hint ? `${inputId}-desc` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none [&:-webkit-autofill]:[transition:background-color_9999s]"
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="text-fg-3 hover:text-fg"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        )}
        {trailing}
      </div>
      {(error || hint) && (
        <p id={`${inputId}-desc`} className={clsx('text-[12.5px]', error ? 'text-danger' : 'text-fg-3')}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
