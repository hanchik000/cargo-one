import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useParams } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { groupBuyService, tierFor } from '@/services/groupBuyService';
import { useAuth } from '@/state/auth';
import { db } from '@/services/db';
import type { GroupBuy } from '@/lib/types';
import { Avatar, Badge, Button, ConfirmDialog, cn, EmptyState, ErrorState, KV, Modal, Notice, PageHeader, Progress, QtyStepper, SectionTitle, SkeletonGrid, SkeletonRows, StatusBadge, Tabs, useToast } from '@/components/ui';
import { ProductVisual } from '@/components/visuals';
import { PaymentMethodPicker } from '@/components/forms';
import { statusKey } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { IconTimer, IconUsers, IconLock, IconCheck, IconInfo } from '@/components/icons';

function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const d = Math.floor(ms / 86_400_000); const h = Math.floor((ms % 86_400_000) / 3_600_000); const m = Math.floor((ms % 3_600_000) / 60_000); const s = Math.floor((ms % 60_000) / 1000);
  return { ms, d, h, m, s };
}

function Countdown({ iso }: { iso: string }) {
  const { t } = useI18n();
  const c = useCountdown(iso);
  if (!c.ms) return <span>{t('gb.ended')}</span>;
  return <span className="num">{c.d ? `${c.d}${t('time.d')} ` : ''}{String(c.h).padStart(2, '0')}:{String(c.m).padStart(2, '0')}:{String(c.s).padStart(2, '0')}</span>;
}

