import { useEffect, useState } from 'react';
import { useI18n, LANGS } from '@/i18n';
import { Link, navigate, useQueryParam } from '@/lib/router';
import { useAction, usePersisted, useQuery } from '@/lib/hooks';
import { useAuth } from '@/state/auth';
import { addressService, userService, notificationService } from '@/services/accountServices';
import { paymentService } from '@/services/paymentService';
import { vehicleService } from '@/services/vehicleService';
import { vipService } from '@/services/vipService';
import { authService } from '@/services/authService';
import { resetDb } from '@/services/db';
import type { Address, Role } from '@/lib/types';
import { Avatar, Badge, Button, cn, ConfirmDialog, EmptyState, ErrorState, Input, Notice, SkeletonRows, Switch, useToast } from '@/components/ui';
import { AddCardModal, AddressForm, addressLine } from '@/components/forms';
import { CarVisual } from '@/components/visuals';
import { usePageTitle, LanguageSwitcher, useCity, CITIES } from '@/components/shell';
import {
  IconAuto, IconBell, IconBuilding, IconCard, IconCargo, IconChevron, IconCrown, IconEdit, IconHeart, IconLang, IconLock, IconLogout, IconMoney,
  IconPackage, IconPin, IconPlus, IconProfile, IconShield, IconSupport, IconTrash, IconWallet, IconRetry,
} from '@/components/icons';
import type { IconType } from 'react-icons';

type Section = 'overview' | 'personal' | 'language' | 'addresses' | 'payments' | 'cars' | 'notifications' | 'security';

function PersonalSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const q = useQuery(() => userService.profile(), []);
  const [f, setF] = useState({ name: '', email: '', city: '' });
  const [touched, setTouched] = useState(false);
  const save = useAction(userService.updateProfile);
  useEffect(() => { if (q.data?.user) setF({ name: q.data.user.name, email: q.data.user.email, city: q.data.user.city }); else if (user) setF({ name: user.name, email: user.email, city: 'Ashgabat' }); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const errs = { name: f.name.trim().length < 2 ? t('form.required') : null, email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) ? t('form.invalid_email') : null };
  if (q.loading) return <SkeletonRows count={3} />;
  return (
    <form className="max-w-lg space-y-4" onSubmit={async (e: { preventDefault(): void }) => {
      e.preventDefault(); setTouched(true); if (errs.name || errs.email) return;
      const r = await save.run(f); if (r) toast(t('profile.saved'));
    }} noValidate>
      <Input label={t('auth.full_name')} value={f.name} onChange={(v) => setF({ ...f, name: v })} error={touched ? errs.name : null} autoComplete="name" />
      <Input label={t('auth.email')} value={f.email} onChange={(v) => setF({ ...f, email: v })} error={touched ? errs.email : null} type="email" autoComplete="email" />
      <Input label={t('auth.phone')} value={user?.phone || ''} onChange={() => {}} disabled hint={t('profile.phone_locked')} />
      <Input label={t('address.city')} value={f.city} onChange={(v) => setF({ ...f, city: v })} />
      {q.data?.business ? <div className="rounded-[12px] bg-mist p-4 text-sm"><div className="font-semibold">{q.data.business.companyName}</div><div className="text-muted">{q.data.business.industry} · {q.data.business.taxId}</div>{q.data.business.verified ? <Badge tone="ok" className="mt-2">{t('profile.business_verified')}</Badge> : <Badge tone="warn" className="mt-2">{t('profile.business_pending')}</Badge>}</div> : null}
      {save.error ? <Notice tone="bad">{t('form.server_error')}</Notice> : null}
      <Button type="submit" loading={save.pending}>{t('common.save')}</Button>
    </form>
  );
}

