import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n, LANGS } from '@/i18n';
import type { StringKey } from '@/i18n';
import { Link, navigate, useLocation } from '@/lib/router';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { useDbRevision, useDebounced, usePersisted } from '@/lib/hooks';
import { notificationService, contentService } from '@/services/accountServices';
import { searchService } from '@/services/searchService';
import { vipService } from '@/services/vipService';
import type { Role } from '@/lib/types';
import { Avatar, Button, cn, IconButton, Modal, Sheet } from './ui';
import { Logo as BrandLogo, LogoLoader } from './brand';
import {
  IconAdmin, IconAI, IconArrow, IconAuto, IconBell, IconBusiness, IconCargo, IconCart, IconCommand, IconCrown, IconDown, IconFactory, IconHeart,
  IconHome, IconPin, IconProfile, IconScan, IconSearch, IconShop, IconTrack, IconUsers, IconWallet, IconX, IconCheck, IconLayers,
} from './icons';
import type { IconType } from 'react-icons';

export function Logo({ dark, compact, animated }: { dark?: boolean; compact?: boolean; animated?: boolean }) {
  return <BrandLogo dark={dark} compact={compact} animated={animated} />;
}

interface NavItem { to: string; label: StringKey; icon: IconType; roles?: Role[]; match?: string[] }
const PRIMARY: NavItem[] = [
  { to: '/', label: 'nav.home', icon: IconHome },
  { to: '/shop', label: 'nav.shop', icon: IconShop, match: ['/shop', '/compare', '/cart', '/checkout'] },
  { to: '/find', label: 'nav.find', icon: IconScan },
  { to: '/ai-buyer', label: 'nav.ai_buyer', icon: IconAI },
  { to: '/pay', label: 'nav.pay', icon: IconWallet },
  { to: '/cargo', label: 'nav.cargo', icon: IconCargo, match: ['/cargo', '/track', '/orders'] },
  { to: '/auto', label: 'nav.auto', icon: IconAuto },
];
const SECONDARY: NavItem[] = [
  { to: '/group-buy', label: 'nav.group_buy', icon: IconUsers },
  { to: '/suppliers', label: 'nav.suppliers', icon: IconFactory },
  { to: '/vip', label: 'nav.vip', icon: IconCrown },
];
const ROLE_NAV: NavItem[] = [
  { to: '/business', label: 'nav.business', icon: IconBusiness, roles: ['business', 'admin'] },
  { to: '/supplier', label: 'nav.supplier_portal', icon: IconLayers, roles: ['supplier', 'admin'] },
  { to: '/admin', label: 'nav.admin', icon: IconAdmin, roles: ['admin'] },
];
const MOBILE: NavItem[] = [
  { to: '/', label: 'nav.home', icon: IconHome },
  { to: '/shop', label: 'nav.shop', icon: IconShop, match: ['/shop', '/find', '/ai-buyer', '/cart', '/checkout', '/compare', '/suppliers', '/group-buy'] },
  { to: '/cargo', label: 'nav.cargo', icon: IconCargo, match: ['/cargo', '/track', '/orders', '/pay'] },
  { to: '/auto', label: 'nav.auto', icon: IconAuto },
  { to: '/profile', label: 'nav.profile', icon: IconProfile, match: ['/profile', '/favorites', '/notifications', '/vip', '/support', '/business', '/admin', '/supplier', '/login', '/register'] },
];

function isActive(item: NavItem, pathname: string) {
  if (item.to === '/') return pathname === '/';
  return (item.match || [item.to]).some((m) => pathname === m || pathname.startsWith(m + '/'));
}

export const CITIES = ['Ashgabat', 'Mary', 'Turkmenabat', 'Dashoguz', 'Balkanabat', 'Turkmenbashi', 'Awaza'];
export function useCity() { return usePersisted<string>('city', 'Ashgabat'); }

