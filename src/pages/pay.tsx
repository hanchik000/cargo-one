import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useParams } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { invoiceService } from '@/services/invoiceService';
import { db } from '@/services/db';
import type { Invoice, InvoiceStatus } from '@/lib/types';
import { invoiceCosts } from '@/lib/pricing';
import { Badge, Button, Checkbox, cn, ConfirmDialog, EmptyState, ErrorState, FileCard, Input, KV, Notice, PageHeader, Select, SectionTitle, SkeletonRows, StatusBadge, UploadBox, useToast } from '@/components/ui';
import { CargoLine, statusKey, useUserVip } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { IconCheck, IconLock, IconReceipt, IconShield, IconTrash, IconWallet, IconX, IconInfo, IconClock, IconBuilding, IconUpload, IconArrow } from '@/components/icons';

const FLOW: InvoiceStatus[] = ['draft', 'under_review', 'processing', 'paid'];

export function PayPage() {
  const { t, tk, money, date } = useI18n();
  usePageTitle(t('nav.pay'), t('meta.pay'));
  const list = useQuery(() => invoiceService.mine(), []);
  const upload = useAction(invoiceService.upload);
  const [progress, setProgress] = useState(0);
  const [fileErr, setFileErr] = useState('');
  const onFile = async (f: File) => {
    setFileErr('');
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(f.name)) { setFileErr(t('pay.err_type')); return; }
    if (f.size > 15 * 1024 * 1024) { setFileErr(t('find.err_size')); return; }
    setProgress(5);
    const timer = setInterval(() => setProgress((p) => Math.min(95, p + 9)), 120);
    const inv = await upload.run({ name: f.name, size: f.size, type: f.type });
    clearInterval(timer); setProgress(100);
    if (inv) navigate(`/pay/${inv.id}`);
  };
  return (
    <div>
      <PageHeader display eyebrow={t('pay.eyebrow')} title={t('pay.title')} subtitle={t('pay.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0">
          <div className="card p-3 md:p-4">
            <UploadBox large title={t('pay.drop_title')} accept=".pdf,image/*" onFile={onFile} label={t('pay.upload_cta')} hint={t('pay.upload_hint')} busy={upload.pending} progress={progress} icon={IconUpload} />
            {upload.pending ? <p className="mt-3 px-2 text-[13px] text-muted" role="status">{t('pay.extracting')}</p> : null}
            {fileErr || upload.error ? <p className="mt-3 px-2 text-[13px] text-bad" role="alert">{fileErr || tk(`err.${(upload.error as { code?: string }).code || 'server_error'}`)}</p> : null}
            <div className="px-3 pb-2 pt-6 md:px-5">
              <CargoLine nodes={[{ label: t('pay.flow.you'), sub: 'TM' }, { label: t('pay.flow.review'), sub: 'CARGO ONE' }, { label: t('pay.flow.partner'), sub: t('pay.flow.licensed') }, { label: t('pay.flow.supplier'), sub: 'CN' }]} progress={0} animate={false} />
            </div>
          </div>
          <div className="mt-10 flex items-end justify-between gap-3"><h2 className="text-[20px] font-semibold uppercase tracking-[0.02em]">{t('pay.history')}</h2>{list.data?.length ? <span className="num text-[13px] text-muted">{list.data.length}</span> : null}</div>
          <div className="mt-4">
          {list.loading ? <SkeletonRows count={3} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} compact /> : !list.data?.length ? (
            <EmptyState icon={IconWallet} title={t('pay.none')} body={t('pay.none_body')} />
          ) : (
            <ul className="card stagger divide-y divide-line overflow-hidden">
              {list.data.map((i) => (
                <li key={i.id}>
                  <Link to={`/pay/${i.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-mist/70">
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', i.status === 'paid' ? 'bg-ok/10 text-ok' : i.status === 'failed' ? 'bg-bad/10 text-bad' : 'bg-mist')}>{i.status === 'paid' ? <IconCheck className="size-5" aria-hidden /> : <IconReceipt className="size-5" aria-hidden />}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{i.supplierName}</div><div className="mono text-[12px] text-muted">{i.invoiceNumber} · {date(i.createdAt)}</div></div>
                    <div className="text-right"><div className="price text-[16px]">{money(i.amount, i.currency)}</div><StatusBadge status={i.status} label={tk(statusKey('invoice', i.status))} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          </div>
        </section>
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[24px] bg-[#111] p-6 text-white">
            <span className="grid size-11 place-items-center rounded-full accent-grad"><IconShield className="size-5" aria-hidden /></span>
            <div className="mt-5 text-[16px] font-semibold">{t('pay.compliance_title')}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{t('pay.compliance_body')}</p>
          </div>
          <div className="card p-6">
            <span className="grid size-11 place-items-center rounded-full bg-mist"><IconInfo className="size-5" aria-hidden /></span>
            <div className="mt-5 text-[16px] font-semibold">{t('pay.fees_title')}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t('pay.fees_body')}</p>
          </div>
          <ol className="card space-y-3 p-6 text-[13px]">
            {(['upload', 'review', 'pay', 'paid'] as const).map((k, i) => <li key={k} className="flex items-center gap-3"><span className="mono grid size-7 shrink-0 place-items-center rounded-full bg-mist text-[11px] font-semibold">{i + 1}</span>{t(`pay.step.${k}`)}</li>)}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function StatusTracker({ inv }: { inv: Invoice }) {
  const { t, tk } = useI18n();
  const failed = inv.status === 'failed' || inv.status === 'refunded';
  const steps: InvoiceStatus[] = failed ? ['draft', 'under_review', 'processing', inv.status] : FLOW;
  const idx = failed ? 3 : FLOW.indexOf(inv.status);
  return (
    <div aria-label={t('common.status')}>
      <CargoLine nodes={steps.map((s) => ({ label: tk(statusKey('invoice', s)) }))} progress={inv.status === 'paid' ? 3 : idx} />
      {failed ? <p className="mt-2 text-right text-[12px] font-semibold text-bad">{tk(statusKey('invoice', inv.status))}</p> : null}
    </div>
  );
}

export function InvoicePage() {
  const { id } = useParams();
  const { t, tk, money, date } = useI18n();
  const toast = useToast();
  const vip = useUserVip();
  const q = useQuery(() => invoiceService.get(id), [id]);
  const [form, setForm] = useState<Invoice | null>(null);
  const [kyc, setKyc] = useState({ owner: false, purpose: false, terms: false });
  const [touched, setTouched] = useState(false);
  const [del, setDel] = useState(false);
  const submit = useAction(invoiceService.submit);
  const save = useAction(invoiceService.updateDraft);
  const remove = useAction(invoiceService.remove);
  useEffect(() => { if (q.data && (!form || form.id !== q.data.id || form.status !== q.data.status)) setForm(q.data); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Poll while the partner is processing (status changes arrive asynchronously).
  useEffect(() => {
    if (!q.data || !['under_review', 'processing'].includes(q.data.status)) return;
    const timer = setInterval(() => q.reload(), 2500);
    return () => clearInterval(timer);
  }, [q.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  usePageTitle(q.data ? q.data.invoiceNumber : t('nav.pay'));
  if (q.loading && !form) return <SkeletonRows count={6} />;
  if (q.error || !q.data || !form) return <ErrorState error={q.error} onRetry={q.reload} />;
  const inv = q.data;
  const draft = inv.status === 'draft';
  const s = db().content.settings;
  const costs = invoiceCosts(Number(form.amount) || 0, form.currency, s, vip);
  const set = (k: keyof Invoice) => (v: string) => setForm((f) => (f ? { ...f, [k]: k === 'amount' ? (v.replace(/[^\d.]/g, '') as unknown as number) : v } : f));
  const errs = {
    supplierName: form.supplierName.trim().length < 2 ? t('form.required') : null,
    invoiceNumber: form.invoiceNumber.trim().length < 2 ? t('form.required') : null,
    invoiceDate: !/^\d{4}-\d{2}-\d{2}$/.test(form.invoiceDate) ? t('form.invalid_date') : null,
    amount: !(Number(form.amount) > 0) ? t('form.invalid_amount') : null,
    beneficiary: form.beneficiary.trim().length < 3 ? t('form.required') : null,
    bankName: form.bankName.trim().length < 3 ? t('form.required') : null,
    account: form.account.replace(/\D/g, '').length < 8 && !form.account.includes('•') ? t('pay.err_account') : null,
    swift: !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(form.swift.trim().toUpperCase()) ? t('pay.err_swift') : null,
  };
  const valid = Object.values(errs).every((x) => !x);
  const kycOk = kyc.owner && kyc.purpose && kyc.terms;
  const pay = async () => {
    setTouched(true);
    if (!valid || !kycOk) return;
    const saved = await save.run(inv.id, { supplierName: form.supplierName, invoiceNumber: form.invoiceNumber, invoiceDate: form.invoiceDate, amount: Number(form.amount), currency: form.currency, beneficiary: form.beneficiary, bankName: form.bankName, account: form.account, swift: form.swift.trim().toUpperCase(), orderRef: form.orderRef });
    if (!saved) return;
    const r = await submit.run(inv.id, true);
    if (r) { toast(t('pay.submitted')); q.reload(); }
  };
  return (
    <div>
      <PageHeader back={{ to: '/pay', label: t('nav.pay') }} eyebrow={t('pay.invoice')} title={<span className="num">{inv.invoiceNumber}</span>} subtitle={inv.supplierName}
        actions={<StatusBadge status={inv.status} label={tk(statusKey('invoice', inv.status))} />} />
      <div className="card mb-8 px-5 py-6 md:px-8"><StatusTracker inv={inv} /></div>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          {inv.status === 'failed' ? <div className="mb-4"><Notice tone="bad" icon={IconX} title={t('pay.failed_title')}>{inv.failureReason}</Notice></div> : null}
          {inv.status === 'refunded' ? <div className="mb-4"><Notice tone="neutral" title={t('pay.refunded_title')}>{inv.failureReason}</Notice></div> : null}
          {inv.status === 'paid' ? <div className="mb-4"><Notice tone="ok" icon={IconCheck} title={t('pay.paid_title')}>{t('pay.paid_body', { date: inv.processedAt ? date(inv.processedAt, true) : '' })}</Notice></div> : null}
          {['under_review', 'processing'].includes(inv.status) ? <div className="mb-4"><Notice tone="info" icon={IconClock} title={tk(statusKey('invoice', inv.status))}>{t(inv.status === 'under_review' ? 'pay.review_body' : 'pay.processing_body')}</Notice></div> : null}
          <SectionTitle title={draft ? t('pay.review_extracted') : t('pay.invoice_details')} sub={draft ? t('pay.review_extracted_sub') : undefined} />
          <div className="card p-5 md:p-6">
            {draft ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={t('find.supplier')} value={form.supplierName} onChange={set('supplierName')} error={touched ? errs.supplierName : null} />
                <Input label={t('pay.invoice_number')} value={form.invoiceNumber} onChange={set('invoiceNumber')} error={touched ? errs.invoiceNumber : null} />
                <Input label={t('pay.invoice_date')} type="date" value={form.invoiceDate} onChange={set('invoiceDate')} error={touched ? errs.invoiceDate : null} />
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Input label={t('pay.amount')} value={String(form.amount)} onChange={set('amount')} inputMode="decimal" error={touched ? errs.amount : null} />
                  <Select label={t('pay.currency')} value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={[{ value: 'CNY', label: 'CNY' }, { value: 'USD', label: 'USD' }]} />
                </div>
                <div className="sm:col-span-2"><Input label={t('pay.beneficiary')} value={form.beneficiary} onChange={set('beneficiary')} error={touched ? errs.beneficiary : null} /></div>
                <Input label={t('pay.bank')} value={form.bankName} onChange={set('bankName')} error={touched ? errs.bankName : null} />
                <Input label={t('pay.account')} value={form.account} onChange={set('account')} error={touched ? errs.account : null} />
                <Input label={t('pay.swift')} value={form.swift} onChange={set('swift')} error={touched ? errs.swift : null} hint={t('pay.swift_hint')} />
                <Input label={t('pay.order_ref')} value={form.orderRef} onChange={set('orderRef')} optional />
              </div>
            ) : (
              <div className="grid gap-x-8 sm:grid-cols-2">
                <KV k={t('find.supplier')} v={inv.supplierName} mono={false} />
                <KV k={t('pay.invoice_number')} v={inv.invoiceNumber} />
                <KV k={t('pay.invoice_date')} v={date(inv.invoiceDate)} mono={false} />
                <KV k={t('pay.amount')} v={money(inv.amount, inv.currency)} />
                <KV k={t('pay.beneficiary')} v={inv.beneficiary} mono={false} />
                <KV k={t('pay.bank')} v={inv.bankName} mono={false} />
                <KV k={t('pay.account')} v={inv.account} />
                <KV k={t('pay.swift')} v={inv.swift} />
                <KV k={t('pay.order_ref')} v={inv.orderRef || '—'} />
                <KV k={t('pay.customer')} v={inv.customerName} mono={false} />
              </div>
            )}
          </div>
          <div className="mt-4"><FileCard name={inv.fileName} meta={t('pay.source_file')} /></div>
          {inv.status === 'paid' ? <div className="mt-2"><FileCard name={`Payment confirmation ${inv.invoiceNumber}.pdf`} meta={t('pay.confirmation_meta')} /></div> : null}
          {inv.status === 'failed' ? <Button className="mt-4" to="/pay">{t('pay.upload_corrected')}</Button> : null}
        </section>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-lift)]">
            <div className="relative bg-[#111] px-6 pb-6 pt-5 text-white">
              <div className="dot-grid-dark absolute inset-0" aria-hidden />
              <div className="relative flex items-center justify-between"><span className="eyebrow text-white/50">{t('pay.summary')}</span><Badge tone="glass">{t('price.estimated')}</Badge></div>
              <div className="relative mt-5 text-[12px] uppercase tracking-[0.1em] text-white/50">{t('pay.total')}</div>
              <div className="price relative text-[38px] leading-tight">{money(draft ? costs.totalTMT : inv.totalTMT, 'TMT')}</div>
              <div className="relative mt-1 text-[13px] text-white/55">{money(Number(form.amount) || 0, form.currency)} → {inv.supplierName}</div>
            </div>
            <div className="px-6 py-4">
              <KV k={t('find.supplier')} v={<span className="font-medium">{form.supplierName}</span>} mono={false} />
              <KV k={t('pay.invoice')} v={<span className="mono">{form.invoiceNumber}</span>} mono={false} />
              <KV k={t('pay.amount')} v={money(Number(form.amount) || 0, form.currency)} />
              <KV k={t('pay.currency')} v={form.currency} />
              <KV k={t('pay.invoice_amount')} v={`≈ ${money(costs.amountTMT, 'TMT')}`} />
              <KV k={t('pay.service_fee', { pct: costs.feePct })} v={money(draft ? costs.serviceFeeTMT : inv.serviceFeeTMT, 'TMT')} />
              <KV k={t('pay.settlement_cost')} v={money(draft ? costs.settlementCostTMT : inv.settlementCostTMT, 'TMT')} />
              <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-mist-3 pt-3"><span className="font-semibold">{t('pay.total')}</span><span className="price text-[22px]">{money(draft ? costs.totalTMT : inv.totalTMT, 'TMT')}</span></div>
              <p className="mt-2 text-[11.5px] text-muted">{t('pay.rate_note')}</p>
              {draft ? (
                <div className="mt-5 space-y-3.5 rounded-[18px] bg-mist p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em]">{t('pay.kyc_title')}</div>
                  <Checkbox label={t('pay.kyc_owner')} checked={kyc.owner} onChange={(v) => setKyc({ ...kyc, owner: v })} />
                  <Checkbox label={t('pay.kyc_purpose')} checked={kyc.purpose} onChange={(v) => setKyc({ ...kyc, purpose: v })} />
                  <Checkbox label={t('pay.kyc_terms')} checked={kyc.terms} onChange={(v) => setKyc({ ...kyc, terms: v })} />
                  {touched && !kycOk ? <p className="text-[12px] text-bad">{t('pay.kyc_required')}</p> : null}
                </div>
              ) : null}
              {draft ? <Button size="xl" full className="mt-5" icon={IconLock} loading={submit.pending || save.pending} onClick={pay}>{t('pay.pay_supplier')}</Button> : null}
              {draft ? <button type="button" onClick={() => setDel(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 text-[12px] text-muted hover:text-ink"><IconTrash className="size-3.5" aria-hidden />{t('pay.discard')}</button> : null}
              {submit.error ? <p className="mt-2 text-[12px] text-bad">{tk(`err.${(submit.error as { code?: string }).code || 'server_error'}`)}</p> : null}
              <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-[11.5px] leading-relaxed text-muted"><IconBuilding className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('pay.compliance_short')}</p>
            </div>
          </div>
        </aside>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={t('pay.discard')} body={t('pay.discard_body')} confirmLabel={t('pay.discard')} danger loading={remove.pending} onConfirm={async () => { await remove.run(inv.id); navigate('/pay', { replace: true }); }} />
    </div>
  );
}