function AddressesSection() {
  const { t } = useI18n();
  const toast = useToast();
  const q = useQuery(() => addressService.list(), []);
  const [form, setForm] = useState<{ open: boolean; edit: Address | null }>({ open: false, edit: null });
  const [del, setDel] = useState<Address | null>(null);
  const remove = useAction(addressService.remove);
  const save = useAction(addressService.save);
  return (
    <div>
      <div className="mb-4 flex justify-end"><Button icon={IconPlus} onClick={() => setForm({ open: true, edit: null })}>{t('address.new')}</Button></div>
      {q.loading ? <SkeletonRows count={2} /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} compact /> : !q.data?.length ? <EmptyState icon={IconPin} title={t('address.empty')} body={t('address.empty_body')} /> : (
        <ul className="space-y-2">
          {q.data.map((a) => (
            <li key={a.id} className="flex items-start gap-4 rounded-[20px] bg-mist p-4">
              <IconPin className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{a.name}</span>{a.isDefault ? <Badge tone="dark">{t('common.default')}</Badge> : null}</div>
                <div className="text-sm text-muted">{addressLine(a)}</div>
                <div className="num text-[12px] text-faint">{a.phone}{a.info ? ` · ${a.info}` : ''}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {!a.isDefault ? <Button size="sm" variant="ghost" onClick={async () => { await save.run({ ...a, isDefault: true }); toast(t('address.saved')); }}>{t('profile.make_default')}</Button> : null}
                <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setForm({ open: true, edit: a })} aria-label={t('common.edit')} />
                <Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(a)} aria-label={t('common.delete')} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddressForm open={form.open} initial={form.edit} onClose={() => setForm({ open: false, edit: null })} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t('address.delete')} body={del ? addressLine(del) : ''} confirmLabel={t('common.delete')} danger loading={remove.pending} onConfirm={async () => { if (del) await remove.run(del.id); setDel(null); toast(t('address.deleted')); }} />
    </div>
  );
}

function PaymentsSection() {
  const { t, tk } = useI18n();
  const toast = useToast();
  const q = useQuery(() => paymentService.methods(), []);
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const remove = useAction(paymentService.removeMethod);
  const setDefault = useAction(paymentService.setDefault);
  const wallet = useAction(paymentService.addWallet);
  const ICONS: Record<string, IconType> = { card: IconCard, wallet: IconWallet, partner: IconBuilding, settlement: IconMoney };
  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" icon={IconWallet} loading={wallet.pending} onClick={async () => { const ok = await wallet.run(); toast(ok ? t('profile.wallet_added') : t('profile.wallet_exists'), ok ? 'ok' : 'bad'); }}>{t('profile.add_wallet')}</Button>
        <Button icon={IconPlus} onClick={() => setAdd(true)}>{t('pay.add_card')}</Button>
      </div>
      {q.loading ? <SkeletonRows count={2} /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} compact /> : !q.data?.length ? <EmptyState icon={IconCard} title={t('profile.no_methods')} /> : (
        <ul className="space-y-2">
          {q.data.map((m) => { const Icon = ICONS[m.type]; return (
            <li key={m.id} className="flex items-center gap-4 rounded-[20px] bg-mist p-4">
              <span className="grid size-11 place-items-center rounded-full bg-paper"><Icon className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1"><div className="font-medium">{m.last4 ? `${m.brand} •••• ${m.last4}` : m.label}</div><div className="text-[12px] text-muted">{tk(`pay.type.${m.type}`)}{m.expires ? ` · ${m.expires}` : ''}</div></div>
              {m.isDefault ? <Badge tone="dark">{t('common.default')}</Badge> : <Button size="sm" variant="ghost" loading={setDefault.pending} onClick={() => setDefault.run(m.id)}>{t('profile.make_default')}</Button>}
              <Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(m.id)} aria-label={t('common.delete')} />
            </li>
          ); })}
        </ul>
      )}
      <div className="mt-4"><Notice tone="neutral" icon={IconShield}>{t('profile.payments_note')}</Notice></div>
      <AddCardModal open={add} onClose={() => setAdd(false)} onAdded={() => {}} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t('profile.remove_method')} confirmLabel={t('common.delete')} danger loading={remove.pending} onConfirm={async () => { if (del) await remove.run(del); setDel(null); }} />
    </div>
  );
}

