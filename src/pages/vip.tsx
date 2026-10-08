import { useState } from 'react';
import { useI18n, localizedText } from '@/i18n';
import { Link, navigate } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { vipService, promotionService, VIP_PRICE_TMT } from '@/services/vipService';
import { useAuth } from '@/state/auth';
import { Badge, Button, ConfirmDialog, cn, EmptyState, ErrorState, KV, Modal, Notice, SkeletonRows, StatusBadge, useToast } from '@/components/ui';
import { PaymentMethodPicker } from '@/components/forms';
import { statusKey } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { LogoMark } from '@/components/brand';
import { PageHeader } from '@/components/ui';
import { IconBan, IconCheck, IconCrown, IconGift, IconLock, IconPercent, IconSupport, IconTag, IconZap, IconCalendar, IconTicket } from '@/components/icons';

export function VipPage() {
  const { t, money, date } = useI18n();
  usePageTitle(t('nav.vip'), t('meta.vip'));
  const { user } = useAuth();
  const toast = useToast();
  const status = useQuery(() => (user ? vipService.status() : Promise.resolve(null)), [user?.id]);
  const [open, setOpen] = useState(false);
  const [methodId, setMethodId] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [failed, setFailed] = useState('');
  const sub = useAction(vipService.subscribe);
  const cancel = useAction(vipService.cancel);
  const resume = useAction(vipService.resume);
  const s = status.data;
  const active = !!s && s.status !== 'expired' && new Date(s.renewsAt).getTime() > Date.now();
  const main = [
    { icon: IconBan, title: t('vip.b.no_ads'), body: t('vip.b.no_ads_body') },
    { icon: IconZap, title: t('vip.b.fast'), body: t('vip.b.fast_body') },
    { icon: IconPercent, title: t('vip.b.commission'), body: t('vip.b.commission_body') },
    { icon: IconGift, title: t('vip.b.campaign'), body: t('vip.b.campaign_body') },
  ];
  const extra = [{ icon: IconLock, title: t('vip.b.priority') }, { icon: IconSupport, title: t('vip.b.support') }, { icon: IconTag, title: t('vip.b.offers') }];
  const rows = [
    { icon: IconBan, title: t('vip.b.no_ads'), body: t('vip.b.no_ads_body') },
    { icon: IconZap, title: t('vip.b.fast'), body: t('vip.b.fast_body') },
    { icon: IconPercent, title: t('vip.b.commission'), body: t('vip.b.commission_body') },
    { icon: IconGift, title: t('vip.b.campaign'), body: t('vip.b.campaign_body') },
    { icon: IconLock, title: t('vip.b.priority'), body: t('vip.b.priority_body') },
    { icon: IconSupport, title: t('vip.b.support'), body: t('vip.b.support_body') },
  ];
  const cta = !user ? <Button size="xl" full variant="accent" icon={IconCrown} onClick={() => navigate('/login?next=/vip')}>{t('vip.subscribe')}</Button>
    : active && s?.status === 'active' ? <div className="flex h-16 items-center justify-center gap-2 rounded-full bg-ok/10 text-[15px] font-semibold text-ok"><IconCheck className="size-5" aria-hidden />{t('vip.you_are_vip')}</div>
    : <Button size="xl" full variant="accent" icon={IconCrown} onClick={() => setOpen(true)}>{active ? t('vip.resume_or_extend') : t('vip.subscribe')}</Button>;
  return (
    <div>
      <PageHeader display eyebrow="CARGO ONE VIP" title={t('vip.title')} subtitle={t('vip.hero')} />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.05fr]">
        <div className="lg:sticky lg:top-24">
          {/* Membership card */}
          <div className={cn('relative aspect-[1.6/1] w-full overflow-hidden rounded-[28px] bg-gradient-to-br from-[#232325] via-[#141415] to-[#0b0b0c] p-6 text-white shadow-[var(--shadow-float)] md:p-8', active && 'sheen')}>
            <div className="dot-grid-dark absolute inset-0 opacity-60" aria-hidden />
            <div className="absolute -right-16 -top-16 size-64 rounded-full border border-white/[0.07]" aria-hidden /><div className="absolute -right-4 -top-4 size-40 rounded-full border border-white/[0.07]" aria-hidden />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between"><LogoMark size={34} onDark /><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]">VIP</span></div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{t('vip.member')}</div>
                <div className="mt-1 text-[20px] font-semibold tracking-tight md:text-[24px]">{user?.name || 'CARGO ONE'}</div>
                <div className="mt-3 flex items-center justify-between text-[12px] text-white/55"><span className="mono">{active && s ? `${t('vip.renews')} ${date(s.renewsAt)}` : t('vip.standard')}</span><span className="h-1.5 w-12 rounded-full accent-grad" aria-hidden /></div>
              </div>
            </div>
          </div>
          {user ? (
            <section className="card mt-4 p-5" aria-label={t('vip.current_plan')}>
              {status.loading ? <SkeletonRows count={1} /> : status.error ? <ErrorState error={status.error} onRetry={status.reload} compact /> : (
                <>
                  <div className="grid gap-x-8 sm:grid-cols-2">
                    <KV k={t('vip.current_plan')} v={active ? 'VIP' : t('vip.standard')} mono={false} />
                    <KV k={t('vip.price')} v={money(VIP_PRICE_TMT, 'TMT', { decimals: 0 })} />
                    <KV k={t('common.status')} v={s ? <StatusBadge status={active ? s.status : 'expired'} label={t(`status.vip.${active ? s.status : 'expired'}`)} /> : <Badge>{t('vip.none')}</Badge>} mono={false} />
                    <KV k={s?.status === 'cancelled' ? t('vip.active_until') : t('vip.renews')} v={s && active ? date(s.renewsAt) : '—'} mono={false} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {active && s?.status === 'active' ? <Button size="sm" variant="secondary" onClick={() => setCancelOpen(true)}>{t('vip.cancel')}</Button> : null}
                    {active && s?.status === 'cancelled' ? <Button size="sm" loading={resume.pending} onClick={async () => { await resume.run(); toast(t('vip.resumed')); }}>{t('vip.resume')}</Button> : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
        </div>
        <section className="card p-6 md:p-8">
          <div className="flex items-end justify-between gap-4 border-b border-line pb-6">
            <div><div className="eyebrow">{t('vip.price')}</div><div className="mt-2 flex items-baseline gap-2"><span className="display text-[52px] leading-none md:text-[64px]">{VIP_PRICE_TMT}</span><span className="text-[15px] font-semibold uppercase tracking-[0.06em] text-muted">TMT / {t('vip.month')}</span></div></div>
          </div>
          <ul className="stagger divide-y divide-line">
            {rows.map((b) => (
              <li key={b.title} className="flex items-start gap-4 py-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mist"><b.icon className="size-5" aria-hidden /></span>
                <div className="pt-0.5"><div className="text-[15px] font-semibold uppercase tracking-[0.03em]">{b.title}</div><div className="mt-0.5 text-[13px] text-muted">{b.body}</div></div>
              </li>
            ))}
          </ul>
          <div className="mt-4">{cta}</div>
          <Button variant="link" className="mt-4" to="/vip/promotion">{t('vip.see_campaign')}</Button>
        </section>
      </div>
      <section className="mt-10 card grid gap-3 p-6 md:grid-cols-3 md:p-8">
        <div className="md:col-span-3"><h2 className="text-[17px] font-semibold uppercase tracking-[0.03em]">{t('vip.value_title')}</h2><p className="text-sm text-muted">{t('vip.value_body')}</p></div>
        {[[t('vip.ex.order'), '5%', '3%'], [t('vip.ex.delivery'), t('vip.ex.standard'), t('vip.ex.priority')], [t('vip.ex.support'), t('vip.ex.hours'), t('vip.ex.minutes')]].map(([k, a, b]) => (
          <div key={k} className="rounded-[18px] bg-mist p-5"><div className="text-[12px] text-muted">{k}</div><div className="mt-2 flex items-baseline gap-3"><span className="text-sm text-faint line-through">{a}</span><span className="price text-[20px]">{b}</span></div></div>
        ))}
      </section>
      <p className="mt-6 text-[12px] text-faint">{t('vip.terms')}</p>

      <Modal open={open} onClose={() => setOpen(false)} title={t('vip.subscribe')} description={`${VIP_PRICE_TMT} TMT / ${t('vip.month')}`}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="accent" icon={IconLock} disabled={!methodId} loading={sub.pending} onClick={async () => {
          setFailed('');
          const r = await sub.run(methodId);
          if (r?.subscription) { setOpen(false); setCelebrate(true); }
          else if (r) setFailed(r.payment.failureReason || t('checkout.payment_failed'));
          else setFailed(t('form.server_error'));
        }}>{t('vip.pay', { amount: money(VIP_PRICE_TMT, 'TMT', { decimals: 0 }) })}</Button></>}>
        <div className="space-y-4">
          <PaymentMethodPicker value={methodId} onChange={setMethodId} allow={['card', 'wallet']} />
          <p className="text-[12px] text-muted">{t('vip.autorenew_note')}</p>
          {failed ? <Notice tone="bad">{failed}</Notice> : null}
        </div>
      </Modal>
      <Modal open={celebrate} onClose={() => setCelebrate(false)} title={t('vip.activated')} size="sm" footer={<Button onClick={() => { setCelebrate(false); navigate('/vip/promotion'); }}>{t('vip.see_campaign')}</Button>}>
        <div className="animate-pop py-2 text-center">
          <div className="sheen relative mx-auto aspect-[1.6/1] w-full max-w-[300px] overflow-hidden rounded-[22px] bg-gradient-to-br from-[#232325] to-[#0b0b0c] p-5 text-left text-white">
            <div className="flex items-center justify-between"><LogoMark size={28} onDark /><span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.18em]">VIP</span></div>
            <div className="absolute bottom-5 left-5 text-[16px] font-semibold">{user?.name}</div>
            <span className="absolute bottom-5 right-5 grid size-9 place-items-center rounded-full accent-grad"><IconCheck className="animate-pop size-5 [animation-delay:.4s]" aria-hidden /></span>
          </div>
          <p className="mt-5 text-sm text-muted">{t('vip.activated_body')}</p>
        </div>
      </Modal>
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('vip.cancel')} body={t('vip.cancel_body', { date: s ? date(s.renewsAt) : '' })} confirmLabel={t('vip.cancel')} danger loading={cancel.pending}
        onConfirm={async () => { await cancel.run(); setCancelOpen(false); toast(t('vip.cancelled_toast')); }} />
    </div>
  );
}

export function PromotionPage() {
  const { t, date, lang } = useI18n();
  usePageTitle(t('promo.title'), t('meta.promo'));
  const { user } = useAuth();
  const toast = useToast();
  const q = useQuery(() => promotionService.activeVipCampaign(), []);
  const promo = q.data?.promo;
  const entries = useQuery(() => (user && promo ? promotionService.myEntries(promo.id) : Promise.resolve(0)), [user?.id, promo?.id]);
  const vip = useQuery(() => (user ? vipService.status() : Promise.resolve(null)), [user?.id]);
  const join = useAction(promotionService.join);
  const isVip = !!vip.data && vip.data.status !== 'expired' && new Date(vip.data.renewsAt).getTime() > Date.now();
  if (q.loading) return <SkeletonRows count={5} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  const L = (p: NonNullable<typeof promo>, f: 'name' | 'headline' | 'eligibility' | 'rules') => localizedText(p, p.i18n, lang, f);
  return (
    <div>
      {!promo ? <EmptyState icon={IconGift} title={t('promo.none')} body={t('promo.none_body')} action={<Button to="/vip">{t('nav.vip')}</Button>} /> : (
        <>
          <section className="relative overflow-hidden rounded-[32px] bg-[#111] px-5 pb-8 pt-8 text-white md:px-10 md:pb-10">
            <div className="dot-grid-dark absolute inset-0" aria-hidden />
            <Link to="/vip" className="relative text-[13px] text-white/50 hover:text-white">← {t('nav.vip')}</Link>
            <div className="eyebrow relative mt-6 text-accent-2">{t('promo.monthly')}</div>
            <h1 className="display relative mt-3 text-[32px] uppercase md:text-[56px]">{L(promo, 'name')}</h1>
            <p className="relative mt-3 text-lg text-white/70">{L(promo, 'headline')}</p>
            <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] bg-white/[0.06] p-5 ring-1 ring-white/10"><div className="text-[12px] text-white/50">{t('promo.prize')}</div><div className="mt-1 font-semibold">{promo.prize}</div></div>
              <div className="rounded-[20px] bg-white/[0.06] p-5 ring-1 ring-white/10"><div className="text-[12px] text-white/50">{t('promo.prizes_n')}</div><div className="num mt-1 text-2xl font-semibold">{promo.prizeCount}</div></div>
              <div className="rounded-[20px] bg-white/[0.06] p-5 ring-1 ring-white/10"><div className="text-[12px] text-white/50">{t('promo.period')}</div><div className="mt-1 font-semibold">{date(promo.startsAt)} — {date(promo.endsAt)}</div></div>
            </div>
          </section>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <section className="space-y-6">
              <div className="card p-6"><h2 className="font-semibold">{t('promo.eligibility')}</h2><p className="mt-2 text-sm text-muted">{L(promo, 'eligibility')}</p></div>
              <div className="card p-6"><h2 className="font-semibold">{t('promo.rules')}</h2><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{L(promo, 'rules')}</p></div>
              {q.data!.past.length ? <div className="card p-6"><h2 className="font-semibold">{t('promo.past')}</h2><ul className="mt-3 space-y-2">{q.data!.past.map((p) => <li key={p.id} className="flex justify-between text-sm"><span>{L(p, 'name')} · {p.prize}</span><span className="text-muted">{date(p.endsAt)}</span></li>)}</ul></div> : null}
            </section>
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="card p-6">
                <div className="flex items-center gap-2"><IconTicket className="size-5" aria-hidden /><h2 className="font-semibold">{t('promo.your_participation')}</h2></div>
                {!user ? <><p className="mt-2 text-sm text-muted">{t('promo.sign_in')}</p><Button className="mt-4" full to="/login?next=/vip/promotion">{t('auth.sign_in')}</Button></>
                  : !isVip ? <><p className="mt-2 text-sm text-muted">{t('promo.vip_only')}</p><Button className="mt-4" full variant="accent" icon={IconCrown} to="/vip">{t('vip.subscribe')}</Button><p className="mt-3 text-[12px] text-muted">{t('promo.free_entry')}</p></>
                  : (entries.data ?? 0) > 0 ? <><div className="num mt-4 text-4xl font-semibold">{entries.data}</div><p className="text-sm text-muted">{t('promo.entries')}</p><p className="mt-3 text-[12px] text-muted">{t('promo.more_entries')}</p></>
                  : <><p className="mt-2 text-sm text-muted">{t('promo.join_body')}</p><Button className="mt-4" full loading={join.pending} onClick={async () => { const r = await join.run(promo.id); if (r) { toast(t('promo.joined')); entries.reload(); } }}>{t('promo.join')}</Button></>}
                <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[12px] text-muted"><IconCalendar className="size-3.5" aria-hidden />{t('promo.draw_note', { date: date(promo.endsAt) })}</div>
              </div>
              <div className="mt-3"><Notice tone="neutral">{t('promo.legal')}</Notice></div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
