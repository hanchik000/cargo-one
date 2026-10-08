import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { navigate, useLocation } from '@/lib/router';
import { useAction } from '@/lib/hooks';
import { aiBuyerService } from '@/services/searchService';
import { supplierService } from '@/services/supplierService';
import { favoriteService } from '@/services/accountServices';
import { db } from '@/services/db';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import type { AIRequest, QuoteOption } from '@/lib/types';
import { Badge, Button, cn, Input, Modal, Notice, Skeleton, Textarea, useToast } from '@/components/ui';
import { QuoteCard } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { IconAI, IconArrow, IconCart, IconGift, IconHeart, IconSend, IconHistory, IconInfo } from '@/components/icons';

/** Products sold as packs, e.g. “(100)”, are ordered in packs. */
const packSize = (productId: string) => Number(db().products.find((p) => p.id === productId)?.title.match(/\((\d+)\)/)?.[1] || 1);

type Msg = { from: 'user' | 'ai'; text: string; req?: AIRequest; error?: boolean };

function QuoteModal({ option, kind, onClose, quantity }: { option: QuoteOption | null; kind: 'quote' | 'sample'; onClose: () => void; quantity?: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const send = useAction(supplierService.requestQuote);
  useEffect(() => { if (option) { setQty(String(kind === 'sample' ? 2 : Math.max(option.moq, quantity || 0))); setTarget(String(option.unitPriceUSD)); setNotes(''); } }, [option, kind]);
  if (!option) return null;
  const sup = db().suppliers.find((s) => s.id === option.supplierId);
  const qtyErr = !/^\d+$/.test(qty) || Number(qty) < 1 ? t('form.invalid_qty') : null;
  const targetErr = target && !(Number(target) > 0) ? t('form.invalid_amount') : null;
  return (
    <Modal open onClose={onClose} title={kind === 'sample' ? t('ai.order_sample') : t('ai.request_quote')} description={sup?.name}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={send.pending} disabled={!!qtyErr || !!targetErr} onClick={async () => {
        const q = await send.run({ supplierId: option.supplierId, productTitle: option.title, qty: Number(qty), targetPriceUSD: target ? Number(target) : undefined, notes, kind });
        if (q) { toast(kind === 'sample' ? t('ai.sample_sent') : t('ai.quote_sent'), 'ok', { label: t('ai.view_quotes'), to: '/business?tab=quotes' }); onClose(); }
      }}>{t('common.send')}</Button></>}>
      <div className="space-y-4">
        <Input label={t('product.quantity')} value={qty} onChange={(v) => setQty(v.replace(/\D/g, ''))} inputMode="numeric" error={qtyErr} />
        {kind === 'quote' ? <Input label={t('ai.target_price')} value={target} onChange={setTarget} inputMode="decimal" prefix="$" error={targetErr} optional /> : null}
        <Textarea label={t('ai.notes')} value={notes} onChange={setNotes} rows={3} optional placeholder={t('ai.notes_ph')} />
        {send.error ? <Notice tone="bad">{t('form.server_error')}</Notice> : null}
      </div>
    </Modal>
  );
}

