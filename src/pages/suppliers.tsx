import { useState } from 'react';
import { useI18n } from '@/i18n';
import { navigate, useParams, useQueryParam } from '@/lib/router';
import { useAction, useDebounced, useQuery } from '@/lib/hooks';
import { supplierService } from '@/services/supplierService';
import { useAuth } from '@/state/auth';
import type { CategoryId } from '@/lib/types';
import { Badge, Button, Checkbox, Chip, EmptyState, ErrorState, FileCard, MiniSelect, Modal, Notice, PageHeader, Progress, ScoreRing, SectionTitle, SkeletonGrid, SkeletonRows, StatusBadge, Textarea, useToast, VerifiedBadge } from '@/components/ui';
import { FavoriteButton, ProductCard, SupplierCard } from '@/components/commerce';
import { SupplierLogo } from '@/components/visuals';
import { RequestQuoteModal } from './business';
import { usePageTitle } from '@/components/shell';
import { IconChat, IconFactory, IconGift, IconPin, IconSearch, IconSend, IconShield, IconStar } from '@/components/icons';

const CATS: CategoryId[] = ['electronics', 'fashion', 'home', 'beauty', 'kids', 'auto', 'tools', 'industrial', 'business'];

export function SuppliersPage() {
  const { t, tk } = useI18n();
  usePageTitle(t('nav.suppliers'), t('meta.suppliers'));
  const [q, setQ] = useState('');
  const [cat, setCat] = useQueryParam('category');
  const [verified, setVerified] = useState(false);
  const [sort, setSort] = useState<'score' | 'response' | 'years'>('score');
  const dq = useDebounced(q, 250);
  const list = useQuery(() => supplierService.list({ q: dq, category: cat as CategoryId | '', verifiedOnly: verified, sort }), [dq, cat, verified, sort]);
  return (
    <div>
      <PageHeader display eyebrow={t('sup.eyebrow')} title={t('nav.suppliers')} subtitle={t('sup.subtitle')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <IconSearch className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e: { target: HTMLInputElement }) => setQ(e.target.value)} placeholder={t('sup.search_ph')} aria-label={t('sup.search_ph')} className="h-12 w-full rounded-full bg-paper pl-11 pr-4 text-[15px] shadow-[var(--shadow-soft)] outline-none focus:shadow-[0_0_0_2px_var(--color-ink),var(--shadow-soft)]" />
        </div>
        <MiniSelect label={t('shop.sort')} value={sort} onChange={setSort} options={[{ value: 'score', label: t('sort.score') }, { value: 'response', label: t('sup.sort_response') }, { value: 'years', label: t('sup.sort_years') }]} />
        <div className="rounded-full bg-paper py-2 pl-3 pr-4 hairline"><Checkbox label={t('sup.verified_only')} checked={verified} onChange={setVerified} /></div>
      </div>
      <div className="rail mb-6 gap-1.5">
        <Chip active={!cat} onClick={() => setCat('')}>{t('common.all')}</Chip>
        {CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{tk(`cat.${c}`)}</Chip>)}
      </div>
      {list.loading ? <SkeletonGrid count={6} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : !list.data?.length ? <EmptyState icon={IconFactory} title={t('sup.empty')} body={t('sup.empty_body')} action={<Button to="/ai-buyer">{t('home.qa.ai_buyer')}</Button>} />
        : <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data.map((s) => <SupplierCard key={s.id} supplier={s} action={<Button size="sm" variant="secondary" to={`/suppliers/${s.id}`}>{t('sup.view_profile')}</Button>} />)}</div>}
    </div>
  );
}