export function LanguageSwitcher({ dark, compact }: { dark?: boolean; compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('common.language')} className={cn('inline-flex rounded-full p-1', dark ? 'bg-white/10' : 'bg-mist-2')}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" onClick={() => setLang(l.code)} aria-pressed={lang === l.code} title={l.name}
          className={cn('rounded-full font-semibold transition', compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]', lang === l.code ? (dark ? 'bg-white text-[#111]' : 'bg-paper text-ink shadow-sm') : dark ? 'text-white/60 hover:text-white' : 'text-muted hover:text-ink')}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

function CityPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [city, setCity] = useCity();
  return (
    <Sheet open={open} onClose={onClose} title={t('location.title')}>
      <p className="mb-4 text-sm text-muted">{t('location.body')}</p>
      <ul className="space-y-1.5">
        {CITIES.map((c) => (
          <li key={c}><button type="button" onClick={() => { setCity(c); onClose(); }} className={cn('press flex w-full items-center justify-between rounded-[16px] px-4 py-3.5 text-left text-[15px] font-medium', c === city ? 'bg-ink text-on-ink' : 'bg-mist hover:bg-mist-2')}>{c}{c === city ? <IconCheck className="size-4" aria-hidden /> : null}</button></li>
        ))}
      </ul>
    </Sheet>
  );
}

export function CityButton({ dark }: { dark?: boolean }) {
  const [city] = useCity();
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('press inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium', dark ? 'text-white/80 hover:bg-white/10' : 'text-muted hover:bg-mist-2 hover:text-ink')} aria-label={t('location.title')}>
        <IconPin className="size-4" aria-hidden />{city}<IconDown className="size-3.5" aria-hidden />
      </button>
      <CityPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ---------------- Command palette (Cmd/Ctrl + K) ----------------
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tk } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 120);
  const hits = useMemo(() => searchService.unified(dq), [dq]);
  const quick: { label: StringKey; href: string; icon: IconType }[] = [
    { label: 'home.qa.find_photo', href: '/find?mode=image', icon: IconScan }, { label: 'home.qa.ai_buyer', href: '/ai-buyer', icon: IconAI },
    { label: 'home.qa.pay_supplier', href: '/pay', icon: IconWallet }, { label: 'home.qa.track', href: '/track', icon: IconTrack }, { label: 'nav.auto', href: '/auto/search', icon: IconAuto },
  ];
  const list = q.trim().length >= 2 ? hits.map((h) => ({ key: h.kind + h.id, title: h.title, sub: `${tk(`search.kind.${h.kind}`)}${h.subtitle ? ' · ' + (h.kind === 'order' ? tk(`status.order.${h.subtitle}`) : h.kind === 'tracking' && h.subtitle ? tk(`stage.${h.subtitle}`) : h.subtitle) : ''}`, href: h.href, icon: undefined as IconType | undefined }))
    : quick.map((x) => ({ key: x.href, title: t(x.label), sub: '', href: x.href, icon: x.icon }));
  useEffect(() => { setActive(0); }, [dq]);
  useEffect(() => { if (open) setQ(''); }, [open]);
  const go = (href: string) => { onClose(); navigate(href); };
  return (
    <Modal open={open} onClose={onClose} title={t('search.palette_title')} size="lg">
      <div className="relative">
        <IconSearch className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input data-autofocus value={q} onChange={(e: { target: HTMLInputElement }) => setQ(e.target.value)} placeholder={t('search.palette_placeholder')} aria-label={t('search.palette_placeholder')}
          onKeyDown={(e: { key: string; preventDefault(): void }) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); if (list[active]) go(list[active].href); else if (q.trim()) go(`/shop?q=${encodeURIComponent(q.trim())}`); }
          }}
          className="h-14 w-full rounded-full bg-mist pl-12 pr-5 text-[16px] outline-none transition focus:bg-paper focus:shadow-[inset_0_0_0_1.5px_var(--color-ink),0_0_0_5px_rgba(17,17,17,.06)]" />
      </div>
      <div className="eyebrow mb-2 mt-6">{q.trim().length >= 2 ? t('search.results') : t('search.quick')}</div>
      {list.length ? (
        <ul role="listbox" aria-label={t('search.results')} className="stagger space-y-1">
          {list.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h.href)} className={cn('flex w-full items-center justify-between gap-3 rounded-[16px] px-3.5 py-3 text-left transition-colors', i === active ? 'bg-ink text-on-ink' : 'hover:bg-mist')}>
                <span className="flex min-w-0 items-center gap-3">
                  {h.icon ? <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', i === active ? 'bg-white/15' : 'bg-mist')}><h.icon className="size-4" aria-hidden /></span> : null}
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{h.title}</span>{h.sub ? <span className={cn('block truncate text-xs', i === active ? 'opacity-60' : 'text-muted')}>{h.sub}</span> : null}</span>
                </span>
                <IconArrow className="size-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-6 text-center text-sm text-muted">
          {t('search.no_results')}
          <div className="mt-3 flex justify-center gap-2"><Button size="sm" variant="secondary" onClick={() => go(`/shop?q=${encodeURIComponent(q)}`)}>{t('search.in_shop')}</Button><Button size="sm" variant="secondary" onClick={() => go(`/ai-buyer?q=${encodeURIComponent(q)}`)}>{t('search.ask_ai')}</Button></div>
        </div>
      )}
      <div className="mt-5 hidden items-center gap-4 text-[11px] text-faint md:flex"><span>↑↓ {t('search.kbd_nav')}</span><span>↵ {t('search.kbd_open')}</span><span>Esc {t('search.kbd_close')}</span></div>
    </Modal>
  );
}

