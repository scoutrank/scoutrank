import { cn } from '@/utils/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'brand' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({ variant = 'brand', size = 'md', children, icon, loading, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    brand: 'bg-gradient-to-r from-sr-purple to-sr-blue text-white hover:from-sr-purple-light hover:to-sr-blue-light hover:shadow-lg hover:shadow-sr-purple/20 active:scale-[0.98]',
    outline: 'border border-sr-border text-sr-silver hover:border-sr-purple hover:bg-sr-purple/10 active:scale-[0.98]',
    ghost: 'text-sr-silver hover:bg-sr-surface-light hover:text-white active:scale-[0.98]',
    danger: 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:border-red-400',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="h-4 w-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
