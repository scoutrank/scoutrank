import { useState, useRef, useEffect, useId, useMemo, type KeyboardEvent } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { SelectOption } from './Select';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

// Same brand language as Select, with a filter input at the top of the
// open panel. Built for dropdowns whose option count grows over time
// (sports, events) — scrolling a long unsearchable list doesn't scale,
// but a few hundred options filtered client-side as you type does.
export function SearchableSelect({ value, onChange, options, placeholder, searchPlaceholder, className, disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setHighlightedIndex(0);
      // Focus the filter input once the panel is actually in the DOM/visible.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open && highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, open]);

  const commit = (idx: number) => {
    const opt = filtered[idx];
    if (opt) {
      onChange(opt.value);
      setOpen(false);
      setQuery('');
    }
  };

  const handleButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(highlightedIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); }
    else if (e.key === 'Tab') { setOpen(false); setQuery(''); }
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
        onKeyDown={handleButtonKeyDown}
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

      <div
        className={cn(
          'absolute z-20 mt-1.5 w-full min-w-[220px] rounded-xl border border-sr-border bg-sr-surface shadow-xl shadow-black/40 origin-top transition-all duration-150',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <div className="p-2 border-b border-sr-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sr-text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={searchPlaceholder || 'Search...'}
              className="w-full pl-8 pr-2 py-1.5 text-sm bg-sr-bg-light border border-sr-border rounded-lg text-white placeholder:text-sr-text-muted focus:outline-none focus:border-sr-purple/50"
            />
          </div>
        </div>
        <ul ref={listRef} id={listboxId} role="listbox" tabIndex={-1} className="max-h-56 overflow-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-sr-text-muted">No matches</li>
          ) : (
            filtered.map((opt, i) => (
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
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
