/**
 * MobileFilterDrawer
 * Shows a "Filters" pill on mobile (<640px) that opens a full-width
 * stacked filter panel. On desktop the drawer is never rendered —
 * callers render their own inline filter row.
 *
 * Usage:
 *   <MobileFilterDrawer activeCount={n} onClear={fn}>
 *     {…selects / inputs…}
 *   </MobileFilterDrawer>
 *
 * activeCount:  number of non-default filters currently set
 * onClear:      resets all filters to their defaults
 * children:     the filter controls (Select, SearchableSelect, etc.)
 */
import { useState } from 'react';
import { X, Filter as FilterIcon, SlidersHorizontal } from 'lucide-react';

interface Props {
  activeCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function MobileFilterDrawer({ activeCount, onClear, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      {/* Trigger row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
            activeCount > 0
              ? 'border-sr-purple bg-sr-purple/10 text-sr-purple-light'
              : 'border-sr-border text-sr-text-muted hover:text-white hover:border-sr-border-light'
          }`}>
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="flex items-center justify-center h-4 w-4 rounded-full bg-sr-purple text-[10px] text-white font-bold">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-sr-text-muted hover:text-white transition-colors flex items-center gap-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Drawer */}
      {open && (
        <div className="mt-3 rounded-2xl border border-sr-border bg-sr-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <FilterIcon className="h-4 w-4 text-sr-purple" /> Filters
            </span>
            <div className="flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  onClick={() => { onClear(); }}
                  className="text-xs text-sr-text-muted hover:text-white transition-colors">
                  Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-sr-text-muted hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter controls — rendered in a stacked vertical layout */}
          <div className="space-y-3">
            {children}
          </div>

          <button
            onClick={() => setOpen(false)}
            className="w-full py-2.5 rounded-xl bg-sr-purple/20 border border-sr-purple/30 text-sr-purple-light text-sm font-semibold hover:bg-sr-purple/30 transition-colors">
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
