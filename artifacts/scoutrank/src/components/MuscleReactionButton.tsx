import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MuscleIcon } from '@/components/icons';

interface MuscleReactionButtonProps {
  reacted: boolean;
  count: number;
  pending?: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
  /** Hide the count number (used for compact icon-only placements) */
  hideCount?: boolean;
}

/**
 * The "boost" reaction — a flexed-bicep icon that curls on click:
 *   idle (hollow outline) -> curling (rotates in and squishes, like winding
 *   up for a curl) -> peak (rotates back out, pops bigger, glows, sparks)
 *   -> settling (eases back to rest) -> filled (stays lit purple).
 * Only plays the curl animation on the false->true transition triggered by
 * this click — loading an already-reacted post from the database just
 * renders the filled/lit state directly, no animation replay.
 */
export function MuscleReactionButton({
  reacted,
  count,
  pending,
  onToggle,
  size = 20,
  className = '',
  hideCount = false,
}: MuscleReactionButtonProps) {
  const [justReacted, setJustReacted] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reacted) {
      setJustReacted(true);
      const t = setTimeout(() => setJustReacted(false), 600);
      return () => clearTimeout(t);
    }
  }, [reacted]);

  return (
    <button
      onClick={e => { e.stopPropagation(); if (!pending) onToggle(); }}
      disabled={pending}
      className={`flex items-center gap-1.5 disabled:opacity-60 ${className}`}
    >
      <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size * 1.6, height: size * 1.6 }}>
        {/* Glow burst at peak */}
        <AnimatePresence>
          {justReacted && (
            <motion.span
              className="absolute rounded-full bg-sr-purple"
              style={{ width: size, height: size }}
              initial={{ opacity: 0.55, scale: 0.5 }}
              animate={{ opacity: 0, scale: 2.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        {/* Spark particles at peak */}
        <AnimatePresence>
          {justReacted && [...Array(6)].map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                className="absolute rounded-full bg-sr-purple-light"
                style={{ width: 3, height: 3, left: '50%', top: '50%' }}
                initial={{ opacity: 1, x: 0, y: 0 }}
                animate={{ opacity: 0, x: Math.cos(angle) * size, y: Math.sin(angle) * size }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            );
          })}
        </AnimatePresence>

        <motion.span
          className="relative flex items-center justify-center"
          animate={
            justReacted
              ? { scale: [1, 0.9, 1.35, 1], rotate: [0, -22, 10, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.6, times: [0, 0.3, 0.65, 1], ease: 'easeInOut' }}
          style={{ filter: reacted ? 'drop-shadow(0 0 6px rgba(168,85,247,0.85))' : 'none' }}
        >
          <MuscleIcon size={size} filled={reacted} className={reacted ? '' : 'text-sr-text-muted'} />
        </motion.span>
      </span>
      {!hideCount && (
        <span className={`text-xs font-semibold ${reacted ? 'text-sr-purple-light' : 'text-sr-text-muted'}`}>{count}</span>
      )}
    </button>
  );
}
