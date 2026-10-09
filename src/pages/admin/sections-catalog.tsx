// Admin → Catalogue sources: adapter status, sync health and import runs (server build).
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { useAction, useQuery } from '@/lib/hooks';
import { apiGet, apiPost, hydrateCatalog, SERVER_CATALOG } from '@/services/catalogApi';
import { db, getCurrentUser } from '@/services/db';
import { Badge, Button, Checkbox, DataTable, EmptyState, ErrorState, Input, KV, Notice, Select, SkeletonRows, useToast } from '@/components/ui';
import { IconRetry } from '@/components/icons';

interface AdapterInfo {
  id: string; label: string; kind: string; live: boolean; available: boolean; reason: string | null;
  stats: { products: number; errors: number; stale: number; lastSync: string | null };
  usage: { callsToday: number; errorsToday: number; lastError: string | null; dailyLimit: number } | null;
  provider: string | null; lang: string | null;
}
interface ImportRun { id: string; source: string; actor: string | null; started_at: string; finished_at: string | null; status: string; created: number; updated: number; unchanged: number; failed: number; errors: { sourceProductId?: string; code: string; detail?: string | null }[] }
interface ImportResult { id: string; status: string; published?: number; created: number; updated: number; unchanged: number; failed: number; errors: { code: string; detail?: string | null }[]; meta: { returned: number; total: number | null; detailsStopped: string | null } | null }
interface PricingInfo { fx: Record<string, { rate: string; source: string; asOf: string }>; serviceFeeBps: number; vipFeeBps: number; marginBps: number; dutyEstimateBps: number; cargoRatePerKg: string; expressRatePerKg: string; minCargo: string; tariffIsDemo: boolean }

/** Ready-made starter set: popular English queries per CARGO ONE category (AliExpress search works best in English). */
const STARTER: [string, string][] = [
  ['wireless earbuds', 'electronics'], ['smart watch', 'electronics'], ['power bank', 'electronics'], ['phone case', 'electronics'],
  ['women handbag', 'fashion'], ['men sneakers', 'fashion'], ['hoodie', 'fashion'],
  ['kitchen gadgets', 'home'], ['led lamp', 'home'], ['storage organizer', 'home'],
  ['makeup brush set', 'beauty'], ['skin care', 'beauty'],
  ['educational toys', 'kids'],
  ['cordless drill', 'tools'], ['tool set', 'tools'],
  ['car phone holder', 'auto'], ['car accessories', 'auto'],
];
const PAGE = 40;
const callsFor = (n: number, details: boolean) => Math.ceil(n / PAGE) + (details ? n : 0);

/** Search import for a paid aggregator: every page of 40 results is 1 call; "full details" adds 1 call per item. */
function SearchImport({ adapter, pending, onRun, onBatch }: { adapter: AdapterInfo; pending: boolean; onRun: (body: Record<string, unknown>) => void; onBatch: (bodies: Record<string, unknown>[]) => void }) {
  const { t, tk } = useI18n();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState('40');
  const [cat, setCat] = useState('electronics');
  const [details, setDetails] = useState(false);
  const [publish, setPublish] = useState(true);
  const n = Number(limit);
  const valid = q.trim().length >= 2 && Number.isInteger(n) && n >= 1 && n <= 200;
  const cost = callsFor(n || 0, details);
  const left = adapter.usage ? adapter.usage.dailyLimit - adapter.usage.callsToday : Infinity;
  const starterCost = STARTER.length;
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[16px] bg-mist p-4">
        <div className="text-[14px] font-semibold">{t('admin.cat.starter')}</div>
        <p className="mt-1 text-[12.5px] text-muted">{t('admin.cat.starter_desc', { n: STARTER.length, items: STARTER.length * PAGE })}</p>
        <Button className="mt-3" size="sm" icon={IconRetry} loading={pending} disabled={starterCost > left}
          onClick={() => onBatch(STARTER.map(([query, categoryId]) => ({ source: adapter.id, query, limit: PAGE, categoryId, details: false, publish })))}>
          {t('admin.cat.starter_run', { n: starterCost })}
        </Button>
      </div>
      <form className="space-y-3" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); if (valid) onRun({ source: adapter.id, query: q.trim(), limit: n, categoryId: cat, details, publish }); }}>
        <Input label={t('admin.cat.query')} value={q} onChange={setQ} hint={t('admin.cat.query_hint')} />
        <div className="grid grid-cols-2 gap-2">
          <Input label={t('admin.cat.limit')} value={limit} onChange={(v) => setLimit(v.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" />
          <Select label={t('shop.category')} value={cat} onChange={setCat} options={db().categories.map((c) => ({ value: c.id, label: tk(`cat.${c.id}`) }))} />
        </div>
        <Checkbox label={t('admin.cat.details')} description={t('admin.cat.details_desc')} checked={details} onChange={setDetails} />
        <Checkbox label={t('admin.cat.publish')} description={t('admin.cat.publish_desc')} checked={publish} onChange={setPublish} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" icon={IconRetry} loading={pending} disabled={!valid || cost > left}>{t('admin.cat.search_import')}</Button>
          <span className="text-[12px] text-muted">{t('admin.cat.cost', { n: cost })}</span>
        </div>
      </form>
    </div>
  );
}

