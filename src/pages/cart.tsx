import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate } from '@/lib/router';
import { useDbRevision, usePersisted, useQuery } from '@/lib/hooks';
import { useCart } from '@/state/cart';
import { useAuth } from '@/state/auth';
import { db } from '@/services/db';
import { addressService } from '@/services/accountServices';
import { orderService } from '@/services/orderService';
import { estimateCart, variantPrice, deliveryWindow } from '@/lib/pricing';
import type { Address, CartItem, Order, Payment, Product } from '@/lib/types';
import { Button, cn, EmptyState, ErrorState, IconButton, KV, MiniSelect, Notice, PageHeader, QtyStepper, SectionTitle, Skeleton, Stepper, useToast } from '@/components/ui';
import { CargoLine, PriceBlock, useUserVip } from '@/components/commerce';
import { ProductVisual } from '@/components/visuals';
import { AddressForm, PaymentMethodPicker, addressLine } from '@/components/forms';
import { usePageTitle } from '@/components/shell';
import { IconArrow, IconCart, IconCheck, IconEdit, IconPlane, IconPlus, IconTrain, IconTrash, IconBookmark, IconLock, IconAlert } from '@/components/icons';

function useProductsMap() {
  useDbRevision();
  return new Map(db().products.map((p) => [p.id, p]));
}

