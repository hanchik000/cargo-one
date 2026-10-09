// CARGO ONE design system primitives.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useT } from '@/i18n';
import { Link } from '@/lib/router';
import { IconAlert, IconCheck, IconDown, IconFile, IconInbox, IconRetry, IconSpinner, IconUpload, IconX, IconBack } from './icons';
import type { IconType } from 'react-icons';

/** Class joiner that also resolves conflicting Tailwind utilities (later wins). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ---------------- Button ----------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'metal' | 'accent' | 'danger' | 'inverse' | 'link' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'xl';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-graphite-2 disabled:bg-faint disabled:text-white shadow-[0_8px_20px_-12px_rgba(17,17,17,.6)]',
  secondary: 'bg-paper text-ink hairline hover:bg-mist disabled:text-faint',
  soft: 'bg-mist-2 text-ink hover:bg-mist-3 disabled:text-faint',
  ghost: 'text-ink hover:bg-mist-2 disabled:text-faint',
  metal: 'accent-grad text-white hover:brightness-110 disabled:opacity-50 shadow-[0_10px_24px_-12px_rgba(194,97,42,.8)]',
  accent: 'accent-grad text-white hover:brightness-110 disabled:opacity-50 shadow-[0_10px_24px_-12px_rgba(194,97,42,.8)]',
  danger: 'bg-paper text-bad hairline hover:bg-bad hover:text-white disabled:opacity-50',
  inverse: 'bg-white text-[#111] hover:bg-[#f0f0ee] disabled:opacity-60',
  link: 'text-ink underline underline-offset-4 decoration-line hover:decoration-ink px-0! h-auto! shadow-none!',
};
const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-[13px] gap-1.5',
  md: 'h-12 px-5 text-[14.5px] gap-2',
  lg: 'h-14 px-7 text-[15.5px] gap-2.5',
  xl: 'h-16 px-8 text-[16px] gap-3',
};

export interface ButtonProps {
  variant?: Variant; size?: Size; icon?: IconType; iconRight?: IconType; loading?: boolean; disabled?: boolean; full?: boolean;
  type?: 'button' | 'submit'; onClick?: () => void; children?: ReactNode; className?: string; to?: string; title?: string; 'aria-label'?: string; form?: string;
}
export function Button({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconR, loading, disabled, full, type = 'button', onClick, children, className, to, ...rest }: ButtonProps) {
  const cls = cn('press inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-[-0.01em]', VARIANTS[variant], SIZES[size], full && 'w-full', className);
  const inner = (
    <>
      {loading ? <IconSpinner className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-[17px] shrink-0" aria-hidden /> : null}
      {children}
      {IconR && !loading ? <IconR className="size-[17px] shrink-0 transition-transform group-hover/btn:translate-x-0.5" aria-hidden /> : null}
    </>
  );
  if (to && !disabled) return <Link to={to} className={cn('group/btn', cls)} onClick={onClick} {...rest}>{inner}</Link>;
  return <button type={type} className={cn('group/btn', cls)} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{inner}</button>;
}

export function IconButton({ icon: Icon, label, onClick, className, active, badge, to, size = 'md' }: { icon: IconType; label: string; onClick?: () => void; className?: string; active?: boolean; badge?: number; to?: string; size?: 'sm' | 'md' }) {
  const cls = cn('press relative inline-flex items-center justify-center rounded-full transition-colors', size === 'sm' ? 'size-10' : 'size-11', active ? 'bg-ink text-on-ink' : 'hover:bg-mist-2', className);
  const inner = (<><Icon className={size === 'sm' ? 'size-[17px]' : 'size-[19px]'} aria-hidden />{badge ? <span className="num absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-mist">{badge > 99 ? '99+' : badge}</span> : null}</>);
  if (to) return <Link to={to} className={cls} aria-label={label} title={label}>{inner}</Link>;
  return <button type="button" className={cls} onClick={onClick} aria-label={label} title={label} aria-pressed={active}>{inner}</button>;
}

// ---------------- Form fields ----------------
export function Field({ label, error, hint, children, id, optional }: { label: string; error?: string | null; hint?: string; children: (id: string, describedBy?: string) => ReactNode; id?: string; optional?: boolean }) {
  const auto = useId();
  const fid = id || auto;
  const t = useT();
  const desc = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="flex items-baseline justify-between text-[13px] font-medium text-ink">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-faint">{t('common.optional')}</span> : null}
      </label>
      {children(fid, desc)}
      {error ? <p id={`${fid}-err`} className="animate-fade-in flex items-center gap-1 text-xs text-bad" role="alert"><IconAlert className="size-3.5" aria-hidden />{error}</p>
        : hint ? <p id={`${fid}-hint`} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputCls = (error?: boolean) => cn('h-12 w-full rounded-[14px] bg-paper px-4 text-[15px] text-ink outline-none transition placeholder:text-faint', error ? 'shadow-[inset_0_0_0_1.5px_var(--color-bad)]' : 'hairline hover:shadow-[inset_0_0_0_1px_var(--color-faint)] focus:shadow-[inset_0_0_0_1.5px_var(--color-ink),0_0_0_4px_rgba(17,17,17,.06)]', 'disabled:bg-mist disabled:text-muted');

export interface InputProps { label: string; value: string | number; onChange: (v: string) => void; error?: string | null; hint?: string; type?: string; placeholder?: string; disabled?: boolean; autoComplete?: string; inputMode?: string; optional?: boolean; min?: number; max?: number; step?: number | string; maxLength?: number; name?: string; autoFocus?: boolean; prefix?: ReactNode }
export function Input({ label, value, onChange, error, hint, optional, prefix, ...rest }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional}>
      {(id, describedBy) => (
        <div className="relative">
          {prefix ? <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span> : null}
          <input id={id} aria-invalid={!!error} aria-describedby={describedBy} className={cn(inputCls(!!error), prefix ? 'pl-10' : '')} value={value} onChange={(e: { target: HTMLInputElement }) => onChange(e.target.value)} {...rest} />
        </div>
      )}
    </Field>
  );
}
export function Textarea({ label, value, onChange, error, hint, rows = 4, placeholder, optional, disabled, maxLength }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string; rows?: number; placeholder?: string; optional?: boolean; disabled?: boolean; maxLength?: number }) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional}>
      {(id, describedBy) => <textarea id={id} rows={rows} aria-invalid={!!error} aria-describedby={describedBy} placeholder={placeholder} disabled={disabled} maxLength={maxLength} className={cn(inputCls(!!error), 'h-auto py-3 leading-relaxed')} value={value} onChange={(e: { target: HTMLTextAreaElement }) => onChange(e.target.value)} />}
    </Field>
  );
}
export function Select<T extends string>({ label, value, onChange, options, error, hint, disabled }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; error?: string | null; hint?: string; disabled?: boolean }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <div className="relative">
          <select id={id} aria-describedby={describedBy} disabled={disabled} className={cn(inputCls(!!error), 'appearance-none pr-10')} value={value} onChange={(e: { target: HTMLSelectElement }) => onChange(e.target.value as T)}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <IconDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        </div>
      )}
    </Field>
  );
}
/** Compact select without a visible label (label is still exposed to assistive tech). */
export function MiniSelect<T extends string>({ label, value, onChange, options, className, icon: Icon }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; icon?: IconType }) {
  return (
    <label className={cn('relative inline-flex', className)}>
      <span className="sr-only">{label}</span>
      {Icon ? <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /> : null}
      <select aria-label={label} value={value} onChange={(e: { target: HTMLSelectElement }) => onChange(e.target.value as T)} className={cn('h-10 w-full appearance-none rounded-full bg-paper pl-4 pr-9 text-[13px] font-medium hairline outline-none hover:bg-mist', Icon && 'pl-10')}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconDown className="pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
    </label>
  );
}
export function Checkbox({ label, checked, onChange, description, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e: { target: HTMLInputElement }) => onChange(e.target.checked)} className="peer sr-only" />
      <label htmlFor={id} className={cn('mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-[7px] transition peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2', checked ? 'bg-ink text-on-ink' : 'bg-paper hairline')} aria-hidden>
        {checked ? <IconCheck className="animate-pop size-3.5" /> : null}
      </label>
      <label htmlFor={id} className="text-sm leading-snug">
        <span className="font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] text-muted">{description}</span> : null}
      </label>
    </div>
  );
}
export function Switch({ label, checked, onChange, description, hideLabel }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string; hideLabel?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className={hideLabel ? 'sr-only' : undefined}>
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="text-[13px] text-muted">{description}</div> : null}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300', checked ? 'bg-ink' : 'bg-mist-3')}>
        <span className={cn('absolute top-1 size-5 rounded-full shadow-sm transition-all duration-300 [transition-timing-function:var(--ease-out-soft)]', checked ? 'left-6 bg-on-ink' : 'left-1 bg-white')} />
      </button>
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 999, label, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; size?: 'md' | 'lg' }) {
  const t = useT();
  const h = size === 'lg' ? 'h-12' : 'h-10';
  return (
    <div className={cn('inline-flex items-center rounded-full bg-paper hairline', h)} role="group" aria-label={label}>
      <button type="button" className={cn('press grid aspect-square place-items-center rounded-full text-lg hover:bg-mist disabled:text-faint', h)} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t('common.decrease')}>−</button>
      <input aria-label={label} inputMode="numeric" className="num w-10 bg-transparent text-center text-[15px] font-semibold outline-none" value={value} onChange={(e: { target: HTMLInputElement }) => { const n = Number(e.target.value.replace(/\D/g, '')); if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n || min))); }} />
      <button type="button" className={cn('press grid aspect-square place-items-center rounded-full text-lg hover:bg-mist disabled:text-faint', h)} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t('common.increase')}>+</button>
    </div>
  );
}