function CarsSection() {
  const { t, tk } = useI18n();
  const q = useQuery(() => vehicleService.reservations(), []);
  if (q.loading) return <SkeletonRows count={2} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} compact />;
  if (!q.data?.length) return <EmptyState icon={IconAuto} title={t('profile.no_cars')} body={t('profile.no_cars_body')} action={<Button to="/auto">{t('nav.auto')}</Button>} />;
  return (
    <ul className="space-y-3">
      {q.data.map(({ reservation: r, car }) => (
        <li key={r.id}><Link to={`/auto/reservations/${r.id}`} className="card lift flex items-center gap-4 p-4"><CarVisual car={car} image={car.images[1]} className="aspect-[16/10] w-32 shrink-0" /><div className="min-w-0 flex-1"><div className="font-semibold">{car.brand} {car.model}</div><div className="num text-[12px] text-muted">{r.number}</div><Badge className="mt-2">{tk(`auto.step.${r.step}`)}</Badge></div><IconChevron className="size-4 text-faint" aria-hidden /></Link></li>
      ))}
    </ul>
  );
}

function NotificationPrefs() {
  const { t } = useI18n();
  const [prefs, setPrefs] = usePersisted('notif.prefs', { order: true, cargo: true, price_drop: true, group_buy: true, promotion: false, email: true, sms: true });
  const toggle = (k: keyof typeof prefs) => (v: boolean) => setPrefs({ ...prefs, [k]: v });
  return (
    <div className="max-w-lg space-y-5">
      {(['order', 'cargo', 'price_drop', 'group_buy', 'promotion'] as const).map((k) => <Switch key={k} label={t(`notif.type.${k}`)} checked={prefs[k]} onChange={toggle(k)} />)}
      <div className="border-t border-line pt-5" />
      <Switch label={t('profile.channel_email')} checked={prefs.email} onChange={toggle('email')} />
      <Switch label={t('profile.channel_sms')} checked={prefs.sms} onChange={toggle('sms')} description={t('profile.channel_sms_desc')} />
      <Button variant="secondary" to="/notifications">{t('nav.notifications')}</Button>
    </div>
  );
}

function SecuritySection() {
  const { t } = useI18n();
  const toast = useToast();
  const { logout, demoMode, setSession } = useAuth();
  const [twoFa, setTwoFa] = usePersisted('security.2fa', false);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState<Role | ''>('');
  return (
    <div className="max-w-xl space-y-6">
      <Switch label={t('profile.two_factor')} description={t('profile.two_factor_desc')} checked={twoFa} onChange={(v) => { setTwoFa(v); toast(v ? t('profile.two_factor_on') : t('profile.two_factor_off')); }} />
      <div className="rounded-[20px] bg-mist p-4"><div className="text-sm font-medium">{t('profile.sessions')}</div><div className="mt-2 flex items-center justify-between text-[13px] text-muted"><span>{navigator.userAgent.includes('Mobile') ? t('profile.this_phone') : t('profile.this_browser')}</span><Badge tone="ok">{t('profile.current')}</Badge></div></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={IconLock} to="/forgot-password">{t('profile.change_password')}</Button>
        <Button variant="danger" icon={IconLogout} onClick={async () => { await logout(); navigate('/'); }}>{t('profile.logout')}</Button>
      </div>
      {demoMode ? (
        <div className="rounded-[22px] border-[1.5px] border-dashed border-mist-3 p-5">
          <div className="text-[13px] font-semibold">{t('profile.demo_switch')}</div>
          <p className="mt-1 text-[12px] text-muted">{t('profile.demo_switch_body')}</p>
          <div className="mt-3 flex flex-wrap gap-2">{(['personal', 'business', 'supplier', 'admin'] as Role[]).map((r) => <Button key={r} size="sm" variant="secondary" loading={busy === r} onClick={async () => { setBusy(r); try { const x = await authService.demo(r); setSession(x.user); toast(t('profile.switched', { role: t(`role.${r}`) })); } finally { setBusy(''); } }}>{t(`role.${r}`)}</Button>)}</div>
          <Button className="mt-3" size="sm" variant="ghost" icon={IconRetry} onClick={() => setReset(true)}>{t('profile.reset_demo')}</Button>
        </div>
      ) : null}
      <ConfirmDialog open={reset} onClose={() => setReset(false)} title={t('profile.reset_demo')} body={t('profile.reset_demo_body')} confirmLabel={t('profile.reset_demo')} danger onConfirm={() => { resetDb(); setReset(false); toast(t('profile.reset_done')); }} />
    </div>
  );
}