function TierLadder({ gb, extra = 0 }: { gb: GroupBuy; extra?: number }) {
  const { t, money } = useI18n();
  const qty = gb.currentQty + extra;
  const max = Math.max(gb.targetQty, gb.tiers[gb.tiers.length - 1].qty, qty);
  return (
    <div>
      <div className="relative mx-2 h-3 rounded-full bg-mist-2">
        <div className="grow-x absolute inset-y-0 left-0 rounded-full accent-grad transition-[width] duration-700" style={{ width: `${Math.min(100, (gb.currentQty / max) * 100)}%` }} />
        {extra ? <div className="absolute inset-y-0 rounded-full bg-ink/80 transition-all" style={{ left: `${Math.min(100, (gb.currentQty / max) * 100)}%`, width: `${Math.min(100 - (gb.currentQty / max) * 100, (extra / max) * 100)}%` }} /> : null}
        {gb.tiers.map((tr) => <span key={tr.qty} className={cn('absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-paper transition-colors', qty >= tr.qty ? 'bg-ink' : 'bg-mist-3')} style={{ left: `${(tr.qty / max) * 100}%` }} aria-hidden />)}
      </div>
      <ol className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${gb.tiers.length}, minmax(0, 1fr))` }}>
        {gb.tiers.map((tr) => (
          <li key={tr.qty} className={cn('rounded-[16px] p-3 text-center transition-colors', qty >= tr.qty ? 'bg-ink text-on-ink' : 'bg-mist')}>
            <div className={cn('text-[11px]', qty >= tr.qty ? 'opacity-60' : 'text-muted')}>{t('gb.units', { n: tr.qty })}</div>
            <div className="price text-[16px]">{money(tr.priceCNY, 'CNY')}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GroupBuysPage() {
  const { t, money, tk } = useI18n();
  usePageTitle(t('nav.group_buy'), t('meta.group_buy'));
  const [tab, setTab] = useState<'open' | 'completed'>('open');
  const q = useQuery(() => groupBuyService.list(), []);
  const list = (q.data || []).filter((x) => (tab === 'open' ? x.gb.status === 'open' : x.gb.status !== 'open'));
  return (
    <div>
      <PageHeader display eyebrow={t('gb.eyebrow')} title={t('nav.group_buy')} subtitle={t('gb.subtitle')} />
      <div className="card mb-8 p-5 md:p-7">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[[1, 100], [10, 85], [50, 72], [100, 65]].map(([n, p], i) => <div key={n} className={cn('relative overflow-hidden rounded-[20px] p-4 md:p-5', i === 3 ? 'bg-[#111] text-white' : 'bg-mist')}><div className={cn('text-[12px]', i === 3 ? 'text-white/55' : 'text-muted')}>{t('gb.units', { n })}</div><div className="price text-[28px]">¥{p}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10"><div className={cn('h-full rounded-full', i === 3 ? 'accent-grad' : 'bg-ink')} style={{ width: `${[25, 50, 75, 100][i]}%` }} /></div></div>)}
        </div>
        <p className="mt-4 text-[13px] text-muted">{t('gb.explain')}</p>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'open', label: t('gb.tab.open') }, { value: 'completed', label: t('gb.tab.completed') }]} className="mb-6" label={t('nav.group_buy')} />
      {q.loading ? <SkeletonGrid count={3} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !list.length ? <EmptyState icon={IconUsers} title={t('gb.empty')} /> : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map(({ gb, product }) => {
            const tier = tierFor(gb);
            return (
              <Link key={gb.id} to={`/group-buy/${gb.id}`} className="card lift group flex flex-col p-4">
                <div className="flex gap-4">
                  <ProductVisual icon={product.icon} image={product.images[0]} className="size-28 shrink-0 rounded-[18px]" />
                  <div className="min-w-0">
                    <StatusBadge status={gb.status} label={tk(statusKey('gb', gb.status))} />
                    <div className="mt-2 line-clamp-2 font-semibold">{gb.title}</div>
                    <div className="mt-1 flex items-baseline gap-2"><span className="price text-[22px]">{money(tier.current.priceCNY, 'CNY')}</span><span className="num text-xs text-faint line-through">{money(gb.tiers[0].priceCNY, 'CNY')}</span></div>
                  </div>
                </div>
                <div className="mt-5"><Progress value={gb.currentQty} max={gb.targetQty} label={t('gb.progress')} accent /></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div><div className="text-muted">{t('gb.current_qty')}</div><div className="num font-semibold">{gb.currentQty}/{gb.targetQty}</div></div>
                  <div><div className="text-muted">{t('gb.next_price')}</div><div className="num font-semibold">{tier.next ? money(tier.next.priceCNY, 'CNY') : '—'}</div></div>
                  <div><div className="text-muted">{t('gb.time_left')}</div><div className="font-semibold"><Countdown iso={gb.endsAt} /></div></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-[12px] text-muted"><span className="inline-flex items-center gap-1"><IconUsers className="size-3.5" aria-hidden />{t('gb.participants_n', { n: gb.participants.length })}</span><span>{t('gb.saving', { n: tier.savingPct })}</span></div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GroupBuyPage() {
  const { id } = useParams();
  const { t, tk, money, date } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const q = useQuery(() => groupBuyService.get(id), [id]);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [methodId, setMethodId] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const join = useAction(groupBuyService.join);
  const leave = useAction(groupBuyService.leave);
  const [failed, setFailed] = useState('');
  usePageTitle(q.data?.gb.title || t('nav.group_buy'));
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { gb, product } = q.data;
  const tier = tierFor(gb);
  const mine = user ? gb.participants.find((p) => p.userId === user.id) : undefined;
  const after = tierFor(gb, gb.currentQty + qty);
  const reserveTMT = after.current.priceCNY * qty * db().content.settings.cnyToTmt;
  const isOpen = gb.status === 'open' && new Date(gb.endsAt).getTime() > Date.now();
  return (
    <div>
      <PageHeader back={{ to: '/group-buy', label: t('nav.group_buy') }} eyebrow={t('gb.eyebrow')} title={gb.title} actions={<StatusBadge status={gb.status} label={tk(statusKey('gb', gb.status))} />} />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <div className="grid gap-5 md:grid-cols-[240px_1fr]">
            <Link to={`/shop/${product.id}`} className="lift block rounded-[24px]"><ProductVisual icon={product.icon} image={product.images[0]} title={product.title} className="aspect-[4/5] w-full rounded-[24px]" /></Link>
            <div className="card p-5 md:p-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><div className="eyebrow">{t('gb.progress')}</div><div className="display mt-2 text-[40px] leading-none md:text-[52px]">{gb.currentQty}<span className="text-faint"> / {gb.targetQty}</span></div><div className="mt-1 text-[13px] text-muted">{t('gb.units_word')}</div></div>
                <div className="text-right"><div className="eyebrow">{t('gb.time_left')}</div><div className="mt-2 text-[22px] font-semibold"><Countdown iso={gb.endsAt} /></div></div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="rounded-[18px] bg-mist p-4"><div className="text-[11px] text-muted">{t('gb.current_price')}</div><div className="price text-[22px]">{money(tier.current.priceCNY, 'CNY')}</div></div>
                <div className="rounded-[18px] bg-accent-soft p-4"><div className="text-[11px] text-accent">{t('gb.next_level')}</div><div className="price text-[22px] text-accent">{tier.next ? money(tier.next.priceCNY, 'CNY') : '—'}</div></div>
                <div className="rounded-[18px] bg-mist p-4"><div className="text-[11px] text-muted">{t('gb.remaining')}</div><div className="price text-[22px]">{tier.next ? tier.unitsToNext : 0}</div></div>
              </div>
              <div className="mt-7"><TierLadder gb={gb} extra={open ? qty : 0} /></div>
              <p className="mt-4 text-[13px] text-muted">{t('gb.saving_detail', { n: tier.savingPct })}</p>
            </div>
          </div>
          <section>
            <SectionTitle title={t('gb.participants')} sub={t('gb.participants_n', { n: gb.participants.length })} />
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {gb.participants.slice().reverse().map((p, i) => <li key={p.userId + i} className="card flex items-center gap-3 p-3"><Avatar name={p.name} size={32} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.userId === user?.id ? t('gb.you') : p.name}</div><div className="text-[11px] text-muted">{date(p.joinedAt, true)}</div></div><span className="num text-sm">×{p.qty}</span></li>)}
            </ul>
          </section>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative overflow-hidden rounded-[28px] bg-[#111] p-6 text-white">
            <div className="dot-grid-dark pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative">
            {mine ? (
              <>
                <div className="flex items-center gap-2"><IconCheck className="size-5 text-metal" aria-hidden /><span className="font-semibold">{t('gb.joined')}</span></div>
                <div className="mt-4 [&_span]:text-white/90"><KV k={t('product.quantity')} v={mine.qty} /><KV k={t('gb.reserved')} v={money(tierFor(gb).current.priceCNY * mine.qty * db().content.settings.cnyToTmt, 'TMT')} /></div>
                <p className="mt-3 text-[12px] text-white/55">{gb.status === 'completed' ? t('gb.completed_note') : t('gb.hold_note')}</p>
                {isOpen ? <Button variant="inverse" full className="mt-5" onClick={() => setLeaveOpen(true)}>{t('gb.leave')}</Button> : null}
              </>
            ) : isOpen ? (
              <>
                <div className="font-semibold">{t('gb.join_title')}</div>
                <p className="mt-1 text-[13px] text-white/60">{t('gb.join_body')}</p>
                <div className="mt-5 flex -space-x-2">{gb.participants.slice(-6).map((p, i) => <Avatar key={i} name={p.name} size={34} className="ring-2 ring-[#111]" />)}</div>
                <Button variant="accent" size="lg" full className="mt-5" icon={IconUsers} onClick={() => (user ? setOpen(true) : navigate(`/login?next=/group-buy/${gb.id}`))}>{t('gb.join')}</Button>
              </>
            ) : <p className="text-sm text-white/70">{t('gb.closed')}</p>}
            </div>
          </div>
          <div className="mt-3"><Notice tone="neutral" icon={IconInfo}>{t('gb.reservation_arch')}</Notice></div>
        </aside>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('gb.join')} description={gb.title}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="metal" icon={IconLock} disabled={!methodId} loading={join.pending} onClick={async () => {
          setFailed('');
          const r = await join.run(gb.id, qty, methodId);
          if (r?.payment.status === 'authorized') { setOpen(false); toast(r.gb.status === 'completed' ? t('gb.completed_toast') : t('gb.joined_toast')); }
          else if (r) setFailed(r.payment.failureReason || t('checkout.payment_failed'));
        }}>{t('gb.reserve', { amount: money(reserveTMT, 'TMT') })}</Button></>}>
        <div className="space-y-5">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">{t('product.quantity')}</span><QtyStepper value={qty} onChange={setQty} max={500} label={t('product.quantity')} /></div>
          <TierLadder gb={gb} extra={qty} />
          <div className="rounded-[12px] bg-mist p-4"><KV k={t('gb.price_after')} v={money(after.current.priceCNY, 'CNY')} /><KV k={t('gb.reserved')} v={money(reserveTMT, 'TMT')} strong /></div>
          <PaymentMethodPicker value={methodId} onChange={setMethodId} allow={['card', 'wallet']} />
          <p className="text-[12px] text-muted">{t('gb.hold_note')}</p>
          {failed || join.error ? <Notice tone="bad">{failed || tk(`err.${(join.error as { code?: string }).code || 'server_error'}`)}</Notice> : null}
        </div>
      </Modal>
      <ConfirmDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t('gb.leave')} body={t('gb.leave_body')} confirmLabel={t('gb.leave')} danger loading={leave.pending} onConfirm={async () => { await leave.run(gb.id); setLeaveOpen(false); toast(t('gb.left_toast')); }} />
    </div>
  );
}
