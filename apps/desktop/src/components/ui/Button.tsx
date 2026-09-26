import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong shadow-[0_8px_24px_-10px_var(--accent)]',
  secondary: 'bg-surface-hover text-fg hover:bg-surface-active',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-hover',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
  outline: 'text-fg ring-1 ring-inset ring-line hover:ring-fg-3 hover:bg-surface-hover',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition-[background,color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
  variant?: 'ghost' | 'solid';
}

const iconSizes = { xs: 'size-7', sm: 'size-8', md: 'size-10', lg: 'size-12' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, variant = 'ghost', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition-[background,color,transform] duration-150 active:scale-90 disabled:opacity-40 disabled:active:scale-100',
        iconSizes[size],
        variant === 'solid' ? 'bg-surface-hover hover:bg-surface-active text-fg' : 'hover:bg-surface-hover',
        active ? 'text-accent' : 'text-fg-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