export function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  usePageTitle(t('nav.profile'));
  const { user, logout } = useAuth();
  const [sec, setSec] = useQueryParam('section');
  const section = (sec || 'overview') as Section;
  const [city, setCity] = useCity();
  const vip = user ? vipService.isActive(user.id) : false;
  const unread = notificationService.unreadCount();
  if (!user) return null;
  type Item = { key: string; label: string; icon: IconType; to?: string; section?: Section; badge?: string | number };
  const groups: { title: string; items: Item[] }[] = [
    { title: t('profile.group.activity'), items: [
      { key: 'orders', label: t('nav.orders'), icon: IconPackage, to: '/orders' },
      { key: 'cargo', label: t('nav.cargo'), icon: IconCargo, to: '/cargo' },
      { key: 'cars', label: t('profile.cars'), icon: IconAuto, section: 'cars' },
      { key: 'favorites', label: t('nav.favorites'), icon: IconHeart, to: '/favorites' },
    ] },
    { title: t('profile.group.account'), items: [
      { key: 'personal', label: t('profile.personal'), icon: IconProfile, section: 'personal' },
      { key: 'payments', label: t('profile.payments'), icon: IconCard, section: 'payments' },
      { key: 'addresses', label: t('profile.addresses'), icon: IconPin, section: 'addresses' },
      { key: 'notifications', label: t('nav.notifications'), icon: IconBell, section: 'notifications', badge: unread || undefined },
      { key: 'security', label: t('profile.security'), icon: IconShield, section: 'security' },
      { key: 'language', label: t('profile.language'), icon: IconLang, section: 'language', badge: LANGS.find((l) => l.code === lang)?.label },
    ] },
    { title: t('profile.group.more'), items: [
      { key: 'vip', label: t('nav.vip'), icon: IconCrown, to: '/vip', badge: vip ? 'VIP' : undefined },
      { key: 'support', label: t('nav.support'), icon: IconSupport, to: '/support' },
    ] },
  ];
  const items = groups.flatMap((g) => g.items);
  const current = items.find((i) => i.section === section);
  const nav = (
    <nav aria-label={t('nav.profile')} className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="eyebrow mb-2 px-2">{g.title}</div>
          <ul className="card overflow-hidden p-1.5">
            {g.items.map((it) => {
              const on = it.section === section;
              return (
                <li key={it.key}>
                  <Link to={it.to || `/profile?section=${it.section}`} aria-current={on ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-[16px] px-3 py-2.5 text-[14.5px] font-medium transition-colors', on ? 'bg-ink text-on-ink' : 'hover:bg-mist')}>
                    <span className={cn('grid size-9 place-items-center rounded-full', on ? 'bg-white/15' : 'bg-mist')}><it.icon className="size-[17px]" aria-hidden /></span><span className="flex-1">{it.label}</span>
                    {it.badge ? <Badge tone={on ? 'glass' : 'neutral'}>{it.badge}</Badge> : null}
                    <IconChevron className="size-4 opacity-40" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <button type="button" onClick={async () => { await logout(); navigate('/'); }} className="card flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14.5px] font-semibold text-bad hover:bg-bad/5"><span className="grid size-9 place-items-center rounded-full bg-bad/10"><IconLogout className="size-[17px]" aria-hidden /></span>{t('profile.logout')}</button>
    </nav>
  );
  return (
    <div>
      <header className="relative mb-8 overflow-hidden rounded-[28px] bg-paper p-5 shadow-[var(--shadow-soft)] md:p-7">
        <div className="dot-grid absolute inset-y-0 right-0 w-1/2 opacity-50 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden />
        <div className="relative flex items-center gap-4 md:gap-5">
          <div className="relative"><Avatar name={user.name} size={72} />{vip ? <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full accent-grad text-white ring-4 ring-paper"><IconCrown className="size-3.5" aria-hidden /></span> : null}</div>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold tracking-tight md:text-[30px]">{user.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted"><span className="truncate">{user.email}</span><Badge>{t(`role.${user.role}`)}</Badge>{vip ? <Badge tone="dark" icon={IconCrown}>VIP</Badge> : <Link to="/vip" className="text-[12px] font-semibold text-accent underline-offset-4 hover:underline">{t('profile.become_vip')}</Link>}</div>
          </div>
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
        <div className={cn(section !== 'overview' && 'hidden lg:block')}>{nav}</div>
        {section !== 'overview' ? (
          <section className="animate-rise card min-w-0 p-5 md:p-8">
            <button type="button" onClick={() => setSec('')} className="mb-4 text-[13px] text-muted hover:text-ink lg:hidden">← {t('nav.profile')}</button>
            <h2 className="mb-6 text-[22px] font-semibold tracking-tight">{current?.label}</h2>
            {section === 'personal' ? <PersonalSection />
              : section === 'language' ? (
                <div className="max-w-lg space-y-6">
                  <LanguageSwitcher />
                  <ul className="space-y-2">{LANGS.map((l) => <li key={l.code}><button type="button" onClick={() => setLang(l.code)} className={cn('flex w-full items-center justify-between rounded-[16px] px-4 py-3.5 text-left font-medium', lang === l.code ? 'bg-ink text-on-ink' : 'bg-mist hover:bg-mist-2')}>{l.name}<span className="text-[12px] opacity-60">{l.label}</span></button></li>)}</ul>
                  <div><div className="eyebrow mb-2">{t('location.title')}</div><div className="flex flex-wrap gap-1.5">{CITIES.map((c) => <button key={c} type="button" onClick={() => setCity(c)} className={cn('rounded-full px-3.5 py-2 text-[13px] font-medium', c === city ? 'bg-ink text-on-ink' : 'bg-mist hover:bg-mist-2')}>{c}</button>)}</div></div>
                </div>
              )
              : section === 'addresses' ? <AddressesSection />
              : section === 'payments' ? <PaymentsSection />
              : section === 'cars' ? <CarsSection />
              : section === 'notifications' ? <NotificationPrefs />
              : <SecuritySection />}
          </section>
        ) : (
          <section className="hidden lg:block">
            <div className="grid gap-3 md:grid-cols-2">
              <Link to="/orders" className="card lift p-6"><IconPackage className="size-5" aria-hidden /><div className="mt-6 font-semibold">{t('nav.orders')}</div><div className="text-[13px] text-muted">{t('profile.orders_sub')}</div></Link>
              <Link to="/cargo" className="card lift p-6"><IconCargo className="size-5" aria-hidden /><div className="mt-6 font-semibold">{t('nav.cargo')}</div><div className="text-[13px] text-muted">{t('profile.cargo_sub')}</div></Link>
              <Link to="/vip" className="card lift bg-[#111]! p-6 text-white"><IconCrown className="size-5 text-accent-2" aria-hidden /><div className="mt-6 font-semibold">{vip ? t('vip.you_are_vip') : t('nav.vip')}</div><div className="text-[13px] text-white/60">{t('profile.vip_sub')}</div></Link>
              <Link to="/favorites" className="card lift p-6"><IconHeart className="size-5" aria-hidden /><div className="mt-6 font-semibold">{t('nav.favorites')}</div><div className="text-[13px] text-muted">{t('profile.favorites_sub')}</div></Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
