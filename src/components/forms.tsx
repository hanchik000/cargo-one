import { useEffect, useState } from 'react';
import type { Address, PaymentMethod } from '@/lib/types';
import { useI18n } from '@/i18n';
import { useAction, useQuery } from '@/lib/hooks';
import { paymentService, luhnValid, expiryValid, cardBrand, TEST_DECLINE_LAST4 } from '@/services/paymentService';
import { addressService, validateAddress } from '@/services/accountServices';
import { Button, Checkbox, cn, ErrorState, Input, Modal, Notice, Skeleton, Textarea, useToast } from './ui';
import { IconCard, IconCheck, IconPlus, IconWallet, IconBuilding, IconMoney, IconInfo } from './icons';

const METHOD_ICON = { card: IconCard, wallet: IconWallet, partner: IconBuilding, settlement: IconMoney };

export function AddCardModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (m: PaymentMethod) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [holder, setHolder] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [touched, setTouched] = useState(false);
  const { run, pending, error } = useAction(paymentService.addCard);
  useEffect(() => { if (open) { setNumber(''); setExpiry(''); setHolder(''); setTouched(false); } }, [open]);
  const errs = {
    number: !luhnValid(number) ? t('form.invalid_card') : null,
    expiry: !expiryValid(expiry) ? t('form.invalid_expiry') : null,
    holder: holder.trim().length < 3 ? t('form.required') : null,
  };
  const valid = !errs.number && !errs.expiry && !errs.holder;
  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const m = await run({ number, expiry, holder, makeDefault });
    if (m) { toast(t('pay.card_added')); onAdded(m); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('pay.add_card')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={pending} onClick={submit} disabled={touched && !valid}>{t('pay.save_card')}</Button></>}>
      <form className="space-y-4" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submit(); }}>
        <Input label={t('pay.card_number')} value={number} onChange={(v) => setNumber(v.replace(/[^\d ]/g, '').slice(0, 23))} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" error={touched ? errs.number : null} hint={number.length > 4 ? cardBrand(number) : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('pay.expiry')} value={expiry} onChange={(v) => setExpiry(v.replace(/[^\d/]/g, '').replace(/^(\d{2})(\d)/, '$1/$2').slice(0, 5))} placeholder={t('pay.expiry_ph')} autoComplete="cc-exp" inputMode="numeric" error={touched ? errs.expiry : null} />
          <Input label={t('pay.holder')} value={holder} onChange={setHolder} autoComplete="cc-name" error={touched ? errs.holder : null} />
        </div>
        <Checkbox label={t('pay.make_default')} checked={makeDefault} onChange={setMakeDefault} />
        {error ? <Notice tone="bad">{t('form.server_error')}</Notice> : null}
        <Notice tone="neutral" icon={IconInfo}>{t('pay.tokenization_note', { last4: TEST_DECLINE_LAST4 })}</Notice>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Lists the user's payment methods and lets them pick or add one. */
export function PaymentMethodPicker({ value, onChange, allow = ['card', 'wallet', 'partner', 'settlement'] }: { value: string; onChange: (id: string) => void; allow?: PaymentMethod['type'][] }) {
  const { t, tk } = useI18n();
  const q = useQuery(() => paymentService.methods(), []);
  const [adding, setAdding] = useState(false);
  const methods = (q.data || []).filter((m) => allow.includes(m.type));
  useEffect(() => {
    if (!value && methods.length) onChange((methods.find((m) => m.isDefault) || methods[0]).id);
  }, [methods.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.loading) return <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} compact />;
  return (
    <div className="space-y-2" role="radiogroup" aria-label={t('pay.method')}>
      {methods.map((m) => {
        const Icon = METHOD_ICON[m.type];
        const active = m.id === value;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={active} onClick={() => onChange(m.id)}
            className={cn('press flex w-full items-center gap-3 rounded-[12px] bg-paper p-4 text-left transition', active ? 'ring-2 ring-ink' : 'hairline hover:bg-mist/60')}>
            <span className="grid size-10 place-items-center rounded-[10px] bg-mist"><Icon className="size-5" aria-hidden /></span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{m.last4 ? `${m.brand} •••• ${m.last4}` : m.label}</span>
              <span className="block text-xs text-muted">{tk(`pay.type.${m.type}`)}{m.expires ? ` · ${m.expires}` : ''}{m.isDefault ? ` · ${t('common.default')}` : ''}</span>
            </span>
            {active ? <IconCheck className="size-5" aria-hidden /> : null}
          </button>
        );
      })}
      <Button variant="secondary" full icon={IconPlus} onClick={() => setAdding(true)}>{t('pay.add_card')}</Button>
      <AddCardModal open={adding} onClose={() => setAdding(false)} onAdded={(m) => onChange(m.id)} />
    </div>
  );
}

const EMPTY_ADDR: Omit<Address, 'id' | 'userId'> = { name: '', phone: '+993', city: 'Ashgabat', district: '', street: '', building: '', apartment: '', info: '', isDefault: false };

export function AddressForm({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Address | null; onSaved?: (a: Address) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<Omit<Address, 'id' | 'userId'> & { id?: string }>(EMPTY_ADDR);
  const [touched, setTouched] = useState(false);
  const { run, pending, error } = useAction(addressService.save);
  useEffect(() => { if (open) { setForm(initial ? { ...initial } : EMPTY_ADDR); setTouched(false); } }, [open, initial]);
  const errs = validateAddress(form);
  const msg = (k: keyof Address) => (touched && errs[k] ? (errs[k] === 'invalid_phone' ? t('form.invalid_phone') : t('form.required')) : null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setTouched(true);
    if (Object.keys(errs).length) return;
    const a = await run(form);
    if (a) { toast(t('address.saved')); onSaved?.(a); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? t('address.edit') : t('address.new')} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={pending} onClick={submit}>{t('common.save')}</Button></>}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submit(); }}>
        <div className="col-span-2"><Input label={t('address.name')} value={form.name} onChange={set('name')} error={msg('name')} autoComplete="name" /></div>
        <div className="col-span-2"><Input label={t('address.phone')} value={form.phone} onChange={set('phone')} error={msg('phone')} autoComplete="tel" inputMode="tel" hint={t('form.phone_hint')} /></div>
        <Input label={t('address.city')} value={form.city} onChange={set('city')} error={msg('city')} />
        <Input label={t('address.district')} value={form.district} onChange={set('district')} error={msg('district')} />
        <div className="col-span-2"><Input label={t('address.street')} value={form.street} onChange={set('street')} error={msg('street')} autoComplete="address-line1" /></div>
        <Input label={t('address.building')} value={form.building} onChange={set('building')} error={msg('building')} />
        <Input label={t('address.apartment')} value={form.apartment} onChange={set('apartment')} optional />
        <div className="col-span-2"><Textarea label={t('address.info')} value={form.info} onChange={set('info')} rows={2} optional /></div>
        <div className="col-span-2"><Checkbox label={t('address.make_default')} checked={form.isDefault} onChange={(v) => setForm((f) => ({ ...f, isDefault: v }))} /></div>
        {error ? <div className="col-span-2"><Notice tone="bad">{t('form.server_error')}</Notice></div> : null}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function addressLine(a: Address) {
  return `${a.city}, ${a.district}, ${a.street} ${a.building}${a.apartment ? ', ' + a.apartment : ''}`;
}
