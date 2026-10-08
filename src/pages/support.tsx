import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { navigate, useLocation } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { supportService } from '@/services/accountServices';
import { useAuth } from '@/state/auth';
import type { SupportTicket } from '@/lib/types';
import { Button, cn, Disclosure, EmptyState, ErrorState, FileCard, Input, Modal, Notice, PageHeader, Select, SectionTitle, SkeletonRows, StatusBadge, Tabs, Textarea, UploadBox, useToast } from '@/components/ui';
import { statusKey } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { IconAuto, IconCargo, IconChat, IconPackage, IconPlus, IconSend, IconWallet, IconClip } from '@/components/icons';

type Cat = SupportTicket['category'];

function TicketThread({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
  const { t, tk, date } = useI18n();
  const [msg, setMsg] = useState('');
  const reply = useAction(supportService.reply);
  return (
    <Modal open onClose={onClose} title={ticket.subject} description={`${ticket.number} · ${tk(`support.cat.${ticket.category}`)}`} size="lg">
      <div className="mb-4"><StatusBadge status={ticket.status} label={tk(statusKey('ticket', ticket.status))} /></div>
      <ol className="space-y-3" aria-live="polite">
        {ticket.messages.map((m, i) => (
          <li key={i} className={cn('flex', m.from === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-[20px] px-4 py-3 text-sm', m.from === 'user' ? 'rounded-br-[6px] bg-ink text-on-ink' : 'rounded-bl-[6px] bg-mist')}>
              <div className={cn('mb-0.5 text-[11px]', m.from === 'user' ? 'opacity-60' : 'text-muted')}>{m.from === 'user' ? t('support.you') : t('support.agent')} · {date(m.at, true)}</div>
              {m.text}
            </div>
          </li>
        ))}
      </ol>
      {ticket.attachments.length ? <div className="mt-4 space-y-2">{ticket.attachments.map((a) => <FileCard key={a} name={a} />)}</div> : null}
      {ticket.status !== 'resolved' ? (
        <form className="mt-5 flex items-end gap-2" onSubmit={async (e: { preventDefault(): void }) => { e.preventDefault(); if (!msg.trim()) return; await reply.run(ticket.id, msg); setMsg(''); }}>
          <div className="flex-1"><Textarea label={t('support.reply')} value={msg} onChange={setMsg} rows={2} /></div>
          <Button type="submit" icon={IconSend} loading={reply.pending} disabled={!msg.trim()} aria-label={t('common.send')} />
        </form>
      ) : <p className="mt-5 text-sm text-muted">{t('support.resolved_note')}</p>}
    </Modal>
  );
}

export function SupportPage() {
  const { t, tk, lang, date } = useI18n();
  usePageTitle(t('nav.support'), t('meta.support'));
  const { query } = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const faqs = useQuery(() => supportService.faqs(), []);
  const tickets = useQuery(() => (user ? supportService.tickets() : Promise.resolve([])), [user?.id]);
  const [faqCat, setFaqCat] = useState<'all' | 'orders' | 'payments' | 'cargo' | 'auto' | 'account'>('all');
  const [form, setForm] = useState({ category: (query.get('category') || 'order') as Cat, subject: query.get('ref') ? `${query.get('ref')}` : '', message: '' });
  const [files, setFiles] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const create = useAction(supportService.create);
  useEffect(() => { if (query.get('category')) document.getElementById('new-ticket')?.scrollIntoView({ behavior: 'smooth' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const errs = { subject: form.subject.trim().length < 4 ? t('form.min_4') : null, message: form.message.trim().length < 10 ? t('form.min_10') : null };
  const quick: { cat: 'order' | 'payment' | 'cargo' | 'vehicle'; icon: typeof IconPackage }[] = [{ cat: 'order', icon: IconPackage }, { cat: 'payment', icon: IconWallet }, { cat: 'cargo', icon: IconCargo }, { cat: 'vehicle', icon: IconAuto }];
  const ticket = tickets.data?.find((x) => x.id === openTicket);
  const submit = async () => {
    setTouched(true);
    if (!user) { navigate('/login?next=/support'); return; }
    if (errs.subject || errs.message) return;
    const r = await create.run({ category: form.category, subject: form.subject.trim(), message: form.message.trim(), attachments: files, refId: query.get('ref') || undefined });
    if (r) { toast(t('support.created', { number: r.number })); setForm({ ...form, subject: '', message: '' }); setFiles([]); setTouched(false); setOpenTicket(r.id); }
  };
  return (
    <div>
      <PageHeader display eyebrow={t('support.eyebrow')} title={t('nav.support')} subtitle={t('support.subtitle')} />
      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {quick.map(({ cat, icon: Icon }) => (
          <button key={cat} type="button" onClick={() => { setForm((f) => ({ ...f, category: cat })); document.getElementById('new-ticket')?.scrollIntoView({ behavior: 'smooth' }); }} className="card lift group p-5 text-left">
            <span className="grid size-11 place-items-center rounded-full bg-mist transition-colors group-hover:bg-ink group-hover:text-on-ink"><Icon className="size-5" aria-hidden /></span><div className="mt-6 font-semibold uppercase tracking-[0.03em]">{t(`support.quick.${cat}`)}</div><div className="text-[12px] text-muted">{t(`support.quick.${cat}_sub`)}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <SectionTitle title={t('support.faq')} />
          <Tabs value={faqCat} onChange={setFaqCat} variant="pill" className="mb-4" label={t('support.faq')} items={(['all', 'orders', 'payments', 'cargo', 'auto', 'account'] as const).map((c) => ({ value: c, label: c === 'all' ? t('common.all') : t(`support.faqcat.${c}`) }))} />
          {faqs.loading ? <SkeletonRows count={4} /> : faqs.error ? <ErrorState error={faqs.error} onRetry={faqs.reload} compact /> : (
            <div className="card px-5">{faqs.data!.filter((f) => faqCat === 'all' || f.category === faqCat).map((f) => <Disclosure key={f.id} title={f.q[lang] || f.q.en}>{f.a[lang] || f.a.en}</Disclosure>)}</div>
          )}
          {user ? (
            <div className="mt-10">
              <SectionTitle title={t('support.my_tickets')} />
              {tickets.loading ? <SkeletonRows count={2} /> : !tickets.data?.length ? <p className="text-sm text-muted">{t('support.no_tickets')}</p> : (
                <ul className="space-y-2">{tickets.data.map((x) => <li key={x.id}><button type="button" onClick={() => setOpenTicket(x.id)} className="card lift flex w-full items-center gap-4 p-4 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist"><IconChat className="size-[18px]" aria-hidden /></span><div className="min-w-0 flex-1"><div className="truncate font-medium">{x.subject}</div><div className="num text-[12px] text-muted">{x.number} · {date(x.createdAt)} · {t('support.messages_n', { n: x.messages.length })}</div></div><StatusBadge status={x.status} label={tk(statusKey('ticket', x.status))} /></button></li>)}</ul>
              )}
            </div>
          ) : null}
        </section>
        <section id="new-ticket" className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6 md:p-7">
            <h2 className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-10 place-items-center rounded-full accent-grad text-white"><IconPlus className="size-5" aria-hidden /></span>{t('support.new_ticket')}</h2>
            <p className="mt-1 text-[13px] text-muted">{t('support.new_ticket_sub')}</p>
            <form className="mt-5 space-y-4" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submit(); }} noValidate>
              <Select label={t('support.category')} value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={(['order', 'payment', 'cargo', 'vehicle', 'account', 'other'] as const).map((c) => ({ value: c, label: tk(`support.cat.${c}`) }))} />
              <Input label={t('support.subject')} value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} error={touched ? errs.subject : null} maxLength={120} />
              <Textarea label={t('support.message')} value={form.message} onChange={(v) => setForm({ ...form, message: v })} rows={5} error={touched ? errs.message : null} maxLength={2000} />
              <div>
                <UploadBox compact accept="image/*,.pdf" onFile={(f) => { if (f.size > 10 * 1024 * 1024) { toast(t('find.err_size'), 'bad'); return; } setFiles((x) => [...x, f.name].slice(0, 5)); }} label={t('support.attach')} hint={t('support.attach_hint')} icon={IconClip} />
                {files.length ? <div className="mt-2 space-y-2">{files.map((f) => <FileCard key={f} name={f} onRemove={() => setFiles((x) => x.filter((y) => y !== f))} />)}</div> : null}
              </div>
              {create.error ? <Notice tone="bad">{t('form.server_error')}</Notice> : null}
              <Button type="submit" full loading={create.pending} icon={IconSend}>{user ? t('support.submit') : t('support.sign_in_to_submit')}</Button>
            </form>
            <p className="mt-4 text-[12px] text-muted">{t('support.chat_note')}</p>
          </div>
        </section>
      </div>
      {ticket ? <TicketThread ticket={ticket} onClose={() => setOpenTicket(null)} /> : null}
    </div>
  );
}