export function SupplierPage() {
  const { id } = useParams();
  const { t, tk, date } = useI18n();
  const q = useQuery(() => supplierService.get(id), [id]);
  const { user } = useAuth();
  const toast = useToast();
  const [quote, setQuote] = useState(false);
  const [sample, setSample] = useState(false);
  const [contact, setContact] = useState(false);
  const [msg, setMsg] = useState('');
  const [touched, setTouched] = useState(false);
  const send = useAction(supplierService.contact);
  const sampleReq = useAction(supplierService.requestQuote);
  usePageTitle(q.data?.supplier.name || t('nav.suppliers'));
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { supplier: s, products } = q.data;
  const requireLogin = (fn: () => void) => () => (user ? fn() : navigate(`/login?next=/suppliers/${s.id}`));
  const avg = s.reviews.reduce((a, r) => a + r.rating, 0) / Math.max(1, s.reviews.length);
  // Imported sellers carry nulls for metrics nobody has measured: those rows are hidden, not filled in.
  const factors = ([[t('sup.f.on_time'), s.onTimeRate], [t('sup.f.response'), s.responseRate], [t('sup.f.disputes'), s.disputeRate == null ? null : Math.max(0, 100 - s.disputeRate * 10)], [t('sup.f.reviews'), s.reviews.length ? Math.round(avg * 20) : null]] as [string, number | null][]).filter((f): f is [string, number] => f[1] != null);
  const dash = (v: unknown, fmt?: (x: never) => string) => (v == null ? '—' : fmt ? fmt(v as never) : String(v));
  return (
    <div>
      <PageHeader back={{ to: '/suppliers', label: t('nav.suppliers') }} title={s.name} subtitle={s.nameCn} />
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="card p-6 md:p-8">
          <div className="flex flex-wrap items-start gap-4">
            <SupplierLogo monogram={s.monogram} size={72} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">{s.verified ? <VerifiedBadge label={t('badge.verified_supplier')} /> : <Badge tone="warn">{t('supplier.unverified')}</Badge>}{s.categories.map((c) => <Badge key={c}>{tk(`cat.${c}`)}</Badge>)}</div>
              <p className="mt-3 text-sm text-muted">{s.description}</p>
              <div className="mt-2 flex items-center gap-1 text-[13px] text-muted"><IconPin className="size-3.5" aria-hidden />{s.city}, {s.province}, CN</div>
            </div>
            <FavoriteButton kind="supplier" refId={s.id} className="bg-mist!" />
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[[t('supplier.years'), dash(s.yearsActive)], [t('common.moq'), dash(s.moq)], [t('sup.response_rate'), dash(s.responseRate, (x: number) => `${x}%`)], [t('sup.response_time'), dash(s.responseHours, (x: number) => t('sup.hours', { n: x }))]].map(([k, v]) => <div key={k as string} className="rounded-[18px] bg-mist p-4"><dt className="text-[11px] uppercase tracking-[0.08em] text-muted">{k}</dt><dd className="num mt-1 text-[22px] font-semibold">{v}</dd></div>)}
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button icon={IconChat} onClick={requireLogin(() => setContact(true))}>{t('sup.contact')}</Button>
            <Button variant="secondary" icon={IconSend} onClick={requireLogin(() => setQuote(true))}>{t('ai.request_quote')}</Button>
            <Button variant="secondary" icon={IconGift} onClick={requireLogin(() => setSample(true))}>{t('ai.order_sample')}</Button>
          </div>
          {s.status === 'pending' ? <div className="mt-4"><Notice tone="warn">{t('sup.pending_note')}</Notice></div> : null}
        </section>
        <aside className="card p-6">
          {s.score != null ? <div className="flex items-center gap-4"><ScoreRing score={s.score} label={t('score.supplier')} size={104} /><div><div className="font-semibold">{t('score.cargo_one')}</div><div className="text-[12px] text-muted">{t('score.demo_hint')}</div></div></div>
            : <Notice tone="warn" title={t('cat.seller_unverified')}>{t('cat.seller_unverified_body')}</Notice>}
          <ul className="mt-5 space-y-3">{factors.map(([k, v]) => <li key={k}><div className="mb-1 flex justify-between text-[12px]"><span className="text-muted">{k}</span><span className="num">{v}</span></div><Progress value={v} label={k} accent={v >= 90} /></li>)}</ul>
          <div className="mt-6 eyebrow">{t('sup.certifications')}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{s.certifications.length ? s.certifications.map((c) => <Badge key={c} icon={IconShield}>{c}</Badge>) : <span className="text-sm text-muted">—</span>}</div>
          <div className="mt-6 eyebrow">{t('sup.documents')}</div>
          <div className="mt-2 space-y-2">{s.documents.map((d) => <div key={d.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{tk(`sup.doc.${d.kind}`)}</span><StatusBadge status={d.status} label={tk(statusDoc(d.status))} /></div>)}</div>
        </aside>
      </div>
      <section className="mb-12">
        <SectionTitle title={t('sup.products')} sub={t('sup.products_n', { n: products.length })} />
        {products.length ? <div className="stagger grid grid-cols-2 gap-x-3 gap-y-9 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <p className="text-sm text-muted">{t('sup.no_products')}</p>}
      </section>
      <section>
        <SectionTitle title={t('product.reviews')} sub={`${avg.toFixed(1)} / 5`} />
        <ul className="grid gap-3 md:grid-cols-3">{s.reviews.map((r) => <li key={r.id} className="card p-5"><div className="flex items-center justify-between text-[13px]"><span className="font-medium">{r.author}</span><span className="inline-flex items-center gap-1"><IconStar className="size-3.5 fill-current" aria-hidden /><span className="num">{r.rating}</span></span></div><p className="mt-2 text-sm text-muted">{r.text}</p><div className="mt-2 text-[11px] text-faint">{date(r.date)}</div></li>)}</ul>
      </section>
      <RequestQuoteModal open={quote} onClose={() => setQuote(false)} supplierId={s.id} />
      <Modal open={sample} onClose={() => setSample(false)} title={t('ai.order_sample')} description={s.name}
        footer={<><Button variant="secondary" onClick={() => setSample(false)}>{t('common.cancel')}</Button><Button loading={sampleReq.pending} onClick={async () => { const r = await sampleReq.run({ supplierId: s.id, productTitle: products[0]?.title || s.name, qty: 2, notes: msg, kind: 'sample' }); if (r) { toast(t('ai.sample_sent')); setSample(false); } }}>{t('common.send')}</Button></>}>
        <p className="text-sm text-muted">{t('sup.sample_body', { product: products[0]?.title || '—' })}</p>
        <div className="mt-4"><Textarea label={t('ai.notes')} value={msg} onChange={setMsg} rows={3} optional /></div>
      </Modal>
      <Modal open={contact} onClose={() => setContact(false)} title={t('sup.contact')} description={s.name}
        footer={<><Button variant="secondary" onClick={() => setContact(false)}>{t('common.cancel')}</Button><Button loading={send.pending} onClick={async () => { setTouched(true); if (msg.trim().length < 10) return; const r = await send.run(s.id, msg); if (r) { toast(t('sup.message_sent'), 'ok', { label: t('nav.support'), to: '/support' }); setContact(false); setMsg(''); setTouched(false); } }}>{t('common.send')}</Button></>}>
        <Textarea label={t('sup.message')} value={msg} onChange={setMsg} rows={5} error={touched && msg.trim().length < 10 ? t('form.min_10') : null} placeholder={t('sup.message_ph')} />
        <div className="mt-3"><Notice tone="neutral">{t('sup.mediated_note')}</Notice></div>
      </Modal>
    </div>
  );
}

const statusDoc = (s: string) => `status.doc.${s}`;
