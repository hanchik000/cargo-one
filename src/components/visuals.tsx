// Stable, local product/vehicle imagery (no external image dependencies, never broken).
import type { Car, ProductImage, CarImage } from '@/lib/types';
import { namedIcon } from './icons';
import { cn, Img } from './ui';
import { asset } from '@/lib/assets';

const TONES = ['#ecebe7', '#e6e4de', '#e9e7e2', '#dedcd6', '#efeeea', '#e3e1db'];
const toneBg = (tone: number) => TONES[tone % TONES.length];

export function ProductVisual({ icon, image, className, title, rounded = true, eager }: { icon: string; image?: ProductImage; className?: string; title?: string; rounded?: boolean; eager?: boolean }) {
  if (image?.src) return <Img src={asset(image.src)} alt={title || ''} eager={eager} className={cn('zoom-img bg-[#ebeae6]', rounded && 'rounded-[20px]', className)} />;
  const Icon = namedIcon(icon);
  const tone = image?.tone ?? 0;
  const angle = image?.angle ?? 'front';
  return (
    <div role="img" aria-label={title} className={cn('zoom-img relative isolate overflow-hidden', rounded && 'rounded-[20px]', className)} style={{ background: `radial-gradient(120% 90% at 50% 38%, #f6f5f2 0%, ${toneBg(tone)} 62%, ${toneBg(tone + 3)} 100%)` }}>
      <div className="absolute inset-x-[22%] bottom-[16%] h-[5%] rounded-[50%] bg-ink/15 blur-md" aria-hidden />
      <div className={cn('zoom-target absolute inset-0 grid place-items-center', angle === 'side' && '-rotate-12', angle === 'detail' && 'scale-[1.9] translate-x-[12%] translate-y-[10%]')}>
        <Icon className="size-[42%] text-graphite drop-shadow-[0_18px_16px_rgba(0,0,0,0.14)]" strokeWidth={0.9} aria-hidden />
      </div>
    </div>
  );
}

const CAR_COLORS: Record<string, string> = {
  'arctic blue': '#5a7896', 'graphite grey': '#4a4b4f', 'pearl white': '#f1f0ec', 'matte black': '#1d1d1f', silver: '#b9bcbf', black: '#141416', red: '#8f2a2a',
  'cloud white': '#ecebe6', white: '#f3f3f0', sand: '#c9b691', 'coral pink': '#d99a8d', 'surf blue': '#4f7ea0', platinum: '#cfd0cc',
};
const BODY_PATHS: Record<Car['body'], string> = {
  sedan: 'M30 118 C34 98 52 92 80 90 L128 66 C150 56 210 54 252 62 L300 88 C338 92 362 100 368 118 L368 128 L30 128 Z',
  hatch: 'M30 118 C34 98 52 92 82 90 L124 62 C142 52 222 50 262 60 L300 92 C334 96 360 104 366 118 L366 128 L30 128 Z',
  suv: 'M28 120 C30 96 44 88 74 84 L110 52 C122 44 240 42 270 50 L312 84 C344 88 364 98 370 118 L370 130 L28 130 Z',
  van: 'M28 122 C28 70 34 46 70 42 L300 42 C326 42 340 60 352 84 C364 92 372 102 372 120 L372 130 L28 130 Z',
  pickup: 'M26 120 C28 98 40 90 70 88 L104 54 C116 46 176 46 196 54 L206 86 L372 86 L374 120 L374 130 L26 130 Z',
};
const WINDOW_PATHS: Record<Car['body'], string> = {
  sedan: 'M92 90 L132 70 C150 62 206 60 246 66 L284 88 Z',
  hatch: 'M94 90 L130 66 C146 58 220 56 256 64 L286 92 Z',
  suv: 'M86 84 L116 56 C126 50 236 48 262 54 L298 84 Z',
  van: 'M62 80 L64 54 C66 50 290 50 298 54 L326 82 Z',
  pickup: 'M82 88 L110 58 C120 52 174 52 188 58 L196 88 Z',
};