export function AIBuyerPage() {
  const { t, tk, money } = useI18n();
  usePageTitle(t('nav.ai_buyer'), t('meta.ai_buyer'));
  const { query } = useLocation();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const [input, setInput] = useState(query.get('q') || '');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [current, setCurrent] = useState<AIRequest | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [modal, setModal] = useState<{ option: QuoteOption | null; kind: 'quote' | 'sample' }>({ option: null, kind: 'quote' });
  const procure = useAction(aiBuyerService.procure);
  const history = aiBuyerService.history;
  const [past, setPast] = useState<AIRequest[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { void history().then(setPast); }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = query.get('r');
    if (id) { const r = db().aiRequests.find((x) => x.id === id); if (r) { setCurrent(r); setMsgs([{ from: 'user', text: r.prompt }, { from: 'ai', text: '', req: r }]); } }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs.length, procure.pending]);

  const ask = async (prompt = input) => {
    const p = prompt.trim();
    if (p.length < 8) return;
    setMsgs((m) => [...m, { from: 'user', text: p }]);
    setInput('');
    const r = await procure.run(p);
    if (r) { setMsgs((m) => [...m, { from: 'ai', text: '', req: r }]); setCurrent(r); setCompare([]); }
    else setMsgs((m) => [...m, { from: 'ai', text: t('ai.error'), error: true }]);
  };
  const needLogin = () => { navigate(`/login?next=${encodeURIComponent('/ai-buyer')}`); };
  const examples = [t('ai.example_1'), t('ai.example_2'), t('ai.example_3')];
  const sel = current?.options.filter((o) => compare.includes(o.supplierId)) || [];

  const summary = (r: AIRequest) => {
    const parts: string[] = [];
    if (r.parsed.quantity) parts.push(t('ai.parsed.qty', { n: r.parsed.quantity }));
    if (r.parsed.budgetUSD) parts.push(t('ai.parsed.budget', { v: money(r.parsed.budgetUSD, 'USD') }));
    if (r.parsed.categoryId) parts.push(t('ai.parsed.category', { v: tk(`cat.${r.parsed.categoryId}`) }));
    return parts;
  };

  const panel = sel.length ? sel : (current?.options.slice(0, 3) || []);
  return (
    <div>
      <section className="relative overflow-hidden rounded-[32px] bg-[#111] p-5 text-white md:p-10" aria-label={t('ai.conversation')}>
        <div className="dot-grid-dark absolute inset-0" aria-hidden />
        <div className="absolute -right-20 -top-20 size-72 rounded-full bg-accent/20 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full accent-grad"><IconAI className="size-5" aria-hidden /></span>
            <div><div className="display text-[18px] uppercase tracking-wide">{t('nav.ai_buyer')}</div><div className="text-[12px] text-white/50">{t('ai.agent_sub')}</div></div>
          </div>
          <h1 className="display mt-7 text-[30px] uppercase md:text-[48px]">{t('ai.ask_title')}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-white/60">{t('ai.subtitle')}</p>
          <form className="mt-6" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void ask(); }}>
            <div className="flex items-end gap-2 rounded-[26px] bg-white p-2.5 pl-5 text-[#111] shadow-[var(--shadow-float)] transition focus-within:shadow-[0_0_0_3px_rgba(224,138,78,.55),var(--shadow-float)]">
              <label htmlFor="ai-input" className="sr-only">{t('ai.input_label')}</label>
              <textarea id="ai-input" value={input} onChange={(e: { target: HTMLTextAreaElement }) => setInput(e.target.value)} rows={2} placeholder={t('ai.placeholder')}
                onKeyDown={(e: { key: string; shiftKey: boolean; preventDefault(): void }) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}
                className="max-h-48 min-h-[60px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-relaxed outline-none placeholder:text-[#9a9a95] md:text-[18px]" />
              <Button type="submit" variant="accent" size="lg" icon={IconSend} disabled={input.trim().length < 8} loading={procure.pending} aria-label={t('common.send')}><span className="hidden md:inline">{t('ai.run')}</span></Button>
            </div>
            {input && input.trim().length < 8 ? <p className="mt-2 px-3 text-[12px] text-white/50">{t('ai.min_chars')}</p> : null}
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            {examples.map((e) => <button key={e} type="button" onClick={() => void ask(e)} className="press rounded-full bg-white/[0.08] px-4 py-2 text-left text-[13px] text-white/80 ring-1 ring-white/10 hover:bg-white/15">“{e}”</button>)}
          </div>
          {past.length ? <div className="mt-5 flex flex-wrap items-center gap-2 text-[12px] text-white/45"><IconHistory className="size-3.5" aria-hidden />{t('ai.history')}:{past.slice(0, 3).map((r) => <button key={r.id} type="button" onClick={() => { setCurrent(r); setMsgs([{ from: 'user', text: r.prompt }, { from: 'ai', text: '', req: r }]); }} className="max-w-[220px] truncate rounded-full px-2 py-1 text-white/70 underline-offset-4 hover:text-white hover:underline">{r.prompt}</button>)}</div> : null}
        </div>
      </section>

      {msgs.length || procure.pending ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section aria-label={t('ai.workspace')} aria-live="polite" className="min-w-0">
            <ol className="space-y-4">
              {msgs.map((m, i) => (
                <li key={i} className="animate-rise">
                  {m.from === 'user' ? (
                    <div className="flex items-start gap-3"><span className="mono mt-1 shrink-0 rounded-full bg-mist-2 px-2.5 py-1 text-[11px] text-muted">{t('ai.brief')}</span><p className="text-[17px] font-medium leading-snug">“{m.text}”</p></div>
                  ) : m.req ? (
                    <div className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-soft)]">
                      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted"><span className="grid size-6 place-items-center rounded-full accent-grad text-white"><IconAI className="size-3.5" aria-hidden /></span>{t('ai.understood')}</div>
                      <div className="mt-3 flex flex-wrap gap-1.5">{summary(m.req).length ? summary(m.req).map((x) => <span key={x} className="rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-ink">{x}</span>) : <span className="text-[13px] text-muted">{t('ai.no_constraints')}</span>}</div>
                      <p className="mt-3 text-[14px]">{m.req.options.length ? t('ai.found', { n: m.req.options.length }) : t('ai.found_none')}</p>
                      {m.req.options[0] ? <p className="mt-1 text-[13px] text-muted">{t('ai.top_pick', { supplier: db().suppliers.find((s) => s.id === m.req!.options[0].supplierId)?.name || '', total: money(m.req.options[0].totalUSD, 'USD') })}</p> : null}
                      {!m.req.parsed.quantity ? <p className="mt-1 text-[13px] text-warn">{t('ai.ask_qty')}</p> : null}
                    </div>
                  ) : <div className={cn('rounded-[20px] px-5 py-4 text-sm', m.error ? 'bg-bad/10 text-bad' : 'bg-paper')}>{m.text}</div>}
                </li>
              ))}
            </ol>
            {procure.pending ? (
              <div className="mt-5 space-y-3" role="status" aria-label={t('ai.thinking')}>
                <div className="flex items-center gap-2 text-[13px] text-muted">{[0, 1, 2].map((i) => <span key={i} className="size-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${i * 150}ms` }} />)}<span className="ml-1">{t('ai.thinking')}</span></div>
                {[0, 1].map((i) => <Skeleton key={i} className="h-56 rounded-[24px]" />)}
              </div>
            ) : null}
            {current ? (
              <div className="mt-8">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-[22px] font-semibold uppercase tracking-[0.02em]">{t('ai.results_title')}</h2>
                  <span className="text-[12px] text-muted">{t('ai.ranked_note')}</span>
                </div>
                {!current.options.length ? <Notice tone="warn">{t('ai.found_none')}</Notice> : (
                  <div className="space-y-4">
                    {current.options.map((o, i) => {
                      const sup = db().suppliers.find((s) => s.id === o.supplierId);
                      const best = i === 0;
                      const ghost = best ? 'text-white ring-1 ring-white/15 hover:bg-white/10' : undefined;
                      return (
                        <QuoteCard key={o.supplierId} option={o} supplier={sup} rank={i} comparing={compare.includes(o.supplierId)} onCompare={() => setCompare((c) => (c.includes(o.supplierId) ? c.filter((x) => x !== o.supplierId) : [...c, o.supplierId]))}
                          actions={<>
                            <Button size="sm" variant={best ? 'accent' : 'primary'} icon={IconSend} onClick={() => (user ? setModal({ option: o, kind: 'quote' }) : needLogin())}>{t('ai.request_quote')}</Button>
                            <Button size="sm" variant={best ? 'ghost' : 'secondary'} className={ghost} icon={IconGift} onClick={() => (user ? setModal({ option: o, kind: 'sample' }) : needLogin())}>{t('ai.order_sample')}</Button>
                            {o.productId ? <Button size="sm" variant={best ? 'ghost' : 'secondary'} className={ghost} icon={IconCart} onClick={() => { cart.add({ productId: o.productId!, qty: Math.max(1, Math.ceil((current.parsed.quantity || 1) / packSize(o.productId!))) }); toast(t('cart.added'), 'ok', { label: t('nav.cart'), to: '/cart' }); }}>{t('ai.buy')}</Button> : null}
                            <Button size="sm" variant="ghost" className={ghost} icon={IconHeart} onClick={async () => { if (!user) return needLogin(); const added = await favoriteService.toggle('supplier', o.supplierId); toast(added ? t('ai.supplier_saved') : t('fav.removed')); }}>{t('ai.save_supplier')}</Button>
                          </>} />
                      );
                    })}
                  </div>
                )}
                <div className="mt-6"><Notice tone="neutral" icon={IconInfo}>{t('ai.mock_note')}</Notice></div>
                {user?.role === 'business' ? <Button className="mt-4" variant="link" iconRight={IconArrow} to="/business?tab=quotes">{t('ai.view_quotes')}</Button> : null}
              </div>
            ) : null}
          </section>
          <aside id="ai-compare" className="lg:sticky lg:top-24 lg:self-start" aria-label={t('compare.title')}>
            <div className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between"><h3 className="text-[15px] font-semibold uppercase tracking-[0.04em]">{t('ai.comparison')}</h3><Badge>{sel.length ? t('ai.selected_n', { n: sel.length }) : t('ai.top_3')}</Badge></div>
              {!panel.length ? <p className="mt-4 text-[13px] text-muted">{t('ai.workspace_empty_body')}</p> : (
                <div className="mt-4 space-y-3">
                  {panel.map((o) => { const s = db().suppliers.find((x) => x.id === o.supplierId); const minTotal = Math.min(...panel.map((x) => x.totalUSD)); return (
                    <div key={o.supplierId} className="rounded-[18px] bg-mist p-4">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-semibold">{s?.name}</span><span className="num shrink-0 text-[12px] font-semibold">{s?.score}</span></div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted">
                        <div>{t('ai.col.price')}<div className="num text-[13px] font-semibold text-ink">{money(o.unitPriceUSD, 'USD', { decimals: 2 })}</div></div>
                        <div>{t('ai.col.moq')}<div className="num text-[13px] font-semibold text-ink">{o.moq}</div></div>
                        <div>{t('ai.col.production')}<div className="num text-[13px] font-semibold text-ink">{t('common.days', { n: o.productionDays })}</div></div>
                      </div>
                      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3"><span className="text-[11px] uppercase tracking-[0.1em] text-muted">{t('ai.col.total')}</span><span className={cn('price text-[17px]', o.totalUSD === minTotal && 'text-ok')}>{money(o.totalUSD, 'USD')}</span></div>
                    </div>
                  ); })}
                  {!sel.length ? <p className="text-[12px] text-muted">{t('ai.compare_hint')}</p> : null}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('ai.workspace')}>
          {(['supplier', 'score', 'price', 'moq', 'production', 'quality', 'shipping', 'total'] as const).map((k, i) => (
            <div key={k} className="rounded-[20px] bg-paper p-4 shadow-[var(--shadow-soft)]"><span className="mono text-[11px] text-faint">0{i + 1}</span><div className="mt-3 text-[13px] font-semibold uppercase tracking-[0.06em]">{t(`ai.col.${k}`)}</div></div>
          ))}
          <p className="text-[13px] text-muted sm:col-span-2 lg:col-span-4">{t('ai.workspace_empty_body')}</p>
        </section>
      )}
      <QuoteModal option={modal.option} kind={modal.kind} quantity={current?.parsed.quantity} onClose={() => setModal({ option: null, kind: 'quote' })} />
    </div>
  );
}
