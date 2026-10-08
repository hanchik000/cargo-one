// Admin → Content: home promo banners and "Trusted by" partners.
import { useState } from 'react';
import { useI18n, LANGS } from '@/i18n';
import type { Lang, Partner, PartnerKind, PromoBanner, PromoBannerText } from '@/lib/types';
import { useAction, useDbRevision } from '@/lib/hooks';
import { contentService } from '@/services/accountServices';
import { Badge, Button, ConfirmDialog, cn, EmptyState, Input, Modal, Notice, Select, Switch, Tabs, Textarea, UploadBox, useToast } from '@/components/ui';
import { imageSrc, PartnerLogo, partnerKindKey, PromoBannerPreview } from '@/components/promo';
import { IconDown, IconEdit, IconPlus, IconTrash } from '@/components/icons';

const MAX_IMG_BYTES = 600 * 1024;
const MAX_LOGO_BYTES = 300 * 1024;
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_TYPES = [...IMG_TYPES, 'image/svg+xml'];

function readImage(file: File, types: string[], max: number): Promise<string> {
  if (!types.includes(file.type)) return Promise.reject(new Error('type'));
  if (file.size > max) return Promise.reject(new Error('size'));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });
}
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CATALOG = Array.from({ length: 36 }, (_, i) => `img/products/p${i + 1}-0.webp`).concat(['img/hero/cargo-wide.webp', 'img/hero/auto-hero.webp', 'img/hero/cargo-hero.webp']);

function Reorder({ i, n, onMove }: { i: number; n: number; onMove: (dir: -1 | 1) => void }) {
  const { t } = useI18n();
  return <><Button size="sm" variant="ghost" disabled={i === 0} onClick={() => onMove(-1)} aria-label={t('admin.move_up')}>↑</Button><Button size="sm" variant="ghost" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={t('admin.move_down')} icon={IconDown} /></>;
}