// ---------------- Tabs / Segmented ----------------
export function Tabs<T extends string>({ value, onChange, items, className, variant = 'pill', label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; className?: string; variant?: 'underline' | 'pill'; label?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: { key: string; preventDefault(): void }, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[n].value); refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn('rail gap-1', variant === 'underline' ? 'border-b border-line' : 'w-fit max-w-full rounded-full bg-mist-2 p-1', className)}>
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button key={it.value} ref={(el: HTMLButtonElement | null) => { refs.current[i] = el; }} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onKeyDown={(e: { key: string; preventDefault(): void }) => onKey(e, i)} onClick={() => onChange(it.value)}
            className={cn('press whitespace-nowrap text-[13px] font-semibold transition-colors', variant === 'underline' ? cn('-mb-px border-b-2 px-3 py-3', active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink') : cn('rounded-full px-4 py-2', active ? 'bg-paper text-ink shadow-[0_2px_8px_-4px_rgba(17,17,17,.35)]' : 'text-muted hover:text-ink'))}>
            {it.label}{it.count != null ? <span className={cn('num ml-1.5', active ? 'text-muted' : 'text-faint')}>{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children, icon: Icon, size = 'md' }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: IconType; size?: 'sm' | 'md' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors', size === 'sm' ? 'h-9 px-3.5 text-[12.5px]' : 'h-10 px-4 text-[13px]', active ? 'bg-ink text-on-ink' : 'bg-paper text-ink hairline hover:bg-mist')}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}{children}
    </button>
  );
}

// ---------------- Badges ----------------
type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'dark' | 'metal' | 'accent' | 'glass';
const TONES: Record<Tone, string> = {
  neutral: 'bg-mist-2 text-ink', ok: 'bg-ok/10 text-ok', warn: 'bg-warn/10 text-warn', bad: 'bg-bad/10 text-bad', info: 'bg-info/10 text-info', dark: 'bg-ink text-on-ink',
  metal: 'bg-accent-soft text-accent', accent: 'accent-grad text-white', glass: 'bg-white/85 text-[#111] backdrop-blur',
};
export function Badge({ tone = 'neutral', children, icon: Icon, className }: { tone?: Tone; children: ReactNode; icon?: IconType; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold', TONES[tone], className)}>{Icon ? <Icon className="size-3.5" aria-hidden /> : null}{children}</span>;
}
const STATUS_TONE: Record<string, Tone> = {
  delivered: 'ok', paid: 'ok', succeeded: 'ok', supplier_paid: 'ok', active: 'ok', approved: 'ok', passed: 'ok', verified: 'ok', resolved: 'ok', completed: 'ok', accepted: 'ok', responded: 'info',
  passed_notes: 'warn', pending: 'warn', under_review: 'warn', pending_payment: 'warn', draft: 'neutral', processing: 'info', shipped: 'info', in_transit: 'info', open: 'info', in_progress: 'info', authorized: 'info', sent: 'info', scheduled: 'info',
  failed: 'bad', rejected: 'bad', cancelled: 'neutral', refunded: 'neutral', suspended: 'bad', expired: 'neutral', declined: 'bad', ended: 'neutral', not_inspected: 'neutral',
};
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = STATUS_TONE[status] || 'neutral';
  const live = tone === 'info' || tone === 'warn';
  return <Badge tone={tone}><span className={cn('size-1.5 rounded-full bg-current', live && 'animate-pulse')} aria-hidden />{label}</Badge>;
}

/** CARGO ONE verification seal — a closed route ring with a check. Used only where a real verification record exists. */
export function VerifiedSeal({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('shrink-0', className)} aria-hidden>
      <circle cx="12" cy="12" r="10.2" fill={onDark ? '#ffffff' : 'var(--color-ink)'} />
      <circle cx="12" cy="12" r="7.4" fill="none" stroke={onDark ? '#111111' : 'var(--color-on-ink)'} strokeOpacity=".22" strokeWidth="1.1" strokeDasharray="2.2 1.6" />
      <path d="M8 12.3l2.6 2.6L16.2 9.2" fill="none" stroke={onDark ? '#111111' : 'var(--color-on-ink)'} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.6" cy="5.4" r="2.6" fill="var(--color-accent)" stroke={onDark ? '#111111' : 'var(--color-mist)'} strokeWidth="1.2" />
    </svg>
  );
}
export function VerifiedBadge({ label, size = 'md', onDark, className }: { label?: string; size?: 'sm' | 'md' | 'lg'; onDark?: boolean; className?: string }) {
  const t = useT();
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold uppercase tracking-[0.1em]', onDark ? 'bg-white/10 text-white ring-1 ring-white/15' : 'bg-paper text-ink shadow-[0_2px_10px_-4px_rgba(17,17,17,.25)]',
      size === 'sm' ? 'h-6 pl-0.5 pr-2.5 text-[9.5px]' : size === 'lg' ? 'h-9 pl-1 pr-4 text-[12px]' : 'h-7 pl-0.5 pr-3 text-[10.5px]', className)}>
      <VerifiedSeal className={size === 'sm' ? 'size-5' : size === 'lg' ? 'size-7' : 'size-6'} onDark={onDark} />{label || t('badge.verified')}
    </span>
  );
}
export function ScoreBadge({ score, label, size = 'sm', demo }: { score: number; label?: string; size?: 'sm' | 'lg'; demo?: boolean }) {
  const t = useT();
  const tone = score >= 85 ? 'bg-ok' : score >= 70 ? 'bg-warn' : 'bg-bad';
  if (size === 'lg') return <ScoreRing score={score} label={label} />;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" title={demo ? t('score.demo_hint') : undefined}>
      <span className="relative inline-flex h-1.5 w-7 overflow-hidden rounded-full bg-mist-3" aria-hidden><span className={cn('absolute inset-y-0 left-0 rounded-full', tone)} style={{ width: `${score}%` }} /></span>
      <span className="num font-semibold text-ink">{score}</span>
      <span className="text-muted">{label || t('score.supplier')}</span>
    </span>
  );
}
function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => { const k = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - k, 3); setV(Math.round(target * e)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
export function ScoreRing({ score, label, max = 100, size = 96, dark, caption }: { score: number; label?: string; max?: number; size?: number; dark?: boolean; caption?: string }) {
  const shown = useCountUp(score);
  const r = 34; const c = 2 * Math.PI * r;
  const tone = score >= 85 ? 'var(--color-ok)' : score >= 70 ? 'var(--color-warn)' : 'var(--color-bad)';
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label || ''} ${score}/${max}`}>
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke={dark ? 'rgba(255,255,255,.12)' : 'var(--color-mist-2)'} strokeWidth="5" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (shown / max) * c} />
        {Array.from({ length: 40 }, (_, i) => <line key={i} x1="40" y1="1.5" x2="40" y2="3.2" stroke={dark ? 'rgba(255,255,255,.25)' : 'var(--color-faint)'} strokeWidth=".6" transform={`rotate(${i * 9} 40 40)`} />)}
      </svg>
      <div className="text-center">
        <div className="num font-semibold leading-none tracking-tight" style={{ fontSize: size * 0.3 }}>{shown}</div>
        <div className={cn('num text-[10px]', dark ? 'text-white/50' : 'text-muted')}>{caption ?? `/${max}`}</div>
      </div>
    </div>
  );
}
/** Linear score bar. "estimate" text is required wherever the number is a model output. */
export function ScoreBar({ score, label, note, dark }: { score: number; label: string; note?: string; dark?: boolean }) {
  const tone = score >= 85 ? 'bg-ok' : score >= 70 ? 'bg-warn' : 'bg-bad';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]"><span className={dark ? 'text-white/70' : 'text-muted'}>{label}</span><span className="num font-semibold">{score}<span className={cn('text-[11px] font-normal', dark ? 'text-white/40' : 'text-faint')}>/100</span></span></div>
      <div className={cn('mt-1.5 h-1.5 overflow-hidden rounded-full', dark ? 'bg-white/10' : 'bg-mist-2')}><div className={cn('grow-x h-full rounded-full', tone)} style={{ width: `${score}%` }} /></div>
      {note ? <div className={cn('mt-1 text-[11px]', dark ? 'text-white/40' : 'text-faint')}>{note}</div> : null}
    </div>
  );
}

// ---------------- Feedback ----------------
export function Skeleton({ className }: { className?: string }) { return <div className={cn('skeleton rounded-[14px]', className)} aria-hidden />; }
export function SkeletonGrid({ count = 8, className = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4' }: { count?: number; className?: string }) {
  const t = useT();
  return <div className={className} role="status" aria-label={t('common.loading')}>{Array.from({ length: count }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="aspect-[4/5] w-full rounded-[22px]" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>)}</div>;
}
export function SkeletonRows({ count = 5 }: { count?: number }) {
  const t = useT();
  return <div className="space-y-2" role="status" aria-label={t('common.loading')}>{Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
}
export function EmptyState({ icon: Icon = IconInbox, title, body, action }: { icon?: IconType; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="animate-rise flex flex-col items-center px-6 py-16 text-center">
      <div className="relative mb-6 grid size-20 place-items-center rounded-full bg-paper shadow-[var(--shadow-soft)]">
        <div className="dot-grid absolute inset-0 rounded-full opacity-60" aria-hidden />
        <Icon className="relative size-7 text-ink" strokeWidth={1.6} aria-hidden />
        <span className="absolute right-1 top-1 size-3 rounded-full bg-accent ring-4 ring-mist" aria-hidden />
      </div>
      <h3 className="text-[19px] font-semibold tracking-tight">{title}</h3>
      {body ? <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  );
}
export function ErrorState({ error, onRetry, compact }: { error?: Error | null; onRetry?: () => void; compact?: boolean }) {
  const t = useT();
  const code = (error as { code?: string } | null)?.code;
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-6' : 'px-6 py-16')} role="alert">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-bad/10"><IconAlert className="size-6 text-bad" aria-hidden /></div>
      <h3 className="text-[17px] font-semibold">{code === 'not_found' ? t('error.not_found') : t('error.title')}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{code === 'not_found' ? t('error.not_found_body') : t('error.body')}</p>
      {onRetry && code !== 'not_found' ? <Button className="mt-5" variant="secondary" icon={IconRetry} onClick={onRetry}>{t('common.retry')}</Button> : null}
    </div>
  );
}
export function Notice({ tone = 'info', children, icon: Icon = IconAlert, title }: { tone?: 'info' | 'warn' | 'bad' | 'ok' | 'neutral'; children?: ReactNode; icon?: IconType; title?: string }) {
  const cls = { info: 'bg-info/[0.07]', warn: 'bg-warn/[0.09]', bad: 'bg-bad/[0.08]', ok: 'bg-ok/[0.08]', neutral: 'bg-mist-2/80' }[tone];
  const ic = { info: 'text-info', warn: 'text-warn', bad: 'text-bad', ok: 'text-ok', neutral: 'text-muted' }[tone];
  return (
    <div className={cn('flex gap-3 rounded-[16px] p-4 text-[13px] leading-relaxed text-ink', cls)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', ic)} aria-hidden />
      <div className="min-w-0">{title ? <div className="font-semibold">{title}</div> : null}{children}</div>
    </div>
  );
}
export function Progress({ value, max = 100, label, className, dark, accent }: { value: number; max?: number; label?: string; className?: string; dark?: boolean; accent?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full', dark ? 'bg-white/12' : 'bg-mist-2', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cn('grow-x h-full rounded-full transition-[width] duration-700 ease-out', accent ? 'accent-grad' : dark ? 'bg-white' : 'bg-ink')} style={{ width: `${pct}%` }} />
    </div>
  );
}
export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span className={cn('inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2b2b2e] to-[#111] font-semibold text-white', className)} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials}</span>;
}
export function StatCard({ label, value, sub, icon: Icon, to, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: IconType; to?: string; tone?: 'dark' }) {
  const body = (
    <div className={cn('card lift flex h-full flex-col gap-4 p-5', tone === 'dark' && 'bg-[#111]! text-white')}>
      <div className="flex items-center justify-between">
        <span className={cn('eyebrow', tone === 'dark' && 'text-white/55')}>{label}</span>
        {Icon ? <span className={cn('grid size-8 place-items-center rounded-full', tone === 'dark' ? 'bg-white/10' : 'bg-mist')}><Icon className={cn('size-4', tone === 'dark' ? 'text-white/70' : 'text-muted')} aria-hidden /></span> : null}
      </div>
      <div>
        <div className="num text-[28px] font-semibold leading-none tracking-tight">{value}</div>
        {sub ? <div className={cn('mt-2 text-xs', tone === 'dark' ? 'text-white/55' : 'text-muted')}>{sub}</div> : null}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full rounded-[24px]">{body}</Link> : body;
}

// ---------------- Overlays ----------------
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') || []);
    setTimeout(() => { (el?.querySelector<HTMLElement>('[data-autofocus]') || focusables()[0] || el)?.focus(); }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, size = 'md', description }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; description?: string }) {
  const ref = useFocusTrap(open, onClose);
  const t = useT();
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade-in absolute inset-0 bg-[#111]/45 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cn('relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-paper text-ink shadow-2xl outline-none sm:rounded-[28px]', 'max-sm:animate-sheet sm:animate-pop', { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size])}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-mist-3 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-4 sm:px-7 sm:pt-7">
          <div>
            <h2 id={titleId} className="text-[20px] font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <IconButton icon={IconX} label={t('common.close')} onClick={onClose} size="sm" className="-mr-2 -mt-1 bg-mist" />
        </div>
        <div className="scroll-thin overflow-y-auto px-6 pb-6 sm:px-7">{children}</div>
        {footer ? <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 sm:px-7">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
/** Bottom sheet on mobile, right-side panel on desktop. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useFocusTrap(open, onClose);
  const t = useT();
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="animate-fade-in absolute inset-0 bg-[#111]/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="max-md:animate-sheet md:animate-[sheet-x_.45s_var(--ease-emph)_both] absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[28px] bg-paper text-ink outline-none md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[440px] md:rounded-[28px]">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-mist-3 md:hidden" aria-hidden />
        <div className="flex items-center justify-between px-6 py-4">
          <h2 id={titleId} className="text-[18px] font-semibold tracking-tight">{title}</h2>
          <IconButton icon={IconX} label={t('common.close')} onClick={onClose} size="sm" className="bg-mist" />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer ? <div className="safe-bottom flex gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
      </div>
      <style>{'@keyframes sheet-x{from{transform:translateX(105%)}to{transform:none}}'}</style>
    </div>,
    document.body,
  );
}
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel: string; danger?: boolean; loading?: boolean }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {body ? <p className="text-sm text-muted">{body}</p> : null}
    </Modal>
  );
}

// ---------------- Toasts ----------------
type ToastItem = { id: number; message: string; tone: 'ok' | 'bad' | 'info'; action?: { label: string; to: string } };
const ToastCtx = createContext<(message: string, tone?: ToastItem['tone'], action?: ToastItem['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastItem['tone'] = 'ok', action?: ToastItem['action']) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite" role="status">
        {items.map((it) => (
          <div key={it.id} className="animate-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-[#111] py-2.5 pl-3 pr-2.5 text-sm text-white shadow-[var(--shadow-float)]">
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', it.tone === 'bad' ? 'bg-bad' : 'accent-grad')}>{it.tone === 'bad' ? <IconAlert className="size-4" aria-hidden /> : <IconCheck className="size-4" aria-hidden />}</span>
            <span className="flex-1 pr-1">{it.message}</span>
            {it.action ? <Link to={it.action.to} className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/20">{it.action.label}</Link> : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Upload ----------------
export function UploadBox({ accept, onFile, label, hint, icon: Icon = IconUpload, busy, progress, compact, capture, title, large }: { accept: string; onFile: (f: File) => void; label: string; hint?: string; icon?: IconType; busy?: boolean; progress?: number; compact?: boolean; capture?: boolean; title?: string; large?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const id = useId();
  return (
    <div
      onDragOver={(e: { preventDefault(): void }) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: { preventDefault(): void; dataTransfer: DataTransfer }) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={cn('group relative flex flex-col items-center justify-center overflow-hidden rounded-[24px] border-[1.5px] border-dashed text-center transition-all duration-300', compact ? 'gap-2 px-4 py-6' : large ? 'gap-4 px-6 py-16 md:py-20' : 'gap-3 px-6 py-12', over ? 'scale-[1.01] border-ink bg-paper shadow-[var(--shadow-lift)]' : 'border-mist-3 bg-paper hover:border-faint')}
    >
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <span className={cn('relative grid place-items-center rounded-full transition-transform duration-500 group-hover:-translate-y-0.5', compact ? 'size-10 bg-mist' : 'size-16 bg-ink text-on-ink shadow-[0_14px_30px_-14px_rgba(17,17,17,.7)]', over && 'scale-110')}>
        <Icon className={compact ? 'size-5 text-muted' : 'size-7'} aria-hidden />
      </span>
      <div className="relative">
        {title ? <div className="mb-1 text-[17px] font-semibold tracking-tight">{title}</div> : null}
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold underline decoration-mist-3 underline-offset-4 hover:decoration-ink">{label}</label>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
      <input ref={input} id={id} type="file" accept={accept} capture={capture ? 'environment' : undefined} className="sr-only" disabled={busy} onChange={(e: { target: HTMLInputElement }) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {busy ? <div className="absolute inset-x-8 bottom-5"><Progress value={progress ?? 60} accent /></div> : null}
    </div>
  );
}
export function FileCard({ name, meta, onRemove, href }: { name: string; meta?: string; onRemove?: () => void; href?: string }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-paper p-3 hairline">
      <div className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-mist"><IconFile className="size-4 text-muted" aria-hidden /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {meta ? <div className="text-xs text-muted">{meta}</div> : null}
      </div>
      {href ? <a href={href} className="text-[13px] font-medium underline underline-offset-4" download>{t('common.download')}</a> : null}
      {onRemove ? <IconButton icon={IconX} label={t('common.remove')} onClick={onRemove} size="sm" /> : null}
    </div>
  );
}

// ---------------- Layout helpers ----------------
export function PageHeader({ eyebrow, title, subtitle, actions, back, display }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; display?: boolean }) {
  return (
    <header className="animate-rise mb-7 flex flex-col gap-4 md:mb-9 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back ? <Link to={back.to} className="press mb-4 inline-flex h-9 items-center gap-1 rounded-full bg-paper pl-2 pr-3.5 text-[13px] font-medium text-muted hairline hover:text-ink"><IconBack className="size-4" aria-hidden />{back.label}</Link> : null}
        {eyebrow ? <div className="eyebrow mb-2.5 flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />{eyebrow}</div> : null}
        <h1 className={display ? 'display text-[30px] uppercase md:text-[46px]' : 'headline text-[32px] md:text-[44px]'}>{title}</h1>
        {subtitle ? <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
export function SectionTitle({ title, action, sub, eyebrow }: { title: string; action?: ReactNode; sub?: string; eyebrow?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <h2 className="text-[20px] font-semibold tracking-tight md:text-[22px]">{title}</h2>
        {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}
export function Disclosure({ title, children, defaultOpen, meta, icon: Icon }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; meta?: ReactNode; icon?: IconType }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="group flex w-full items-center justify-between gap-4 py-5 text-left">
        <span className="flex items-center gap-3 text-[15px] font-semibold tracking-tight">{Icon ? <span className="grid size-9 place-items-center rounded-full bg-mist"><Icon className="size-4" aria-hidden /></span> : null}{title}</span>
        <span className="flex items-center gap-3">{meta}<span className={cn('grid size-8 place-items-center rounded-full bg-mist transition-transform duration-300 group-hover:bg-mist-2', open && 'rotate-180')}><IconDown className="size-4 text-muted" aria-hidden /></span></span>
      </button>
      {open ? <div id={id} className="animate-rise pb-6 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
export function KV({ k, v, strong, mono = true }: { k: ReactNode; v: ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2 text-sm', strong && 'font-semibold')}>
      <span className={strong ? '' : 'text-muted'}>{k}</span>
      <span className={cn('text-right', mono && 'num')}>{v}</span>
    </div>
  );
}

// ---------------- Data table (cards on mobile) ----------------
export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode; className?: string; mobile?: boolean }
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty, mobileTitle, dense }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode; mobileTitle?: (r: T) => ReactNode; dense?: boolean }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[18px] bg-paper hairline md:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-mist/60 text-[11px] uppercase tracking-[0.08em] text-muted">
              {columns.map((c) => <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 font-semibold', dense ? 'py-2.5' : 'py-3', c.className)}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('border-b border-line/70 transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-mist/80')}>
                {columns.map((c) => <td key={c.key} className={cn('px-4 align-middle', dense ? 'py-2.5' : 'py-3.5', c.className)}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="card p-4">
            {mobileTitle ? <div className="mb-2 font-semibold">{mobileTitle(r)}</div> : null}
            <dl className="space-y-1.5">
              {columns.filter((c) => c.mobile !== false).map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 text-[13px]"><dt className="text-muted">{c.header}</dt><dd className="min-w-0 text-right">{c.cell(r)}</dd></div>
              ))}
            </dl>
            {onRowClick ? <OpenRowButton onClick={() => onRowClick(r)} /> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function OpenRowButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" className="press mt-3 w-full rounded-full bg-mist py-2.5 text-[13px] font-semibold" onClick={onClick}>{t('common.open')}</button>;
}

/** Checkout-style stepper with an animated progress line. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const t = useT();
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;
  return (
    <div className="relative">
      <div className="absolute left-3 right-3 top-3 h-[2px] rounded-full bg-mist-3" aria-hidden><div className="h-full rounded-full bg-ink transition-[width] duration-700 [transition-timing-function:var(--ease-out-soft)]" style={{ width: `${pct}%` }} /></div>
      <ol className="relative flex justify-between" aria-label={t('common.progress')}>
        {steps.map((s, i) => (
          <li key={s} className="flex flex-col items-center gap-2" aria-current={i === current ? 'step' : undefined}>
            <span className={cn('num grid size-6 place-items-center rounded-full text-[11px] font-semibold transition-all duration-500', i < current ? 'bg-ink text-on-ink' : i === current ? 'scale-110 bg-ink text-on-ink ring-[5px] ring-ink/10' : 'bg-paper text-muted hairline')}>{i < current ? <IconCheck className="size-3.5" /> : i + 1}</span>
            <span className={cn('hidden whitespace-nowrap text-[12px] sm:block', i === current ? 'font-semibold text-ink' : 'text-muted')}>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 text-center text-[13px] font-semibold sm:hidden">{steps[current]}</div>
    </div>
  );
}

/** Fading image with a graceful placeholder. */
export function Img({ src, alt, className, imgClassName, eager, fallback }: { src: string; alt: string; className?: string; imgClassName?: string; eager?: boolean; fallback?: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => { setState('loading'); const el = ref.current; if (el?.complete && el.naturalWidth) setState('ok'); }, [src]);
  if (state === 'err' && fallback) return <>{fallback}</>;
  return (
    <div className={cn('relative overflow-hidden bg-mist-2', className)}>
      {state === 'loading' ? <div className="skeleton absolute inset-0" aria-hidden /> : null}
      {state !== 'err' ? <img ref={ref} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={() => setState('ok')} onError={() => setState('err')} className={cn('zoom-target absolute inset-0 size-full object-cover', state === 'ok' ? 'img-in' : 'opacity-0', imgClassName)} /> : null}
    </div>
  );
}
