// CARGO ONE identity: the route ring (an open "C" — one platform around China ↔ Turkmenistan)
// and the copper node (your cargo). The wordmark is a custom monoline geometric cut so it never depends on a web font.
import { Link } from '@/lib/router';
import { cn } from './ui';

const RING = 'M24.353 9.474 A10.6 10.6 0 1 0 24.353 22.526';
const WORD = 'M 7.877 2.221 A4 4 0 1 0 7.877 7.779 M 11.8 10 L 15.15 1 H 16.45 L 19.8 10 M 13.6 6.6 H 18 M 23.4 10 V0 M 22.4 1 H 27 A3 3 0 0 1 27 7 H 23.4 M 27 7 L 30 10 M 40.577 2.221 A4 4 0 1 0 41.639 5.695 M 41.639 5.095 V5.6 H 38.3 M 49.4 1 A4 4 0 1 0 49.4 9 A4 4 0 1 0 49.4 1 M 67 1 A4 4 0 1 0 67 9 A4 4 0 1 0 67 1 M 75.1 10 V0 M 75.5 0.9 L 81.1 9.1 M 81.5 10 V0 M 85.6 0 V10 M 84.6 1 H 91.6 M 84.6 5 H 90.8 M 84.6 9 H 91.6';

export function LogoMark({ size = 32, onDark, animated, tile, className }: { size?: number; onDark?: boolean; animated?: boolean; tile?: boolean; className?: string }) {
  const ink = tile ? '#F5F5F3' : onDark ? '#F5F5F3' : 'var(--color-ink, #111111)';
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      {tile ? <rect width="32" height="32" rx="9" fill="#111111" /> : null}
      <path d={RING} fill="none" stroke={ink} strokeWidth="4.8" pathLength={100} strokeDasharray={animated ? 100 : undefined}
        className={animated ? 'animate-draw' : undefined} style={animated ? ({ '--len': 100 } as Record<string, number>) : undefined} />
      <circle cx="26.6" cy="16" r="3.3" fill="url(#co-copper)" className={animated ? 'animate-pop [animation-delay:.7s]' : undefined} style={{ transformOrigin: '26.6px 16px' }} />
      <defs>
        <linearGradient id="co-copper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E3925A" /><stop offset="1" stopColor="#B4531F" /></linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ height = 12, onDark, className }: { height?: number; onDark?: boolean; className?: string }) {
  return (
    <svg viewBox="-1.2 -1.2 94.2 12.4" height={height} width={(height * 94.2) / 12.4} className={cn('shrink-0', className)} aria-hidden>
      <path d={WORD} fill="none" stroke={onDark ? '#F5F5F3' : 'var(--color-ink, #111111)'} strokeWidth="2" strokeLinejoin="miter" strokeMiterlimit={10} />
    </svg>
  );
}

/** Orbiting node — the brand loading indicator. */
export function LogoLoader({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-grid place-items-center">
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <circle cx="16" cy="16" r="10.6" fill="none" stroke="var(--color-mist-3)" strokeWidth="3" />
        <g className="origin-center animate-spin [animation-duration:1.4s] [transform-box:fill-box]" style={{ transformOrigin: '16px 16px' }}>
          <path d="M16 5.4 A10.6 10.6 0 0 1 26.6 16" fill="none" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="26.6" cy="16" r="3" fill="var(--color-accent)" />
        </g>
      </svg>
    </span>
  );
}

export function Logo({ dark, compact, animated, to = '/', size = 30 }: { dark?: boolean; compact?: boolean; animated?: boolean; to?: string; size?: number }) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-2.5', dark ? 'text-white' : 'text-ink')} aria-label="CARGO ONE">
      <LogoMark size={size} onDark={dark} animated={animated} className="transition-transform duration-500 group-hover:rotate-[-8deg]" />
      {!compact ? <Wordmark height={Math.round(size * 0.4)} onDark={dark} /> : null}
    </Link>
  );
}