function move<T extends { id: string; order: number }>(list: T[], id: string, dir: -1 | 1) {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((x) => x.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  sorted.forEach((x, k) => { x.order = k; });
  [sorted[i].order, sorted[j].order] = [sorted[j].order, sorted[i].order];
}

// ---------------- Promo banners ----------------
const EMPTY_BANNER: PromoBanner = { id: '', enabled: true, order: 0, tone: 'ink', eyebrow: '', title: '', subtitle: '', cta: '', link: '/shop', images: [] };

function BannerEditor({ initial, onClose }: { initial: PromoBanner; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const update = useAction(contentService.update);
  const [b, setB] = useState<PromoBanner>(initial);
  const [lang, setLang] = useState<Lang>('en');
  const [imgErr, setImgErr] = useState<string | null>(null);
  const isNew = !initial.id;
  const field = (k: keyof PromoBannerText) => (lang === 'en' ? b[k] : b.i18n?.[lang]?.[k] ?? '');
  const setField = (k: keyof PromoBannerText, v: string) => setB(lang === 'en' ? { ...b, [k]: v } : { ...b, i18n: { ...(b.i18n || {}), [lang]: { ...(b.i18n?.[lang] || {}), [k]: v } } });
  const errs = {
    title: b.title.trim().length < 4 ? t('form.min_4') : null,
    cta: b.cta.trim().length < 2 ? t('admin.promo.cta_err') : null,
    link: !b.link.startsWith('/') ? t('admin.link_err') : null,
    images: b.images.length ? null : t('admin.promo.img_err'),
  };
  const valid = !Object.values(errs).some(Boolean);
  const addImage = (src: string) => setB((cur) => (cur.images.length >= 3 ? cur : { ...cur, images: [...cur.images, src] }));
  const save = async () => {
    await update.run((c) => {
      c.promoBanners = c.promoBanners || [];
      if (isNew) c.promoBanners.push({ ...b, id: uid('pb'), order: c.promoBanners.length });
      else c.promoBanners = c.promoBanners.map((x) => (x.id === b.id ? b : x));
    });
    toast(t('admin.saved')); onClose();
  };
  return (
    <Modal open onClose={onClose} size="xl" title={isNew ? t('admin.promo.new') : t('admin.promo.edit')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={update.pending} disabled={!valid} onClick={save}>{t('common.save')}</Button></>}>
      <div className="space-y-5">
        <PromoBannerPreview banner={{ ...b, eyebrow: field('eyebrow') || b.eyebrow, title: field('title') || b.title || t('admin.promo.title_ph'), subtitle: field('subtitle') || b.subtitle, cta: field('cta') || b.cta || '…', i18n: undefined }} />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Tabs variant="pill" value={lang} onChange={setLang} items={LANGS.map((l) => ({ value: l.code, label: l.label }))} label={t('common.language')} />
            <Input label={t('admin.promo.eyebrow')} value={field('eyebrow')} onChange={(v) => setField('eyebrow', v)} maxLength={48} optional hint={lang !== 'en' ? t('admin.fallback_en') : undefined} />
            <Input label={t('admin.promo.title')} value={field('title')} onChange={(v) => setField('title', v)} maxLength={70} error={lang === 'en' ? errs.title : null} />
            <Textarea label={t('admin.promo.subtitle')} value={field('subtitle')} onChange={(v) => setField('subtitle', v)} rows={2} maxLength={140} optional />
            <Input label={t('admin.promo.cta')} value={field('cta')} onChange={(v) => setField('cta', v)} maxLength={24} error={lang === 'en' ? errs.cta : null} />
          </div>
          <div className="space-y-4">
            <Input label={t('admin.link')} value={b.link} onChange={(v) => setB({ ...b, link: v.trim() })} error={errs.link} hint={t('admin.promo.link_hint')} />
            <Select label={t('admin.promo.tone')} value={b.tone} onChange={(v) => setB({ ...b, tone: v })} options={(['ink', 'accent', 'sand', 'paper'] as const).map((v) => ({ value: v, label: t(`admin.promo.tone.${v}`) }))} />
            <div>
              <div className="mb-2 text-[13px] font-medium">{t('admin.promo.images')} <span className="text-muted">({b.images.length}/3)</span></div>
              {b.images.length ? (
                <ul className="mb-3 flex gap-2">{b.images.map((src, i) => (
                  <li key={src.slice(0, 64) + i} className="relative size-20 overflow-hidden rounded-[14px] bg-mist">
                    <img src={imageSrc(src)} alt="" className="size-full object-cover" />
                    <button type="button" onClick={() => setB({ ...b, images: b.images.filter((_, k) => k !== i) })} aria-label={t('common.delete')} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white"><IconTrash className="size-3" aria-hidden /></button>
                  </li>))}</ul>
              ) : <p className="mb-3 text-[12px] text-bad">{errs.images}</p>}
              {b.images.length < 3 ? (
                <>
                  <UploadBox compact accept={IMG_TYPES.join(',')} label={t('admin.promo.upload')} hint={t('admin.promo.upload_hint')}
                    onFile={async (f) => { setImgErr(null); try { addImage(await readImage(f, IMG_TYPES, MAX_IMG_BYTES)); } catch (e) { setImgErr((e as Error).message === 'size' ? t('admin.img_too_big', { kb: MAX_IMG_BYTES / 1024 }) : t('admin.img_bad_type')); } }} />
                  {imgErr ? <p className="mt-2 text-[12px] text-bad" role="alert">{imgErr}</p> : null}
                  <div className="mt-3 text-[12px] text-muted">{t('admin.promo.from_catalog')}</div>
                  <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
                    {CATALOG.filter((c) => !b.images.includes(c)).map((src) => (
                      <button key={src} type="button" onClick={() => addImage(src)} className="press size-14 shrink-0 overflow-hidden rounded-[12px] bg-mist ring-ink transition hover:ring-2" aria-label={t('admin.promo.add_image')}>
                        <img src={imageSrc(src)} alt="" loading="lazy" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <Switch label={t('admin.promo.enabled')} checked={b.enabled} onChange={(v) => setB({ ...b, enabled: v })} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function PromoBannersAdmin() {
  const { t, lang } = useI18n();
  const toast = useToast();
  useDbRevision();
  const update = useAction(contentService.update);
  const [edit, setEdit] = useState<PromoBanner | null>(null);
  const [del, setDel] = useState<PromoBanner | null>(null);
  const list = [...(contentService.get().promoBanners || [])].sort((a, b) => a.order - b.order);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted">{t('admin.promo.note')}</p>
        <Button size="sm" icon={IconPlus} onClick={() => setEdit({ ...EMPTY_BANNER })}>{t('admin.promo.new')}</Button>
      </div>
      {list.length ? (
        <ul className="card divide-y divide-line">
          {list.map((b, i) => {
            const title = (lang !== 'en' && b.i18n?.[lang]?.title) || b.title;
            return (
              <li key={b.id} className="flex items-center gap-3 p-3 md:p-4">
                <span className="num w-5 text-faint">{i + 1}</span>
                <div className={cn('size-14 shrink-0 overflow-hidden rounded-[12px] bg-mist', !b.enabled && 'opacity-40')}>{b.images[0] ? <img src={imageSrc(b.images[0])} alt="" className="size-full object-cover" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{title}</div>
                  <div className="truncate text-[12px] text-muted">{b.link} · {t(`admin.promo.tone.${b.tone}`)}</div>
                </div>
                <Reorder i={i} n={list.length} onMove={(dir) => update.run((c) => move(c.promoBanners, b.id, dir))} />
                <Switch hideLabel label={t('admin.promo.enabled')} checked={b.enabled} onChange={(v) => update.run((c) => { const x = c.promoBanners.find((y) => y.id === b.id); if (x) x.enabled = v; })} />
                <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEdit(b)} aria-label={t('common.edit')} />
                <Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(b)} aria-label={t('common.delete')} />
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={t('admin.promo.empty')} />}
      {edit ? <BannerEditor key={edit.id || 'new'} initial={edit} onClose={() => setEdit(null)} /> : null}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel={t('common.delete')} title={t('admin.promo.delete')} body={del?.title} loading={update.pending}
        onConfirm={async () => { const id = del!.id; await update.run((c) => { c.promoBanners = c.promoBanners.filter((x) => x.id !== id); }); setDel(null); toast(t('admin.deleted')); }} />
    </div>
  );
}

// ---------------- Partners ----------------
const KINDS: PartnerKind[] = ['logistics', 'payments', 'manufacturing', 'customs', 'auto', 'insurance', 'marketplace'];
const MARK_IDS = ['hex', 'rails', 'seal', 'dunes', 'gul', 'bridge', 'gate', 'box', 'river', 'shield'];

function PartnerEditor({ initial, onClose }: { initial: Partner; onClose: () => void }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const update = useAction(contentService.update);
  const [p, setP] = useState<Partner>(initial);
  const [err, setErr] = useState<string | null>(null);
  const isNew = !initial.id;
  const errs = {
    name: p.name.trim().length < 2 ? t('admin.partner.name_err') : null,
    url: p.url && !/^https:\/\/[^\s]+\.[^\s]+$/.test(p.url) ? t('admin.partner.url_err') : null,
  };
  const save = async () => {
    // Once an admin edits a placeholder, it is real data: drop the demo flag.
    const clean: Partner = { ...p, name: p.name.trim(), url: p.url?.trim() || undefined, demo: false };
    await update.run((c) => {
      c.partners = c.partners || [];
      if (isNew) c.partners.push({ ...clean, id: uid('pt'), order: c.partners.length });
      else c.partners = c.partners.map((x) => (x.id === clean.id ? clean : x));
    });
    toast(t('admin.saved')); onClose();
  };
  return (
    <Modal open onClose={onClose} title={isNew ? t('admin.partner.new') : t('admin.partner.edit')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={update.pending} disabled={!!errs.name || !!errs.url} onClick={save}>{t('common.save')}</Button></>}>
      <div className="space-y-4">
        <div className="group grid h-24 place-items-center rounded-[22px] bg-mist px-6 text-ink">{p.name.trim() ? <PartnerLogo partner={p} /> : <span className="text-[13px] text-faint">{t('admin.partner.preview')}</span>}</div>
        <Input label={t('admin.partner.name')} value={p.name} onChange={(v) => setP({ ...p, name: v })} maxLength={40} error={errs.name} />
        <Select label={t('admin.partner.kind')} value={p.kind} onChange={(v) => setP({ ...p, kind: v })} options={KINDS.map((k) => ({ value: k, label: tk(partnerKindKey(k)) }))} />
        <Input label={t('admin.partner.url')} value={p.url || ''} onChange={(v) => setP({ ...p, url: v })} optional placeholder="https://" error={errs.url} />
        <div>
          <div className="mb-2 text-[13px] font-medium">{t('admin.partner.logo')}</div>
          {p.logo ? (
            <div className="flex items-center gap-3"><div className="grid h-14 min-w-[120px] place-items-center rounded-[14px] bg-mist px-4"><img src={imageSrc(p.logo)} alt="" className="h-9 max-w-[140px] object-contain" /></div><Button size="sm" variant="secondary" icon={IconTrash} onClick={() => setP({ ...p, logo: undefined })}>{t('admin.partner.remove_logo')}</Button></div>
          ) : (
            <>
              <UploadBox compact accept={LOGO_TYPES.join(',')} label={t('admin.partner.upload')} hint={t('admin.partner.upload_hint')}
                onFile={async (f) => { setErr(null); try { const src = await readImage(f, LOGO_TYPES, MAX_LOGO_BYTES); setP((cur) => ({ ...cur, logo: src })); } catch (e) { setErr((e as Error).message === 'size' ? t('admin.img_too_big', { kb: MAX_LOGO_BYTES / 1024 }) : t('admin.img_bad_type')); } }} />
              {err ? <p className="mt-2 text-[12px] text-bad" role="alert">{err}</p> : null}
              <div className="mt-3 text-[12px] text-muted">{t('admin.partner.or_mark')}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MARK_IDS.map((m) => (
                  <button key={m} type="button" onClick={() => setP({ ...p, mark: m })} aria-pressed={p.mark === m} aria-label={m}
                    className={cn('press grid size-11 place-items-center rounded-[12px] transition', p.mark === m ? 'bg-ink text-on-ink' : 'bg-mist text-ink hover:bg-mist-2')}>
                    <span className="[&>span>span]:hidden"><PartnerLogo partner={{ ...p, logo: undefined, mark: m, name: '' }} className="[&_svg]:size-6" /></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Switch label={t('admin.visible')} checked={p.visible} onChange={(v) => setP({ ...p, visible: v })} />
        <Notice tone="info">{t('admin.partner.consent')}</Notice>
      </div>
    </Modal>
  );
}

export function PartnersAdmin() {
  const { t, tk } = useI18n();
  const toast = useToast();
  useDbRevision();
  const update = useAction(contentService.update);
  const [edit, setEdit] = useState<Partner | null>(null);
  const [del, setDel] = useState<Partner | null>(null);
  const list = [...(contentService.get().partners || [])].sort((a, b) => a.order - b.order);
  const demoCount = list.filter((p) => p.demo).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted">{t('admin.partner.note')}</p>
        <div className="flex gap-2">
          {demoCount ? <Button size="sm" variant="secondary" icon={IconTrash} loading={update.pending} onClick={async () => { await update.run((c) => { c.partners = c.partners.filter((x) => !x.demo); }); toast(t('admin.deleted')); }}>{t('admin.partner.remove_demo', { n: demoCount })}</Button> : null}
          <Button size="sm" icon={IconPlus} onClick={() => setEdit({ id: '', name: '', kind: 'logistics', mark: 'hex', visible: true, order: 0 })}>{t('admin.partner.new')}</Button>
        </div>
      </div>
      {list.length ? (
        <ul className="card divide-y divide-line">
          {list.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 md:flex-nowrap md:p-4">
              <span className="num w-5 text-faint">{i + 1}</span>
              <div className={cn('group grid h-12 w-[200px] shrink-0 place-items-start content-center overflow-hidden text-ink', !p.visible && 'opacity-40')}><PartnerLogo partner={p} className="[&_span]:text-[14px] [&_svg]:size-6" /></div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <Badge>{tk(partnerKindKey(p.kind))}</Badge>
                {p.demo ? <Badge tone="warn">{t('admin.partner.demo')}</Badge> : null}
                {p.url ? <span className="truncate text-[12px] text-muted">{p.url}</span> : null}
              </div>
              <Reorder i={i} n={list.length} onMove={(dir) => update.run((c) => move(c.partners, p.id, dir))} />
              <Switch hideLabel label={t('admin.visible')} checked={p.visible} onChange={(v) => update.run((c) => { const x = c.partners.find((y) => y.id === p.id); if (x) x.visible = v; })} />
              <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEdit(p)} aria-label={t('common.edit')} />
              <Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(p)} aria-label={t('common.delete')} />
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t('admin.partner.empty')} />}
      {edit ? <PartnerEditor key={edit.id || 'new'} initial={edit} onClose={() => setEdit(null)} /> : null}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel={t('common.delete')} title={t('admin.partner.delete')} body={del?.name} loading={update.pending}
        onConfirm={async () => { const id = del!.id; await update.run((c) => { c.partners = c.partners.filter((x) => x.id !== id); }); setDel(null); toast(t('admin.deleted')); }} />
    </div>
  );
}
