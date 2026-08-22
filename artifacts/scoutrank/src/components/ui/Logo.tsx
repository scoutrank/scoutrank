interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  withText?: boolean;
  className?: string;
}

// Crops the Spartan warrior icon from the full logo image using a
// short/wide container over an unstretched background-image — the
// text portion of the square PNG sits below the visible boundary.
// The wordmark and slogan are rendered separately so they blend with
// the dark nav and scale independently.
export function Logo({ size = 'md', withText = false, className = '' }: LogoProps) {
  const containerSize = { sm: 36, md: 44, lg: 64 };
  const px = containerSize[size];

  // Logo PNG is square. Warrior fills the top ~65%; text fills the
  // bottom ~35%. To crop out just the icon WITHOUT distorting it, the
  // background image must stay at its true square size (px × px) — the
  // *container* is the short/wide shape (px × px*0.65), so only the top
  // portion shows through. Stretching the background image itself
  // taller, as an earlier version of this did, distorts the icon —
  // the container needs to be the smaller shape, not the image.
  const iconRatio = 0.65;
  const iconHeight = Math.round(px * iconRatio);

  const wordmarkSize = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };
  const sloganSize   = { sm: 'text-[8px]', md: 'text-[9px]', lg: 'text-xs' };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Warrior icon — cropped from the top of the (unstretched, true
          square) logo PNG via background-image positioning, with a
          short/wide container so only the icon portion is visible.
          Print engines don't reliably respect overflow clipping on
          oversized image children (the hidden bottom text portion can
          bleed through), but a correctly-sized background-image with
          background-position doesn't have that problem since there's
          no oversized element to fail to clip. */}
      <div
        className="flex-shrink-0"
        style={{
          width: px,
          height: iconHeight,
          backgroundImage: 'url(/logo.png)',
          backgroundSize: `${px}px ${px}px`,
          backgroundPosition: 'top center',
          backgroundRepeat: 'no-repeat',
        }}
        role="img"
        aria-label="ScoutRank"
      />

      {withText && (
        <div className="flex flex-col justify-center leading-none">
          <span className={`${wordmarkSize[size]} font-display font-black tracking-wide text-white`}>
            SCOUT<span className="gradient-text-brand">RANK</span>
          </span>
          <span className={`${sloganSize[size]} tracking-widest text-sr-text-muted uppercase mt-0.5`}>
            Rank, Rise and Repeat
          </span>
        </div>
      )}
    </div>
  );
}