function CartLine({ item, product, saved }: { item: CartItem; product: Product; saved?: boolean }) {
  const { t, money } = useI18n();
  const cart = useCart();
  const unit = variantPrice(product, item.variantId);
  return (
    <li className="card group flex gap-4 p-3 pr-4 md:gap-5">
      <Link to={`/shop/${product.id}`} className="shrink-0"><ProductVisual icon={product.icon} image={product.images[0]} className="size-24 rounded-[18px] md:size-32" /></Link>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/shop/${product.id}`} className="line-clamp-2 text-[15px] font-semibold leading-snug hover:underline">{product.title}</Link>
            <div className="num mt-1 text-[12px] text-muted">{money(unit, 'CNY')} × {item.qty}{product.variants.length > 1 ? ` · ${product.variants.find((v) => v.id === item.variantId)?.name || product.variants[0].name}` : ''}</div>
          </div>
          <span className="price shrink-0 text-[17px]">{money(unit * item.qty, 'CNY')}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!saved ? (
            <>
              <QtyStepper value={item.qty} onChange={(q) => cart.setQty(item, q)} min={product.moq} max={product.stock} label={t('product.quantity')} />
              {product.variants.length > 1 ? <MiniSelect label={t('product.variant')} value={item.variantId || product.variants[0].id} onChange={(v) => cart.setVariant(item, v)} options={product.variants.map((v) => ({ value: v.id, label: v.name }))} /> : null}
              <span className="ml-auto flex gap-1">
                <IconButton icon={IconBookmark} label={t('cart.save_later')} onClick={() => cart.saveForLater(item)} size="sm" />
                <IconButton icon={IconTrash} label={t('common.remove')} onClick={() => cart.remove(item)} size="sm" />
              </span>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" icon={IconCart} onClick={() => cart.moveToCart(item)}>{t('cart.move_to_cart')}</Button>
              <IconButton icon={IconTrash} label={t('common.remove')} onClick={() => cart.removeSaved(item)} size="sm" />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function CartPage() {
  const { t, money } = useI18n();
  usePageTitle(t('nav.cart'));
  const cart = useCart();
  const { user } = useAuth();
  const products = useProductsMap();
  const vip = useUserVip();
  const items = cart.cart.items.filter((i) => products.get(i.productId));
  const saved = cart.cart.saved.filter((i) => products.get(i.productId));
  const est = estimateCart(items, products, db().content.settings, { vip });
  const checkout = () => navigate(user ? '/checkout' : '/login?next=/checkout');
  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader title={t('nav.cart')} subtitle={items.length ? t('cart.items_n', { n: cart.count }) : undefined} />
      {!items.length && !saved.length ? (
        <EmptyState icon={IconCart} title={t('cart.empty')} body={t('cart.empty_body')} action={<div className="flex gap-2"><Button to="/shop">{t('nav.shop')}</Button><Button to="/find" variant="secondary">{t('nav.find')}</Button></div>} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            {items.length ? <ul className="stagger space-y-3">{items.map((i) => <CartLine key={i.productId + (i.variantId || '')} item={i} product={products.get(i.productId)!} />)}</ul>
              : <p className="py-10 text-center text-sm text-muted">{t('cart.empty')}</p>}
            {saved.length ? (
              <section className="mt-10">
                <SectionTitle title={t('cart.saved')} />
                <ul className="space-y-3">{saved.map((i) => <CartLine key={i.productId + (i.variantId || '')} item={i} product={products.get(i.productId)!} saved />)}</ul>
              </section>
            ) : null}
          </div>
          {items.length ? (
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <PriceBlock costs={est} title={t('cart.summary')} />
              {vip ? <p className="mt-3 px-1 text-[12px] font-medium text-ok">{t('cart.vip_fee')}</p> : <Link to="/vip" className="mt-3 flex items-center justify-between gap-2 rounded-[18px] bg-[#111] px-4 py-3 text-[12.5px] text-white/80 hover:text-white"><span>{t('cart.vip_upsell')}</span><IconArrow className="size-4 shrink-0 text-accent-2" aria-hidden /></Link>}
              <Button size="lg" full className="mt-4 hidden lg:flex" iconRight={IconArrow} onClick={checkout}>{t('cart.checkout')}</Button>
            </aside>
          ) : null}
        </div>
      )}
      {items.length ? (
        <div className="fixed inset-x-3 bottom-[96px] z-30 mx-auto flex max-w-[460px] items-center gap-3 rounded-[26px] bg-paper p-2 pl-5 shadow-[var(--shadow-float)] lg:hidden">
          <div className="min-w-0 flex-1"><div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{t('price.total_est')}</div><div className="price truncate text-[17px]">{money(est.totalTMT, 'TMT')}</div></div>
          <Button iconRight={IconArrow} onClick={checkout}>{t('cart.checkout')}</Button>
        </div>
      ) : null}
    </div>
  );
}

type Step = 0 | 1 | 2 | 3;

export function CheckoutPage() {
  const { t, tk, money } = useI18n();
  usePageTitle(t('checkout.title'));
  const cart = useCart();
  const toast = useToast();
  const products = useProductsMap();
  const vip = useUserVip();
  const [step, setStep] = useState<Step>(0);
  const [addressId, setAddressId] = usePersisted<string>('checkout.address', '');
  const [delivery, setDelivery] = useState<'standard' | 'express'>('standard');
  const [methodId, setMethodId] = useState('');
  const [addrForm, setAddrForm] = useState<{ open: boolean; edit: Address | null }>({ open: false, edit: null });
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ order: Order; payment: Payment } | null>(null);
  const [err, setErr] = useState('');
  const addresses = useQuery(() => addressService.list(), []);
  const items = cart.cart.items.filter((i) => products.get(i.productId));
  const est = useMemo(() => estimateCart(items, products, db().content.settings, { vip, delivery }), [items, products, vip, delivery]);
  const maxLead = Math.max(0, ...items.map((i) => products.get(i.productId)!.leadDays));

  useEffect(() => {
    const list = addresses.data || [];
    if (list.length && !list.some((a) => a.id === addressId)) setAddressId((list.find((a) => a.isDefault) || list[0]).id);
  }, [addresses.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length && !result) return <EmptyState icon={IconCart} title={t('cart.empty')} body={t('checkout.empty_body')} action={<Button to="/shop">{t('nav.shop')}</Button>} />;
  const address = addresses.data?.find((a) => a.id === addressId);
  const steps = [t('checkout.step.address'), t('checkout.step.delivery'), t('checkout.step.payment'), t('checkout.step.review'), t('checkout.step.confirm')];
  const [smin, smax] = deliveryWindow({ leadDays: maxLead }, 'standard');
  const [emin, emax] = deliveryWindow({ leadDays: maxLead }, 'express');

  const place = async () => {
    setPlacing(true); setErr('');
    try {
      const r = result && result.payment.status === 'failed' ? await orderService.pay(result.order.id, methodId) : await orderService.checkout({ items, addressId, delivery, methodId });
      setResult(r);
      if (r.payment.status === 'succeeded') {
        cart.clear();
        toast(t('checkout.success'));
        navigate(`/orders/${r.order.id}?placed=1`, { replace: true });
      } else setStep(2);
    } catch (e) { setErr((e as { code?: string }).code || 'server_error'); }
    finally { setPlacing(false); }
  };

  const next = () => setStep((s) => Math.min(3, s + 1) as Step);
  const canNext = step === 0 ? !!address : step === 2 ? !!methodId : true;

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader title={t('checkout.title')} back={{ to: '/cart', label: t('nav.cart') }} />
      <div className="card mb-8 px-5 py-5 md:px-8"><Stepper steps={steps} current={step} /></div>
      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <section className="animate-rise min-w-0" key={step}>
          {step === 0 ? (
            <div>
              <SectionTitle title={t('checkout.step.address')} action={<Button size="sm" variant="secondary" icon={IconPlus} onClick={() => setAddrForm({ open: true, edit: null })}>{t('address.new')}</Button>} />
              {addresses.loading ? <Skeleton className="h-24" /> : addresses.error ? <ErrorState error={addresses.error} onRetry={addresses.reload} compact /> : !addresses.data?.length ? (
                <EmptyState title={t('address.empty')} body={t('address.empty_body')} action={<Button icon={IconPlus} onClick={() => setAddrForm({ open: true, edit: null })}>{t('address.new')}</Button>} />
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label={t('checkout.step.address')}>
                  {addresses.data.map((a) => (
                    <div key={a.id} className={cn('flex items-start gap-3 rounded-[22px] bg-paper p-5 transition-all duration-300', a.id === addressId ? 'shadow-[0_0_0_2px_var(--color-ink),var(--shadow-lift)]' : 'shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)]')}>
                      <button type="button" role="radio" aria-checked={a.id === addressId} onClick={() => setAddressId(a.id)} className="flex flex-1 items-start gap-3 text-left">
                        <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full transition-colors', a.id === addressId ? 'bg-ink text-on-ink' : 'ring-2 ring-mist-3')}>{a.id === addressId ? <IconCheck className="size-3" aria-hidden /> : null}</span>
                        <span><span className="block font-medium">{a.name} · <span className="num">{a.phone}</span></span><span className="block text-sm text-muted">{addressLine(a)}</span>{a.info ? <span className="block text-xs text-faint">{a.info}</span> : null}</span>
                      </button>
                      <Button variant="ghost" size="sm" icon={IconEdit} onClick={() => setAddrForm({ open: true, edit: a })} aria-label={t('common.edit')} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step === 1 ? (
            <div>
              <SectionTitle title={t('checkout.step.delivery')} />
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('checkout.step.delivery')}>
                {([['standard', IconTrain, smin, smax], ['express', IconPlane, emin, emax]] as const).map(([k, Icon, a, b]) => (
                  <button key={k} type="button" role="radio" aria-checked={delivery === k} onClick={() => setDelivery(k)} className={cn('press relative overflow-hidden rounded-[24px] p-6 text-left transition-all duration-300', delivery === k ? 'bg-[#111] text-white shadow-[var(--shadow-lift)]' : 'bg-paper shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)]')}>
                    {delivery === k ? <div className="dot-grid-dark absolute inset-0" aria-hidden /> : null}
                    <div className="relative flex items-center justify-between"><span className={cn('grid size-12 place-items-center rounded-full', delivery === k ? 'accent-grad' : 'bg-mist')}><Icon className="size-5" aria-hidden /></span>{delivery === k ? <IconCheck className="size-5" aria-hidden /> : null}</div>
                    <div className="relative mt-8 text-[17px] font-semibold">{t(`delivery.${k}`)}</div>
                    <div className={cn('relative text-sm', delivery === k ? 'text-white/60' : 'text-muted')}>{t(`delivery.${k}_desc`)}</div>
                    <div className="num relative mt-5 text-[22px] font-semibold tracking-tight">{t('delivery.days', { min: a, max: b })}</div>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-[22px] bg-paper p-5 shadow-[var(--shadow-soft)]"><CargoLine nodes={[{ label: t('line.china') }, { label: 'Yiwu' }, { label: delivery === 'express' ? t('product.air') : t('product.rail') }, { label: address?.city || 'Ashgabat' }]} progress={0} animate={false} /></div>
              <div className="mt-3"><Notice tone="neutral">{t('checkout.consolidation_note')}</Notice></div>
            </div>
          ) : step === 2 ? (
            <div>
              <SectionTitle title={t('checkout.step.payment')} />
              {result?.payment.status === 'failed' ? <div className="mb-4"><Notice tone="bad" icon={IconAlert} title={t('checkout.payment_failed')}>{result.payment.failureReason} {t('checkout.payment_failed_body', { number: result.order.number })}</Notice></div> : null}
              <PaymentMethodPicker value={methodId} onChange={setMethodId} allow={['card', 'wallet', 'partner']} />
              <p className="mt-4 flex items-center gap-2 text-[12px] text-muted"><IconLock className="size-3.5" aria-hidden />{t('checkout.secure_note')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <SectionTitle title={t('checkout.step.review')} />
              <div className="card divide-y divide-line px-5">
                {items.map((i) => { const p = products.get(i.productId)!; return (
                  <div key={i.productId + (i.variantId || '')} className="flex items-center gap-3 py-3">
                    <ProductVisual icon={p.icon} image={p.images[0]} className="size-14 rounded-[14px]" />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.title}</div><div className="text-xs text-muted">{p.variants.find((v) => v.id === i.variantId)?.name} · ×{i.qty}</div></div>
                    <span className="num text-sm">{money(variantPrice(p, i.variantId) * i.qty, 'CNY')}</span>
                  </div>
                ); })}
              </div>
              <div className="card p-5">
                <KV k={t('checkout.step.address')} v={address ? addressLine(address) : '—'} mono={false} />
                <KV k={t('checkout.step.delivery')} v={t(`delivery.${delivery}`)} mono={false} />
                <KV k={t('checkout.step.payment')} v={methodId ? tk(`pay.selected`) : '—'} mono={false} />
              </div>
              <Notice tone="neutral">{t('checkout.terms_note')}</Notice>
            </div>
          )}
          {err ? <div className="mt-4"><Notice tone="bad">{tk(`err.${err}`)}</Notice></div> : null}
          <div className="mt-8 hidden gap-2 lg:flex">
            {step > 0 ? <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>{t('common.back')}</Button> : null}
            {step < 3 ? <Button onClick={next} disabled={!canNext} iconRight={IconArrow}>{t('common.continue')}</Button>
              : <Button size="lg" variant="metal" loading={placing} onClick={place} icon={IconLock}>{t('checkout.confirm', { amount: money(est.totalTMT, 'TMT') })}</Button>}
          </div>
        </section>
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start"><PriceBlock costs={est} title={t('cart.summary')} /><p className="flex items-center gap-2 px-1 text-[12px] text-muted"><IconLock className="size-3.5" aria-hidden />{t('checkout.secure_note')}</p></aside>
      </div>
      <div className="fixed inset-x-3 bottom-[96px] z-30 mx-auto flex max-w-[460px] gap-2 rounded-[26px] bg-paper p-2 shadow-[var(--shadow-float)] lg:hidden">
        {step > 0 ? <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>{t('common.back')}</Button> : null}
        {step < 3 ? <Button full onClick={next} disabled={!canNext} iconRight={IconArrow}>{t('common.continue')}</Button>
          : <Button full variant="metal" loading={placing} onClick={place}>{t('checkout.confirm_short')}</Button>}
      </div>
      <AddressForm open={addrForm.open} initial={addrForm.edit} onClose={() => setAddrForm({ open: false, edit: null })} onSaved={(a) => setAddressId(a.id)} />
    </div>
  );
}