export function CarVisual({ car, image, className, rounded = true }: { car: Pick<Car, 'body' | 'color' | 'brand' | 'model'>; image?: CarImage; className?: string; rounded?: boolean }) {
  if (image?.src) return <Img src={asset(image.src)} alt={`${car.brand} ${car.model}`} className={cn('zoom-img bg-[#151516]', rounded && 'rounded-[20px]', className)} />;
  const fill = CAR_COLORS[car.color.toLowerCase()] || '#8a8a8a';
  const view = image?.view ?? 'side';
  const tone = image?.tone ?? 0;
  const light = ['#f1f0ec', '#ecebe6', '#f3f3f0', '#cfd0cc', '#b9bcbf', '#c9b691'].includes(fill);
  return (
    <div role="img" aria-label={`${car.brand} ${car.model}`} className={cn('relative isolate overflow-hidden', rounded && 'rounded-[20px]', className)}
      style={{ background: `linear-gradient(180deg, ${tone % 2 ? '#e9e8e4' : '#ecebe7'} 0%, #f7f7f5 62%, #dcdbd6 62.2%, #e6e5e1 100%)` }}>
      {view === 'interior' ? (
        <svg viewBox="0 0 400 180" className="absolute inset-0 size-full" aria-hidden>
          <rect x="0" y="0" width="400" height="180" fill="#2a2a2d" />
          <path d="M0 120 C120 96 280 96 400 120 L400 180 L0 180 Z" fill="#1c1c1f" />
          <rect x="150" y="62" width="120" height="44" rx="8" fill="#3b3b40" stroke="#55555b" />
          <circle cx="110" cy="128" r="40" fill="none" stroke="#5c5c62" strokeWidth="9" />
          <circle cx="110" cy="128" r="10" fill="#5c5c62" />
          <rect x="300" y="110" width="70" height="40" rx="10" fill="#36363a" />
        </svg>
      ) : (
        <svg viewBox="0 0 400 180" className={cn('absolute inset-0 size-full', view === 'rear' && '-scale-x-100', view === 'front' && 'scale-[1.12]')} aria-hidden>
          <ellipse cx="200" cy="140" rx="170" ry="9" fill="rgba(0,0,0,.14)" />
          <path d={BODY_PATHS[car.body]} fill={fill} stroke={light ? '#a9a8a2' : 'none'} strokeWidth="1" />
          <path d={WINDOW_PATHS[car.body]} fill={light ? '#3a3d42' : '#262729'} opacity="0.9" />
          <path d="M40 112 L360 112" stroke={light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.12)'} strokeWidth="2" />
          <rect x={view === 'rear' ? 354 : 352} y="100" width="14" height="6" rx="3" fill={view === 'rear' ? '#b33a3a' : '#f5f2e8'} />
          {[[96, 130], [300, 130]].map(([x, y]) => (
            <g key={x}><circle cx={x} cy={y} r="22" fill="#1a1a1c" /><circle cx={x} cy={y} r="12" fill="#8d8d90" /><circle cx={x} cy={y} r="4" fill="#3a3a3d" /></g>
          ))}
        </svg>
      )}
    </div>
  );
}

export function SupplierLogo({ monogram, size = 44, className, dark }: { monogram: string; size?: number; className?: string; dark?: boolean }) {
  return (
    <div className={cn('relative grid shrink-0 place-items-center font-bold tracking-[-0.04em]', dark ? 'bg-[#111] text-white' : 'bg-paper text-ink shadow-[inset_0_0_0_1px_var(--color-line)]', className)} style={{ width: size, height: size, fontSize: size * 0.32, borderRadius: size * 0.3 }} aria-hidden>
      {monogram}
      <span className="absolute rounded-full bg-accent" style={{ width: size * 0.13, height: size * 0.13, right: size * 0.14, top: size * 0.14 }} />
    </div>
  );
}
