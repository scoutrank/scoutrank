import { useState, useRef, useEffect, useId, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// The standard ScoutRank dropdown. Brand colors, dark surface, purple
// accent, rounded corners, smooth open/close, fully keyboard operable
// (arrow keys, Home/End, Enter/Space, Escape) via real listbox ARIA
// roles rather than a native <select> (native selects can't be themed
// to match the app's dark/purple palette consistently across browsers).
export function Select({ value, onChange, options, placeholder, className, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  useEffect(() => {
    if (open && highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, open]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (opt) {
      onChange(opt.value);
      setOpen(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setHighlightedIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setHighlightedIndex(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(highlightedIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  return (
    <div ref={containerRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-xl border border-sr-border bg-sr-surface px-3 py-2 text-sm text-sr-silver transition-colors',
          'hover:border-sr-purple/40 focus:outline-none focus:ring-2 focus:ring-sr-purple/50 focus:border-sr-purple',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={cn('truncate', !selected && 'text-sr-text-muted')}>
          {selected ? selected.label : (placeholder || 'Select...')}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-sr-text-muted transition-transform duration-200 flex-shrink-0', open && 'rotate-180')} />
      </button>

      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        tabIndex={-1}
        className={cn(
          'absolute z-20 mt-1.5 w-full max-h-60 overflow-auto rounded-xl border border-sr-border bg-sr-surface shadow-xl shadow-black/40 py-1 origin-top transition-all duration-150',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        {options.map((opt, i) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            onMouseEnter={() => setHighlightedIndex(i)}
            onClick={() => commit(i)}
            className={cn(
              'px-3 py-2 text-sm cursor-pointer rounded-lg mx-1 transition-colors',
              i === highlightedIndex ? 'bg-sr-purple/20 text-white' : 'text-sr-silver hover:bg-sr-surface-light',
              opt.value === value && i !== highlightedIndex && 'text-sr-purple-light'
            )}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
