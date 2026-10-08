import { useEffect, useMemo, useState } from 'react';
import { apiPost, hydrateCatalog, SERVER_CATALOG } from '@/services/catalogApi';
import { useI18n, LANGS } from '@/i18n';
import { STRINGS } from '@/i18n/strings';
import type { StringKey } from '@/i18n/strings';
import { useAction, useDbRevision, useQuery } from '@/lib/hooks';
import { notificationService, supportService, contentService } from '@/services/accountServices';
import { db, getCurrentUser, resetDb } from '@/services/db';
import type { FaqItem, Lang, NotificationType, SupportTicket } from '@/lib/types';
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, MiniSelect, Modal, Notice, Select, SkeletonRows, StatusBadge, Switch, Tabs, Textarea, useToast } from '@/components/ui';
import { statusKey } from '@/components/commerce';
import { Toolbar } from './sections-commerce';
import { PartnersAdmin, PromoBannersAdmin } from './sections-home';
import { IconDown, IconEdit, IconPlus, IconSend, IconTrash, IconRetry } from '@/components/icons';
import { useNotificationText } from '../notifications';

// ---------------- NOTIFICATIONS & SUPPORT INBOX ----------------
export function NotificationsSection() {
  const { t, tk, rel, date } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'broadcast' | 'tickets'>('broadcast');
  const [f, setF] = useState({ audience: 'all' as 'all' | 'vip' | 'business' | 'personal', type: 'promotion' as NotificationType, title: '', body: '', link: '' });
  const [touched, setTouched] = useState(false);
  const send = useAction(notificationService.broadcast);
  const recent = useQuery(() => notificationService.listAll(), []);
  const tickets = useQuery(() => supportService.listAll(), []);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const rep = useAction(supportService.reply);
  const text = useNotificationText();
  const errs = { title: f.title.trim().length < 3 ? t('form.required') : null, body: f.body.trim().length < 3 ? t('form.required') : null, link: f.link && !f.link.startsWith('/') ? t('admin.link_err') : null };
  useEffect(() => { if (ticket) setTicket(tickets.data?.find((x) => x.id === ticket.id) || null); }, [tickets.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <Tabs value={tab} onChange={setTab} className="mb-4" label={t('admin.s.notifications')} items={[{ value: 'broadcast', label: t('admin.broadcast') }, { value: 'tickets', label: t('admin.support_inbox'), count: (tickets.data || []).filter((x) => x.status !== 'resolved').length }]} />
      {tab === 'broadcast' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <form className="card space-y-4 p-5" onSubmit={async (e: { preventDefault(): void }) => {
            e.preventDefault(); setTouched(true); if (Object.values(errs).some(Boolean)) return;
            const n = await send.run(f); if (n !== undefined) { toast(t('admin.broadcast_sent', { n })); setF({ ...f, title: '', body: '', link: '' }); setTouched(false); }
          }} noValidate>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('admin.audience')} value={f.audience} onChange={(v) => setF({ ...f, audience: v })} options={(['all', 'vip', 'business', 'personal'] as const).map((a) => ({ value: a, label: tk(`admin.aud.${a}`) }))} />
              <Select label={t('admin.kind')} value={f.type} onChange={(v) => setF({ ...f, type: v })} options={(['promotion', 'vip', 'order', 'cargo', 'security', 'price_drop', 'group_buy'] as const).map((x) => ({ value: x, label: tk(`notif.type.${x}`) }))} />
            </div>
            <Input label={t('admin.f.title')} value={f.title} onChange={(v) => setF({ ...f, title: v })} error={touched ? errs.title : null} maxLength={80} />
            <Textarea label={t('admin.body')} value={f.body} onChange={(v) => setF({ ...f, body: v })} rows={3} error={touched ? errs.body : null} maxLength={240} />
            <Input label={t('admin.link')} value={f.link} onChange={(v) => setF({ ...f, link: v })} optional placeholder="/vip/promotion" error={touched ? errs.link : null} />
            <Button type="submit" icon={IconSend} loading={send.pending}>{t('admin.send_broadcast')}</Button>
          </form>
          <div className="card p-5">
            <div className="eyebrow mb-3">{t('admin.recent_notifications')}</div>
            {recent.loading ? <SkeletonRows count={4} /> : <ul className="divide-y divide-line">{(recent.data || []).slice(0, 12).map((n) => { const x = text(n); return <li key={n.id} className="py-2.5 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{x.title}</span><span className="shrink-0 text-[11px] text-faint">{rel(n.createdAt)}</span></div><div className="text-[12px] text-muted">{db().users.find((u) => u.id === n.userId)?.name} · {tk(`notif.type.${n.type}`)}</div></li>; })}</ul>}
          </div>
        </div>
      ) : tickets.loading ? <SkeletonRows /> : tickets.error ? <ErrorState error={tickets.error} onRetry={tickets.reload} /> : (
        <DataTable rows={tickets.data!} rowKey={(x) => x.id} onRowClick={(x) => setTicket(x)} mobileTitle={(x) => x.subject} empty={<EmptyState title={t('support.no_tickets')} />}
          columns={[
            { key: 'n', header: '#', cell: (x) => <span className="num">{x.number}</span> },
            { key: 's', header: t('support.subject'), cell: (x) => <span className="font-medium">{x.subject}</span>, mobile: false },
            { key: 'c', header: t('admin.customer'), cell: (x) => db().users.find((u) => u.id === x.userId)?.name || x.userId },
            { key: 'k', header: t('support.category'), cell: (x) => tk(`support.cat.${x.category}`) },
            { key: 'st', header: t('common.status'), cell: (x) => <StatusBadge status={x.status} label={tk(statusKey('ticket', x.status))} /> },
            { key: 'd', header: t('common.date'), cell: (x) => date(x.createdAt) },
          ]} />
      )}
      {ticket ? (
        <Modal open onClose={() => setTicket(null)} title={ticket.subject} description={`${ticket.number} · ${db().users.find((u) => u.id === ticket.userId)?.name || ''}`} size="lg">
          <div className="mb-4 flex items-center gap-2"><MiniSelect label={t('common.status')} value={ticket.status} onChange={async (v: SupportTicket['status']) => { await supportService.setStatus(ticket.id, v); toast(t('admin.saved')); }} options={(['open', 'in_progress', 'resolved'] as const).map((s) => ({ value: s, label: tk(statusKey('ticket', s)) }))} /></div>
          <ol className="space-y-2">{ticket.messages.map((m, i) => <li key={i} className={`rounded-[12px] px-4 py-2.5 text-sm ${m.from === 'agent' ? 'bg-ink text-on-ink' : 'bg-mist'}`}><div className="mb-0.5 text-[11px] opacity-60">{m.from === 'agent' ? t('support.agent') : t('admin.customer')} · {date(m.at, true)}</div>{m.text}</li>)}</ol>
          <div className="mt-4 flex items-end gap-2"><div className="flex-1"><Textarea label={t('support.reply')} value={reply} onChange={setReply} rows={2} /></div><Button icon={IconSend} loading={rep.pending} disabled={!reply.trim()} onClick={async () => { await rep.run(ticket.id, reply); setReply(''); }} aria-label={t('common.send')} /></div>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------------- CONTENT (CMS) ----------------
function FaqEditor({ item, open, onClose }: { item: FaqItem | null; open: boolean; onClose: () => void }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const blank: Omit<FaqItem, 'id'> = { category: 'orders', order: 99, q: { en: '', ru: '', tk: '' }, a: { en: '', ru: '', tk: '' } };
  const [f, setF] = useState<Omit<FaqItem, 'id'> & { id?: string }>(blank);
  const [lang, setLang] = useState<Lang>('en');
  const save = useAction(supportService.saveFaq);
  useEffect(() => { if (open) setF(item ? structuredClone(item) : blank); }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title={item ? t('admin.edit_faq') : t('admin.new_faq')} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.pending} disabled={!f.q.en.trim() || !f.a.en.trim()} onClick={async () => { const r = await save.run(f); if (r) { toast(t('admin.saved')); onClose(); } }}>{t('common.save')}</Button></>}>
      <div className="space-y-4">
        <Select label={t('support.category')} value={f.category} onChange={(v) => setF({ ...f, category: v })} options={(['orders', 'payments', 'cargo', 'auto', 'account'] as const).map((c) => ({ value: c, label: tk(`support.faqcat.${c}`) }))} />
        <Tabs variant="pill" value={lang} onChange={setLang} items={LANGS.map((l) => ({ value: l.code, label: l.label }))} label={t('common.language')} />
        <Input label={t('admin.question')} value={f.q[lang]} onChange={(v) => setF({ ...f, q: { ...f.q, [lang]: v } })} error={lang === 'en' && !f.q.en.trim() ? t('admin.en_required') : null} />
        <Textarea label={t('admin.answer')} value={f.a[lang]} onChange={(v) => setF({ ...f, a: { ...f.a, [lang]: v } })} rows={4} />
      </div>
    </Modal>
  );
}

export function ContentSection() {
  const { t, tk, lang } = useI18n();
  const toast = useToast();
  useDbRevision();
  const c = contentService.get();
  const [tab, setTab] = useState<'home' | 'promo' | 'partners' | 'categories' | 'banner' | 'faq'>('home');
  const [banner, setBanner] = useState(c.banner);
  const [bLang, setBLang] = useState<Lang>('en');
  const bText = bLang === 'en' ? banner.text : banner.i18n?.[bLang] ?? '';
  const setBText = (v: string) => setBanner(bLang === 'en' ? { ...banner, text: v } : { ...banner, i18n: { ...(banner.i18n || {}), [bLang]: v } });
  const [faq, setFaq] = useState<{ open: boolean; item: FaqItem | null }>({ open: false, item: null });
  const faqs = useQuery(() => supportService.faqs(), []);
  const update = useAction(contentService.update);
  const sections = [...c.homeSections].sort((a, b) => a.order - b.order);
  const cats = [...db().categories].sort((a, b) => a.order - b.order);
  const move = (key: string, dir: -1 | 1) => update.run((cc) => {
    const list = [...cc.homeSections].sort((a, b) => a.order - b.order);
    const i = list.findIndex((s) => s.key === key); const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
  });
  return (
    <div>
      <Tabs value={tab} onChange={setTab} className="mb-4" label={t('admin.s.content')} items={[{ value: 'home', label: t('admin.home_sections') }, { value: 'promo', label: t('admin.promo.tab'), count: (c.promoBanners || []).length }, { value: 'partners', label: t('admin.partner.tab'), count: (c.partners || []).length }, { value: 'categories', label: t('admin.categories') }, { value: 'banner', label: t('admin.banner') }, { value: 'faq', label: 'FAQ' }]} />
      {tab === 'home' ? (
        <ul className="card divide-y divide-line">
          {sections.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 p-4">
              <span className="num w-6 text-faint">{i + 1}</span>
              <span className="flex-1 font-medium">{tk(`admin.home.${s.key}`)}</span>
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(s.key, -1)} aria-label={t('admin.move_up')}>↑</Button>
              <Button size="sm" variant="ghost" disabled={i === sections.length - 1} onClick={() => move(s.key, 1)} aria-label={t('admin.move_down')} icon={IconDown} />
              <Switch hideLabel label={t('admin.visible')} checked={s.visible} onChange={(v) => update.run((cc) => { cc.homeSections.find((x) => x.key === s.key)!.visible = v; })} />
            </li>
          ))}
        </ul>
      ) : tab === 'promo' ? <PromoBannersAdmin /> : tab === 'partners' ? <PartnersAdmin /> : tab === 'categories' ? (
        <ul className="card divide-y divide-line">
          {cats.map((cat) => (
            <li key={cat.id} className="flex items-center gap-3 p-4">
              <span className="flex-1 font-medium">{tk(`cat.${cat.id}`)}</span>
              <span className="text-[12px] text-muted">{t('admin.products_n', { n: db().products.filter((p) => p.categoryId === cat.id).length })}</span>
              <Switch hideLabel label={t('admin.visible')} checked={cat.visible} onChange={async (v) => { await contentService.setCategoryVisible(cat.id, v); toast(t('admin.saved')); }} />
            </li>
          ))}
        </ul>
      ) : tab === 'banner' ? (
        <div className="card max-w-xl space-y-4 p-5">
          <Switch label={t('admin.banner_enabled')} checked={banner.enabled} onChange={(v) => setBanner({ ...banner, enabled: v })} />
          <Tabs variant="pill" value={bLang} onChange={setBLang} items={LANGS.map((l) => ({ value: l.code, label: l.label }))} label={t('common.language')} />
          <Input label={t('admin.banner_text')} value={bText} onChange={setBText} maxLength={120} error={bLang === 'en' && banner.enabled && banner.text.trim().length < 5 ? t('form.min_4') : null} hint={bLang !== 'en' ? t('admin.fallback_en') : undefined} />
          <Input label={t('admin.link')} value={banner.link} onChange={(v) => setBanner({ ...banner, link: v })} error={banner.link && !banner.link.startsWith('/') ? t('admin.link_err') : null} />
          <p className="text-[12px] text-muted">{t('admin.banner_vip_note')}</p>
          <Button loading={update.pending} disabled={(banner.enabled && banner.text.trim().length < 5) || (!!banner.link && !banner.link.startsWith('/'))} onClick={async () => { await update.run((cc) => { cc.banner = banner; }); toast(t('admin.saved')); }}>{t('common.save')}</Button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex justify-end"><Button size="sm" icon={IconPlus} onClick={() => setFaq({ open: true, item: null })}>{t('admin.new_faq')}</Button></div>
          {faqs.loading ? <SkeletonRows /> : <ul className="card divide-y divide-line">{(faqs.data || []).map((f) => <li key={f.id} className="flex items-start gap-3 p-4"><Badge>{tk(`support.faqcat.${f.category}`)}</Badge><div className="min-w-0 flex-1"><div className="font-medium">{f.q[lang] || f.q.en}</div><div className="line-clamp-1 text-[12px] text-muted">{f.a[lang] || f.a.en}</div></div><Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setFaq({ open: true, item: f })} aria-label={t('common.edit')} /><Button size="sm" variant="ghost" icon={IconTrash} onClick={async () => { await supportService.removeFaq(f.id); toast(t('admin.deleted')); }} aria-label={t('common.delete')} /></li>)}</ul>}
        </div>
      )}
      <FaqEditor open={faq.open} item={faq.item} onClose={() => setFaq({ open: false, item: null })} />
      <div className="mt-6"><Notice tone="neutral">{t('admin.cms_note')}</Notice></div>
    </div>
  );
}

// ---------------- TRANSLATIONS ----------------
export function TranslationsSection() {
  const { t } = useI18n();
  const toast = useToast();
  useDbRevision();
  const [q, setQ] = useState('');
  const [lang, setLang] = useState<Lang>('ru');
  const [onlyNav, setOnlyNav] = useState(false);
  const [edit, setEdit] = useState<{ key: StringKey; value: string } | null>(null);
  const [limit, setLimit] = useState(60);
  const overrides = contentService.get().translationOverrides[lang] || {};
  const update = useAction(contentService.update);
  const idx = { en: 0, ru: 1, tk: 2 }[lang];
  const keys = useMemo(() => (Object.keys(STRINGS) as StringKey[]).filter((k) => (!onlyNav || k.startsWith('nav.')) && (!q || k.includes(q) || STRINGS[k].some((s) => s.toLowerCase().includes(q.toLowerCase())))), [q, onlyNav]);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('admin.search_keys')}>
        <MiniSelect label={t('common.language')} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.code, label: l.name }))} />
        <Button size="sm" variant={onlyNav ? 'primary' : 'secondary'} onClick={() => setOnlyNav(!onlyNav)}>{t('admin.nav_labels')}</Button>
      </Toolbar>
      <p className="mb-3 text-[12px] text-muted">{t('admin.translations_note', { n: Object.keys(STRINGS).length, o: Object.keys(overrides).length })}</p>
      <div className="overflow-x-auto rounded-[14px] bg-paper hairline">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-3 font-medium">{t('admin.key')}</th><th className="px-4 py-3 font-medium">EN</th><th className="px-4 py-3 font-medium">{lang.toUpperCase()}</th><th className="px-4 py-3" /></tr></thead>
          <tbody>
            {keys.slice(0, limit).map((k) => (
              <tr key={k} className="border-b border-line/70 last:border-0">
                <td className="num px-4 py-2.5 text-[11.5px] text-muted">{k}</td>
                <td className="max-w-[260px] px-4 py-2.5">{STRINGS[k][0]}</td>
                <td className="max-w-[260px] px-4 py-2.5">{overrides[k] ? <><span className="font-medium">{overrides[k]}</span> <Badge tone="metal">{t('admin.override')}</Badge></> : STRINGS[k][idx]}</td>
                <td className="px-4 py-2.5"><Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEdit({ key: k, value: overrides[k] ?? STRINGS[k][idx] })} aria-label={t('common.edit')} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {keys.length > limit ? <div className="mt-4 flex justify-center"><Button variant="secondary" onClick={() => setLimit(limit + 100)}>{t('common.load_more')} ({keys.length - limit})</Button></div> : null}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t('admin.edit_translation')} description={edit?.key}
        footer={<>{edit && overrides[edit.key] ? <Button variant="ghost" icon={IconRetry} onClick={async () => { await update.run((c) => { delete c.translationOverrides[lang]![edit.key]; }); toast(t('admin.reset_done')); setEdit(null); }}>{t('admin.reset_default')}</Button> : null}<Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button loading={update.pending} disabled={!edit?.value.trim()} onClick={async () => { if (!edit) return; await update.run((c) => { c.translationOverrides[lang] = { ...(c.translationOverrides[lang] || {}), [edit.key]: edit.value }; }); toast(t('admin.saved')); setEdit(null); }}>{t('common.save')}</Button></>}>
        {edit ? <div className="space-y-3"><div className="rounded-[10px] bg-mist p-3 text-sm">EN: {STRINGS[edit.key][0]}</div><Textarea label={LANGS.find((l) => l.code === lang)!.name} value={edit.value} onChange={(v) => setEdit({ ...edit, value: v })} rows={3} /></div> : null}
      </Modal>
    </div>
  );
}