// ---------------- Shell ----------------
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { t } = useI18n();
  const active = isActive(item, pathname);
  return (
    <Link to={item.to} aria-current={active ? 'page' : undefined}
      className={cn('press group relative flex h-11 items-center gap-3 rounded-full px-4 text-[14px] font-medium transition-colors', active ? 'bg-ink text-on-ink shadow-[0_10px_24px_-14px_rgba(17,17,17,.7)]' : 'text-muted hover:bg-paper hover:text-ink')}>
      <item.icon className="size-[18px]" aria-hidden />
      {t(item.label)}
      {active ? <span className="absolute right-4 size-1.5 rounded-full bg-accent" aria-hidden /> : null}
    </Link>
  );
}

function VipNudge() {
  const { t } = useI18n();
  const { user } = useAuth();
  useDbRevision();
  if (user && vipService.isActive(user.id)) return null;
  return (
    <Link to="/vip" className="sheen group relative block overflow-hidden rounded-[22px] bg-[#111] p-4 text-white">
      <div className="dot-grid-dark absolute inset-0" aria-hidden />
      <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60"><IconCrown className="size-3.5 text-accent-2" aria-hidden />VIP</div>
      <div className="relative mt-2 text-[14px] font-semibold leading-snug">{t('vip.nudge')}</div>
      <div className="relative mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent-2">150 TMT / {t('vip.month_short')}<IconArrow className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></div>
    </Link>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const roleItems = ROLE_NAV.filter((i) => user && i.roles!.includes(user.role));
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line bg-mist lg:flex" aria-label={t('nav.main')}>
      <div className="px-6 pb-5 pt-6"><Logo animated /></div>
      <nav className="scroll-thin flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {PRIMARY.map((i) => <NavLink key={i.to} item={i} pathname={pathname} />)}
        <div className="mx-4 my-3 h-px bg-line" aria-hidden />
        {SECONDARY.map((i) => <NavLink key={i.to} item={i} pathname={pathname} />)}
        {roleItems.length ? <div className="eyebrow px-4 pb-2 pt-5">{t('nav.workspace')}</div> : null}
        {roleItems.map((i) => <NavLink key={i.to} item={i} pathname={pathname} />)}
      </nav>
      <div className="space-y-3 p-4">
        {roleItems.length ? <div className="[@media(max-height:960px)]:hidden"><VipNudge /></div> : <div className="[@media(max-height:720px)]:hidden"><VipNudge /></div>}
        <div className="flex items-center justify-between gap-2"><LanguageSwitcher compact /></div>
        {user ? (
          <Link to="/profile" className="press flex items-center gap-3 rounded-full bg-paper p-1.5 pr-4 hairline hover:bg-white">
            <Avatar name={user.name} size={34} />
            <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{user.name}</span><span className="block text-[11px] text-muted">{t(`role.${user.role}` as StringKey)}</span></span>
          </Link>
        ) : <Button full size="md" to="/login">{t('auth.sign_in')}</Button>}
      </div>
    </aside>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { count } = useCart();
  useDbRevision();
  const unread = user ? notificationService.unreadCount() : 0;
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 8); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  return (
    <header className={cn('sticky top-0 z-30 transition-[box-shadow,background-color] duration-300', scrolled ? 'glass shadow-[0_1px_0_var(--color-line)]' : 'bg-mist')}>
      <div className="mx-auto flex h-[64px] max-w-[1320px] items-center gap-2 px-4 md:px-8">
        <div className="lg:hidden"><Logo /></div>
        <div className="hidden md:block lg:-ml-3"><CityButton /></div>
        <button type="button" onClick={onSearch} className="press ml-auto hidden h-11 w-[360px] items-center gap-2.5 rounded-full bg-paper px-4 text-left text-[13.5px] text-muted shadow-[var(--shadow-soft)] hover:text-ink md:flex" aria-label={t('search.palette_title')}>
          <IconSearch className="size-[18px] shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{t('search.palette_placeholder')}</span>
          <kbd className="inline-flex items-center gap-0.5 rounded-full bg-mist px-2 py-0.5 text-[11px] font-medium"><IconCommand className="size-3" aria-hidden />K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-0.5 md:ml-2">
          <IconButton icon={IconSearch} label={t('search.palette_title')} onClick={onSearch} className="md:hidden" />
          <IconButton icon={IconHeart} label={t('nav.favorites')} to="/favorites" className="hidden md:inline-flex" />
          <IconButton icon={IconCart} label={t('nav.cart')} to="/cart" badge={count} />
          <IconButton icon={IconBell} label={t('nav.notifications')} to="/notifications" badge={unread} />
          {user ? <Link to="/profile" className="press ml-1 rounded-full ring-2 ring-paper" aria-label={t('nav.profile')}><Avatar name={user.name} size={36} /></Link>
            : <Button size="sm" variant="primary" to="/login" className="ml-1 hidden sm:inline-flex">{t('auth.sign_in')}</Button>}
        </div>
      </div>
    </header>
  );
}

