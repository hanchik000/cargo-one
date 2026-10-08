import { clone, db, network, requireRole } from './db';

export const businessService = {
  async dashboard() {
    const user = requireRole('business', 'admin');
    await network();
    const d = db();
    const orders = d.orders.filter((o) => o.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const invoices = d.invoices.filter((i) => i.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const shipments = d.shipments.filter((s) => s.userId === user.id);
    const quotes = d.quotes.filter((q) => q.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const savedSearches = d.favorites.filter((f) => f.userId === user.id && f.kind === 'search');
    const savedSuppliers = d.favorites.filter((f) => f.userId === user.id && f.kind === 'supplier').map((f) => d.suppliers.find((s) => s.id === f.refId)).filter(Boolean);
    const supplierIds = new Set([...orders.flatMap((o) => o.items.map((i) => i.supplierId))]);
    const usedSuppliers = d.suppliers.filter((s) => supplierIds.has(s.id));
    const month = Date.now() - 30 * 86_400_000;
    const paidOrders = orders.filter((o) => !['cancelled', 'pending_payment'].includes(o.status));
    const paidInvoices = invoices.filter((i) => i.status === 'paid');
    const spend30 = paidOrders.filter((o) => new Date(o.createdAt).getTime() > month).reduce((s, o) => s + o.costs.totalTMT, 0)
      + paidInvoices.filter((i) => new Date(i.createdAt).getTime() > month).reduce((s, i) => s + i.totalTMT, 0);
    const spendTotal = paidOrders.reduce((s, o) => s + o.costs.totalTMT, 0) + paidInvoices.reduce((s, i) => s + i.totalTMT, 0);
    const weeks = Array.from({ length: 8 }, (_, w) => {
      const end = Date.now() - (7 - w) * 7 * 86_400_000; const start = end - 7 * 86_400_000;
      const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t > start && t <= end; };
      return { start: new Date(start).toISOString(), value: paidOrders.filter((o) => inRange(o.createdAt)).reduce((s, o) => s + o.costs.totalTMT, 0) + paidInvoices.filter((i) => inRange(i.createdAt)).reduce((s, i) => s + i.totalTMT, 0) };
    });
    return clone({
      business: d.businesses.find((b) => b.id === user.businessId) || null,
      orders, invoices, shipments, quotes, savedSearches, savedSuppliers, usedSuppliers,
      activeOrders: orders.filter((o) => ['paid', 'processing', 'shipped', 'pending_payment'].includes(o.status)),
      pendingPayments: invoices.filter((i) => ['draft', 'under_review', 'processing'].includes(i.status)),
      activeCargo: shipments.filter((s) => s.stage !== 'delivered'),
      repeatable: orders.filter((o) => o.status === 'delivered' || o.status === 'shipped').slice(0, 5),
      spend30, spendTotal, weeks,
    });
  },
};
