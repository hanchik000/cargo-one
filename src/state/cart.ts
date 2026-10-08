import { useCallback } from 'react';
import type { Cart, CartItem } from '@/lib/types';
import { usePersisted } from '@/lib/hooks';

const EMPTY: Cart = { items: [], saved: [] };
const same = (a: CartItem, b: { productId: string; variantId?: string }) => a.productId === b.productId && (a.variantId || '') === (b.variantId || '');

export function useCart() {
  const [cart, setCart] = usePersisted<Cart>('cart', EMPTY);
  const add = useCallback((item: CartItem) => setCart((c) => {
    const ex = c.items.find((i) => same(i, item));
    const items = ex ? c.items.map((i) => (same(i, item) ? { ...i, qty: Math.min(999, i.qty + item.qty) } : i)) : [...c.items, item];
    return { ...c, items, saved: c.saved.filter((i) => !same(i, item)) };
  }), [setCart]);
  const setQty = useCallback((item: CartItem, qty: number) => setCart((c) => ({ ...c, items: c.items.map((i) => (same(i, item) ? { ...i, qty: Math.max(1, Math.min(999, qty)) } : i)) })), [setCart]);
  const setVariant = useCallback((item: CartItem, variantId: string) => setCart((c) => ({ ...c, items: c.items.map((i) => (same(i, item) ? { ...i, variantId } : i)) })), [setCart]);
  const remove = useCallback((item: CartItem) => setCart((c) => ({ ...c, items: c.items.filter((i) => !same(i, item)) })), [setCart]);
  const saveForLater = useCallback((item: CartItem) => setCart((c) => ({ items: c.items.filter((i) => !same(i, item)), saved: [...c.saved.filter((i) => !same(i, item)), item] })), [setCart]);
  const moveToCart = useCallback((item: CartItem) => setCart((c) => ({ saved: c.saved.filter((i) => !same(i, item)), items: [...c.items.filter((i) => !same(i, item)), item] })), [setCart]);
  const removeSaved = useCallback((item: CartItem) => setCart((c) => ({ ...c, saved: c.saved.filter((i) => !same(i, item)) })), [setCart]);
  const clear = useCallback(() => setCart((c) => ({ ...c, items: [] })), [setCart]);
  const replace = useCallback((items: CartItem[]) => setCart((c) => ({ ...c, items })), [setCart]);
  const count = cart.items.reduce((s, i) => s + i.qty, 0);
  return { cart, count, add, setQty, setVariant, remove, saveForLater, moveToCart, removeSaved, clear, replace };
}

/** Product comparison list (max 4), shared by Shop, Find and AI Buyer. */
export function useCompare(kind: 'product' | 'car') {
  const [ids, setIds] = usePersisted<string[]>(`compare.${kind}`, []);
  const toggle = useCallback((id: string) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id].slice(-4))), [setIds]);
  const clear = useCallback(() => setIds([]), [setIds]);
  return { ids, toggle, clear, has: (id: string) => ids.includes(id) };
}

export function useRecentlyViewed() {
  const [ids, setIds] = usePersisted<string[]>('recent', []);
  const push = useCallback((id: string) => setIds((l) => [id, ...l.filter((x) => x !== id)].slice(0, 12)), [setIds]);
  return { ids, push };
}