/** Floating dock with a sliding active indicator. */
function BottomNav({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const idx = MOBILE.findIndex((i) => isActive(i, pathname));
  return (
    <nav className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[460px] lg:hidden" aria-label={t('nav.main')}>
      <div className="relative rounded-[28px] bg-[#111]/[0.94] p-1.5 shadow-[var(--shadow-float)] ring-1 ring-white/5 backdrop-blur-xl">
        {idx >= 0 ? <span className="absolute inset-y-1.5 left-1.5 rounded-[22px] bg-white transition-transform duration-500 [transition-timing-function:var(--ease-out-soft)]" style={{ width: 'calc((100% - 12px) / 5)', transform: `translateX(${idx * 100}%)` }} aria-hidden /> : null}
        <ul className="relative grid grid-cols-5">
          {MOBILE.map((item, i) => {
            const active = i === idx;
            return (
              <li key={item.to}>
                <Link to={item.to} aria-current={active ? 'page' : undefined} className={cn('press flex h-[54px] flex-col items-center justify-center gap-[3px] text-[10.5px] font-semibold tracking-wide transition-colors duration-300', active ? 'text-[#111]' : 'text-white/55 hover:text-white')}>
                  <item.icon className={cn('size-[20px] transition-transform duration-300', active && 'scale-105')} aria-hidden />
                  {t(item.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function Banner() {
  const c = contentService.get();
  const { user } = useAuth();
  const [dismissed, setDismissed] = usePersisted<string>('banner.dismissed', '');
  const { t, lang } = useI18n();
  useDbRevision();
  const text = c.banner.i18n?.[lang] || c.banner.text;
  // VIP members see no promotional banners ("No ads").
  if (!c.banner.enabled || dismissed === c.banner.text || (user && vipService.isActive(user.id))) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-[#111] px-4 py-2 text-center text-[12.5px] text-white/80">
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent-2" aria-hidden />
      <Link to={c.banner.link || '/'} className="truncate hover:text-white">{text}</Link>
      <button type="button" onClick={() => setDismissed(c.banner.text)} aria-label={t('common.close')} className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"><IconX className="size-3.5" aria-hidden /></button>
    </div>
  );
}

export function AppShell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const { pathname } = useLocation();
  const [palette, setPalette] = useState(false);
  const main = useRef<HTMLElement | null>(null);
  const { t } = useI18n();
  // The Auto section is a dark "showroom": same components, inverted tokens.
  const showroom = pathname === '/auto' || pathname.startsWith('/auto/');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (bare) return <>{children}<CommandPalette open={palette} onClose={() => setPalette(false)} /></>;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[100] rounded-full bg-ink px-4 py-2 text-on-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">{t('common.skip_to_content')}</a>
      <Sidebar pathname={pathname} />
      <div className={cn('min-h-dvh lg:pl-[264px]', showroom && 'theme-dark')}>
        <Banner />
        <TopBar onSearch={() => setPalette(true)} />
        <main id="main" ref={main} key={pathname} className="animate-rise mx-auto max-w-[1320px] px-4 pb-32 pt-4 md:px-8 md:pt-6 lg:pb-20">{children}</main>
      </div>
      <BottomNav pathname={pathname} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

/** Client-side guard for UX. The server enforces the same policy on every page request (full build). */
export function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const { href } = useLocation();
  const { t } = useI18n();
  useEffect(() => {
    if (!ready) return;
    if (!user) navigate(`/login?next=${encodeURIComponent(href)}`, { replace: true });
    else if (roles && !roles.includes(user.role)) navigate(`/forbidden?from=${encodeURIComponent(href)}`, { replace: true });
  }, [ready, user, roles, href]);
  if (!ready || !user || (roles && !roles.includes(user.role))) return <div className="grid min-h-[40vh] place-items-center"><LogoLoader label={t('common.loading')} /></div>;
  return <>{children}</>;
}

export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} — CARGO ONE` : 'CARGO ONE — China. One Platform.';
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
