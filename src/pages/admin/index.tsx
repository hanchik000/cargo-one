import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n';
import { Link, navigate, useParams } from '@/lib/router';
import { analyticsService } from '@/services/accountServices';
import { orderService } from '@/services/orderService';
import { db } from '@/services/db';
import { cn, DataTable, ErrorState, SkeletonRows, StatCard, StatusBadge } from '@/components/ui';
import { statusKey } from '@/components/commerce';
import { LanguageSwitcher, usePageTitle } from '@/components/shell';
import { LogoMark, Wordmark } from '@/components/brand';
import { usePersisted, useQuery } from '@/lib/hooks';
import { useAuth } from '@/state/auth';
import {
  IconAdmin, IconAuto, IconBell, IconCargo, IconChart, IconCrown, IconFactory, IconGlobe, IconInspect, IconMegaphone, IconPackage, IconReceipt,
  IconScroll, IconSettings, IconTag, IconSwap, IconUsers, IconWallet, IconWarn, IconSun, IconMoon, IconBack,
} from '@/components/icons';
import type { IconType } from 'react-icons';
import { UsersSection, OrdersSection, ProductsSection, SuppliersSection, PaymentsSection, InvoicesSection } from './sections-commerce';
import { CargoSection, CarsSection, InspectionsSection, VipSection, PromotionsSection } from './sections-ops';
import { NotificationsSection, ContentSection, TranslationsSection, SettingsSection } from './sections-content';
import { CatalogSection } from './sections-catalog';

export const SECTIONS: { key: string; label: StringKey; icon: IconType }[] = [
  { key: 'dashboard', label: 'admin.s.dashboard', icon: IconAdmin },
  { key: 'users', label: 'admin.s.users', icon: IconUsers },
  { key: 'orders', label: 'admin.s.orders', icon: IconPackage },
  { key: 'products', label: 'admin.s.products', icon: IconTag },
  { key: 'catalog', label: 'admin.s.catalog', icon: IconSwap },
  { key: 'suppliers', label: 'admin.s.suppliers', icon: IconFactory },
  { key: 'payments', label: 'admin.s.payments', icon: IconWallet },
  { key: 'invoices', label: 'admin.s.invoices', icon: IconReceipt },
  { key: 'cargo', label: 'admin.s.cargo', icon: IconCargo },
  { key: 'cars', label: 'admin.s.cars', icon: IconAuto },
  { key: 'inspections', label: 'admin.s.inspections', icon: IconInspect },
  { key: 'vip', label: 'admin.s.vip', icon: IconCrown },
  { key: 'promotions', label: 'admin.s.promotions', icon: IconMegaphone },
  { key: 'notifications', label: 'admin.s.notifications', icon: IconBell },
  { key: 'content', label: 'admin.s.content', icon: IconScroll },
  { key: 'translations', label: 'admin.s.translations', icon: IconGlobe },
  { key: 'analytics', label: 'admin.s.analytics', icon: IconChart },
  { key: 'settings', label: 'admin.s.settings', icon: IconSettings },
];