// ---------------- SETTINGS ----------------
export function SettingsSection() {
  const { t } = useI18n();
  const toast = useToast();
  useDbRevision();
  const s = contentService.get().settings;
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) as Record<string, string | boolean>);
  const [reset, setReset] = useState(false);
  const update = useAction(contentService.update);
  const serverSave = useAction(apiPost);
  const numKeys = ['serviceFeePct', 'vipFeePct', 'cargoRateTMTPerKg', 'expressRateTMTPerKg', 'usdToTmt', 'cnyToTmt', 'dutyEstimatePct'] as const;
  const invalid = numKeys.some((k) => !(Number(f[k]) > 0));
  return (
    <div className="max-w-2xl space-y-6">
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        {numKeys.map((k) => <Input key={k} label={t(`admin.set.${k}`)} value={String(f[k])} onChange={(v) => setF({ ...f, [k]: v.replace(/[^\d.]/g, '') })} inputMode="decimal" error={!(Number(f[k]) > 0) ? t('form.invalid_amount') : null} />)}
        <div className="sm:col-span-2"><Switch label={t('admin.set.simulateErrors')} description={t('admin.set.simulateErrors_desc')} checked={!!f.simulateErrors} onChange={(v) => setF({ ...f, simulateErrors: v })} /></div>
        <div className="sm:col-span-2"><Button loading={update.pending || serverSave.pending} disabled={invalid} onClick={async () => {
          if (SERVER_CATALOG) {
            // The server's pricing configuration is the source of truth; FX is only re-stamped when it changed.
            const fx: Record<string, string> = {};
            if (Number(f.cnyToTmt) !== s.cnyToTmt) fx.CNY = String(f.cnyToTmt);
            if (Number(f.usdToTmt) !== s.usdToTmt) fx.USD = String(f.usdToTmt);
            const ok = await serverSave.run('/api/admin/catalog/pricing', { serviceFeePct: String(f.serviceFeePct), vipFeePct: String(f.vipFeePct), dutyEstimatePct: String(f.dutyEstimatePct), cargoRatePerKg: String(f.cargoRateTMTPerKg), expressRatePerKg: String(f.expressRateTMTPerKg), fx });
            if (!ok) return;
          }
          await update.run((c) => { numKeys.forEach((k) => { c.settings[k] = Number(f[k]); }); c.settings.simulateErrors = !!f.simulateErrors; });
          if (SERVER_CATALOG) void hydrateCatalog(getCurrentUser());
          toast(t('admin.saved'));
        }}>{t('common.save')}</Button></div>
      </div>
      {serverSave.error ? <Notice tone="bad">{serverSave.error.message}</Notice> : null}
      <Notice tone="neutral">{t('admin.settings_note')}</Notice>
      <div className="card p-5">
        <div className="font-semibold">{t('profile.reset_demo')}</div>
        <p className="mt-1 text-sm text-muted">{t('profile.reset_demo_body')}</p>
        <Button className="mt-4" variant="danger" icon={IconRetry} onClick={() => setReset(true)}>{t('profile.reset_demo')}</Button>
      </div>
      <ConfirmDialog open={reset} onClose={() => setReset(false)} title={t('profile.reset_demo')} body={t('profile.reset_demo_body')} confirmLabel={t('profile.reset_demo')} danger onConfirm={() => { resetDb(); void hydrateCatalog(getCurrentUser()); setReset(false); toast(t('profile.reset_done')); }} />
    </div>
  );
}