const RUN_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info'> = { succeeded: 'ok', partial: 'warn', failed: 'bad', running: 'info' };

export function CatalogSection() {
  const { t, date } = useI18n();
  const toast = useToast();
  const data = useQuery(() => apiGet<{ staleHours: number; adapters: AdapterInfo[]; runs: ImportRun[] }>('/api/admin/catalog/sources'), [], { live: false, enabled: SERVER_CATALOG });
  const pricing = useQuery(() => apiGet<PricingInfo>('/api/admin/catalog/pricing'), [], { live: false, enabled: SERVER_CATALOG });
  const run = useAction((body: Record<string, unknown>) => apiPost<ImportResult>('/api/admin/catalog/import', body));

  if (!SERVER_CATALOG) return <Notice tone="neutral">{t('admin.cat.server_only')}</Notice>;
  if (data.loading) return <SkeletonRows />;
  if (data.error || !data.data) return <ErrorState error={data.error} onRetry={data.reload} />;
  const { adapters, runs, staleHours } = data.data;

  const [progress, setProgress] = useState<string | null>(null);
  const batch = async (bodies: Record<string, unknown>[]) => {
    let created = 0, published = 0, failed = 0;
    for (let i = 0; i < bodies.length; i++) {
      setProgress(t('admin.cat.progress', { i: i + 1, n: bodies.length, q: String(bodies[i].query) }));
      const r = await run.run(bodies[i]);
      if (!r || r.status === 'failed') { failed++; if (r?.errors[0]?.detail === 'budget_exhausted') break; continue; }
      created += r.created; published += r.published ?? 0;
    }
    setProgress(null);
    toast(t('admin.cat.batch_done', { created, published, failed }), failed ? 'info' : 'ok');
    data.reload();
    void hydrateCatalog(getCurrentUser());
  };
  const start = async (body: Record<string, unknown>) => {
    const r = await run.run(body);
    if (!r) return;
    if (r.status === 'failed') toast(t('admin.cat.run_failed', { code: r.errors[0]?.detail || r.errors[0]?.code || '—' }), 'bad');
    else toast(t('admin.cat.result', { status: r.status, created: r.created, updated: r.updated, unchanged: r.unchanged, failed: r.failed }), r.status === 'succeeded' ? 'ok' : 'info');
    data.reload();
    void hydrateCatalog(getCurrentUser());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold">{t('admin.cat.title')}</h2>
        <p className="mt-1 text-[13px] text-muted">{t('admin.cat.sub')}</p>
      </div>
      {progress ? <Notice tone="info">{progress}</Notice> : null}
      {run.error ? <Notice tone="bad">{run.error.message}</Notice> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {adapters.map((a) => (
          <li key={a.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{a.label}</div>
                <div className="mono mt-0.5 text-[11px] text-faint">{a.id} · {a.kind}</div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {a.live ? <Badge tone="info">{t('admin.cat.live_aggregator')}</Badge> : <Badge tone="neutral">{t('admin.cat.not_live')}</Badge>}
                {!a.available ? <Badge tone="warn">{t('admin.cat.planned')}</Badge> : null}
              </div>
            </div>
            <div className="mt-3">
              <KV k={t('admin.cat.products')} v={a.stats.products} />
              <KV k={t('admin.cat.errors')} v={a.stats.errors} />
              <KV k={t('admin.cat.stale', { h: staleHours })} v={a.stats.stale} />
              <KV k={t('admin.cat.last_sync')} v={a.stats.lastSync ? date(a.stats.lastSync, true) : t('cat.never')} />
            </div>
            {a.usage ? <KV k={t('admin.cat.calls_today')} v={`${a.usage.callsToday} / ${a.usage.dailyLimit}${a.usage.lastError ? ` · ${a.usage.lastError}` : ''}`} /> : null}
            {a.kind === 'aggregator_api'
              ? (a.available ? <SearchImport adapter={a} pending={run.pending || !!progress} onRun={start} onBatch={batch} /> : <p className="mt-3 text-[12.5px] text-muted">{t('admin.cat.not_configured')}</p>)
              : a.available ? <Button className="mt-4" size="sm" icon={IconRetry} loading={run.pending} onClick={() => start({ source: a.id })}>{t('admin.cat.run')}</Button> : null}
          </li>
        ))}
      </ul>
      <Notice tone="info">{t('admin.cat.fixture_note')}</Notice>
      {adapters.some((a) => a.kind === 'aggregator_api' && a.available) ? <Notice tone="warn" title={t('admin.cat.aggregator_title')}>{t('admin.cat.aggregator_note')}</Notice> : null}

      <section>
        <h3 className="mb-3 text-[15px] font-semibold">{t('admin.cat.runs')}</h3>
        <DataTable rows={runs} rowKey={(r) => r.id} mobileTitle={(r) => <span className="mono">{r.id}</span>} empty={<EmptyState title={t('admin.cat.no_runs')} />}
          columns={[
            { key: 'at', header: t('common.date'), cell: (r) => date(r.started_at, true) },
            { key: 'src', header: t('cat.source_name'), cell: (r) => <span className="mono text-[12px]">{r.source}</span> },
            { key: 'st', header: t('common.status'), cell: (r) => <Badge tone={RUN_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
            { key: 'n', header: t('admin.cat.products'), cell: (r) => <span className="num text-[12px]">+{r.created} · ~{r.updated} · ={r.unchanged} · ✕{r.failed}</span> },
            { key: 'e', header: t('admin.cat.errors'), cell: (r) => (r.errors.length ? <span className="text-[12px] text-muted">{r.errors.map((e) => `${e.sourceProductId || '—'}: ${e.code}`).join('; ')}</span> : '—') },
          ]} />
      </section>

      <section className="card p-5">
        <h3 className="text-[15px] font-semibold">{t('admin.cat.pricing')}</h3>
        <p className="mt-1 text-[13px] text-muted">{t('admin.cat.pricing_note')}</p>
        {pricing.data ? (
          <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
            {Object.entries(pricing.data.fx).map(([base, fx]) => <KV key={base} k={`${base}/TMT`} v={`${fx.rate} · ${fx.source === 'demo_default' ? t('cat.fx_demo') : fx.source} · ${date(fx.asOf)}`} />)}
            <KV k={t('admin.set.serviceFeePct')} v={`${pricing.data.serviceFeeBps / 100}%`} />
            <KV k={t('admin.set.dutyEstimatePct')} v={`${pricing.data.dutyEstimateBps / 100}%`} />
            <KV k={t('admin.set.cargoRateTMTPerKg')} v={pricing.data.cargoRatePerKg} />
            <KV k={t('admin.set.expressRateTMTPerKg')} v={pricing.data.expressRatePerKg} />
          </div>
        ) : null}
        {pricing.data?.tariffIsDemo ? <div className="mt-3"><Notice tone="warn">{t('cat.tariff_demo')}</Notice></div> : null}
      </section>
    </div>
  );
}