function BarChart({ data, label, format }: { data: { k: string; v: number }[]; label: string; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="flex h-40 items-end gap-1.5" role="img" aria-label={label}>
      {data.map((d) => (
        <div key={d.k} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div className="flex w-full flex-1 items-end"><div className="w-full rounded-t-[5px] bg-ink transition-all duration-500 group-hover:bg-accent" style={{ height: `${Math.max(2, (d.v / max) * 100)}%`, opacity: d.v ? 1 : 0.15 }} /></div>
          <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[10px] text-on-ink group-hover:block">{format(d.v)}</span>
          <span className="num truncate text-[9.5px] text-faint">{d.k}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ full }: { full?: boolean }) {
  const { t, tk, money, date, num } = useI18n();
  const q = useQuery(() => analyticsService.overview(), []);
  const orders = useQuery(() => orderService.listAll(), []);
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const a = q.data;
  const alerts: [string, number, string][] = [[t('admin.alert.invoices'), a.pendingInvoices, '/admin/invoices'], [t('admin.alert.suppliers'), a.pendingSuppliers, '/admin/suppliers'], [t('admin.alert.cars'), a.pendingCars, '/admin/cars'], [t('admin.alert.tickets'), a.openTickets, '/admin/notifications']];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard tone="dark" label={t('admin.gmv')} value={money(a.gmv, 'TMT', { decimals: 0 })} sub={t('admin.gmv_sub')} icon={IconChart} />
        <StatCard label={t('admin.revenue')} value={money(a.revenue, 'TMT', { decimals: 0 })} sub={t('admin.revenue_sub')} icon={IconWallet} />
        <StatCard label={t('admin.s.orders')} value={num(a.orders)} icon={IconPackage} to="/admin/orders" />
        <StatCard label={t('admin.s.users')} value={num(a.users)} sub={t('admin.active_n', { n: a.activeUsers })} icon={IconUsers} to="/admin/users" />
        <StatCard label={t('admin.vip_members')} value={a.vip} icon={IconCrown} to="/admin/vip" />
        <StatCard label={t('admin.in_transit')} value={a.shipmentsInTransit} icon={IconCargo} to="/admin/cargo" />
        <StatCard label={t('admin.alert.invoices')} value={a.pendingInvoices} icon={IconReceipt} to="/admin/invoices" />
        <StatCard label={t('admin.alert.cars')} value={a.pendingCars} icon={IconInspect} to="/admin/cars" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-5"><div className="eyebrow mb-4">{t('admin.orders_14d')}</div><BarChart label={t('admin.orders_14d')} data={a.days.map((d) => ({ k: d.day.slice(8), v: d.orders }))} format={(v) => String(v)} /></div>
        <div className="card p-5">
          <div className="eyebrow mb-3">{t('admin.attention')}</div>
          <ul className="space-y-2">{alerts.map(([label, n, to]) => <li key={to}><Link to={to} className={cn('flex items-center justify-between rounded-[10px] px-3 py-2.5 text-sm', n ? 'bg-warn/10' : 'bg-mist')}><span className="flex items-center gap-2">{n ? <IconWarn className="size-4 text-warn" aria-hidden /> : null}{label}</span><span className="num font-semibold">{n}</span></Link></li>)}</ul>
        </div>
      </div>
      {full ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card p-5"><div className="eyebrow mb-4">{t('admin.gmv_14d')}</div><BarChart label={t('admin.gmv_14d')} data={a.days.map((d) => ({ k: d.day.slice(8), v: Math.round(d.gmv) }))} format={(v) => money(v, 'TMT', { decimals: 0 })} /></div>
          <div className="card p-5"><div className="eyebrow mb-4">{t('admin.gmv_by_category')}</div>
            <ul className="space-y-2.5">{[...a.byCategory].sort((x, y) => y.gmv - x.gmv).map((c) => { const max = Math.max(1, ...a.byCategory.map((x) => x.gmv)); return <li key={c.id}><div className="mb-1 flex justify-between text-[12px]"><span>{tk(`cat.${c.id}`)}</span><span className="num">{money(c.gmv, 'TMT', { decimals: 0 })}</span></div><div className="h-1.5 rounded-full bg-mist-2"><div className="h-full rounded-full bg-ink" style={{ width: `${(c.gmv / max) * 100}%` }} /></div></li>; })}</ul>
            <p className="mt-4 text-[11.5px] text-muted">{t('admin.analytics_note')}</p></div>
        </div>
      ) : (
        <div>
          <div className="eyebrow mb-3">{t('admin.recent_orders')}</div>
          <DataTable rows={(orders.data || []).slice(0, 8)} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/orders/${o.id}`)} mobileTitle={(o) => <span className="num">{o.number}</span>}
            columns={[
              { key: 'n', header: t('orders.order'), cell: (o) => <span className="num font-medium">{o.number}</span>, mobile: false },
              { key: 'c', header: t('admin.customer'), cell: (o) => db().users.find((u) => u.id === o.userId)?.name || o.userId },
              { key: 'd', header: t('common.date'), cell: (o) => date(o.createdAt) },
              { key: 's', header: t('common.status'), cell: (o) => <StatusBadge status={o.status} label={tk(statusKey('order', o.status))} /> },
              { key: 't', header: t('orders.total'), cell: (o) => <span className="num">{money(o.costs.totalTMT, 'TMT')}</span> },
            ]} />
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const { t } = useI18n();
  const params = useParams();
  const section = params.section || 'dashboard';
  const def = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  usePageTitle(`${t('nav.admin')} · ${t(def.label)}`);
  const body: Record<string, () => ReactNode> = {
    dashboard: () => <Dashboard />, analytics: () => <Dashboard full />, users: () => <UsersSection />, orders: () => <OrdersSection />, products: () => <ProductsSection />, catalog: () => <CatalogSection />,
    suppliers: () => <SuppliersSection />, payments: () => <PaymentsSection />, invoices: () => <InvoicesSection />, cargo: () => <CargoSection />, cars: () => <CarsSection />,
    inspections: () => <InspectionsSection />, vip: () => <VipSection />, promotions: () => <PromotionsSection />, notifications: () => <NotificationsSection />,
    content: () => <ContentSection />, translations: () => <TranslationsSection />, settings: () => <SettingsSection />,
  };
  const { user } = useAuth();
  const [theme, setTheme] = usePersisted<'dark' | 'light'>('admin.theme', 'dark');
  const dark = theme === 'dark';
  // Dialogs and toasts are portalled to <body>, so the console theme is applied there too.
  useEffect(() => { document.body.classList.toggle('theme-dark', dark); return () => document.body.classList.remove('theme-dark'); }, [dark]);
  return (
    <div className={cn('min-h-dvh bg-mist text-ink', dark && 'theme-dark')}>
      <a href="#console" className="sr-only z-[100] rounded-full bg-ink px-4 py-2 text-on-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">{t('common.skip_to_content')}</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-paper xl:flex">
        <div className="flex h-16 items-center gap-2.5 px-5"><LogoMark size={26} onDark={dark} /><Wordmark height={11} onDark={dark} /></div>
        <div className="mono px-5 pb-3 text-[10px] tracking-[0.18em] text-faint">{t('admin.console').toUpperCase()}</div>
        <nav aria-label={t('admin.console')} className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {SECTIONS.map((s) => (
            <Link key={s.key} to={s.key === 'dashboard' ? '/admin' : `/admin/${s.key}`} aria-current={s.key === def.key ? 'page' : undefined}
              className={cn('relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors', s.key === def.key ? 'bg-mist-2 text-ink' : 'text-muted hover:bg-mist-2/60 hover:text-ink')}>
              {s.key === def.key ? <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" aria-hidden /> : null}
              <s.icon className="size-4" aria-hidden />{t(s.label)}
            </Link>
          ))}
        </nav>
        <Link to="/" className="m-3 flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] text-muted hover:bg-mist-2 hover:text-ink"><IconBack className="size-4" aria-hidden />{t('nav.home')}</Link>
      </aside>
      <div className="xl:pl-[232px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="xl:hidden" aria-label={t('nav.home')}><LogoMark size={26} onDark={dark} /></Link>
            <div className="min-w-0"><div className="mono truncate text-[10px] tracking-[0.18em] text-faint">{t('admin.console').toUpperCase()}</div><h1 className="truncate text-[17px] font-semibold tracking-tight">{t(def.label)}</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact dark={dark} />
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? t('admin.theme_light') : t('admin.theme_dark')} title={dark ? t('admin.theme_light') : t('admin.theme_dark')}
              className="press grid size-9 place-items-center rounded-full bg-mist-2 text-ink transition hover:bg-mist-3">{dark ? <IconSun className="size-4" aria-hidden /> : <IconMoon className="size-4" aria-hidden />}</button>
            {user ? <span className="hidden size-9 place-items-center rounded-full bg-ink text-[13px] font-semibold text-on-ink sm:grid" title={user.name}>{user.name.slice(0, 1)}</span> : null}
          </div>
        </header>
        <nav aria-label={t('admin.console')} className="rail gap-1 border-b border-line bg-paper px-4 py-2 xl:hidden">
          {SECTIONS.map((s) => (
            <Link key={s.key} to={s.key === 'dashboard' ? '/admin' : `/admin/${s.key}`} aria-current={s.key === def.key ? 'page' : undefined}
              className={cn('flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors', s.key === def.key ? 'bg-ink text-on-ink' : 'text-muted hover:bg-mist-2 hover:text-ink')}>
              <s.icon className="size-3.5" aria-hidden />{t(s.label)}
            </Link>
          ))}
        </nav>
        <main id="console" key={def.key} className="animate-rise mx-auto max-w-[1400px] px-4 py-5 md:px-6">{(body[def.key] || body.dashboard)()}</main>
      </div>
    </div>
  );
}
