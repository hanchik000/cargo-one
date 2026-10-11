import { Component, lazy, StrictMode, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useI18n } from '@/i18n';
import { AuthProvider } from '@/state/auth';
import { Routes, useLocation, navigate } from '@/lib/router';
import type { RouteDef } from '@/lib/router';
import { AppShell, Guard } from '@/components/shell';
import { Button, ToastProvider } from '@/components/ui';
import { readPersisted } from '@/lib/hooks';

type PageComponent = (p: Record<string, never>) => ReactNode;
const L = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazy((): Promise<{ default: PageComponent }> => loader().then((m) => ({ default: m[name] as PageComponent })));

const pages = {
  Home: L(() => import('@/pages/home'), 'HomePage'),
  Onboarding: L(() => import('@/pages/onboarding'), 'OnboardingPage'),
  Login: L(() => import('@/pages/auth'), 'LoginPage'),
  Register: L(() => import('@/pages/auth'), 'RegisterPage'),
  Otp: L(() => import('@/pages/auth'), 'OtpPage'),
  Forgot: L(() => import('@/pages/auth'), 'ForgotPage'),
  Reset: L(() => import('@/pages/auth'), 'ResetPage'),
  Shop: L(() => import('@/pages/shop'), 'ShopPage'),
  TryOn: L(() => import('@/pages/try-on'), 'TryOnPage'),
  Product: L(() => import('@/pages/shop'), 'ProductPage'),
  Compare: L(() => import('@/pages/shop'), 'ComparePage'),
  Cart: L(() => import('@/pages/cart'), 'CartPage'),
  Checkout: L(() => import('@/pages/cart'), 'CheckoutPage'),
  Orders: L(() => import('@/pages/orders'), 'OrdersPage'),
  Order: L(() => import('@/pages/orders'), 'OrderPage'),
  Cargo: L(() => import('@/pages/cargo'), 'CargoPage'),
  Shipment: L(() => import('@/pages/cargo'), 'ShipmentPage'),
  Consolidate: L(() => import('@/pages/cargo'), 'ConsolidatePage'),
  Track: L(() => import('@/pages/cargo'), 'TrackPage'),
  Find: L(() => import('@/pages/find'), 'FindPage'),
  AIBuyer: L(() => import('@/pages/ai-buyer'), 'AIBuyerPage'),
  Business: L(() => import('@/pages/business'), 'BusinessPage'),
  Suppliers: L(() => import('@/pages/suppliers'), 'SuppliersPage'),
  Supplier: L(() => import('@/pages/suppliers'), 'SupplierPage'),
  Pay: L(() => import('@/pages/pay'), 'PayPage'),
  Invoice: L(() => import('@/pages/pay'), 'InvoicePage'),
  Auto: L(() => import('@/pages/auto'), 'AutoPage'),
  Car: L(() => import('@/pages/auto'), 'CarPage'),
  AutoSearch: L(() => import('@/pages/auto'), 'AutoSearchPage'),
  AutoCompare: L(() => import('@/pages/auto'), 'AutoComparePage'),
  Reservation: L(() => import('@/pages/auto'), 'ReservationPage'),
  GroupBuys: L(() => import('@/pages/group-buy'), 'GroupBuysPage'),
  GroupBuy: L(() => import('@/pages/group-buy'), 'GroupBuyPage'),
  Vip: L(() => import('@/pages/vip'), 'VipPage'),
  Promotion: L(() => import('@/pages/vip'), 'PromotionPage'),
  Profile: L(() => import('@/pages/profile'), 'ProfilePage'),
  Notifications: L(() => import('@/pages/notifications'), 'NotificationsPage'),
  Favorites: L(() => import('@/pages/favorites'), 'FavoritesPage'),
  Support: L(() => import('@/pages/support'), 'SupportPage'),
  SupplierPortal: L(() => import('@/pages/supplier-portal'), 'SupplierPortalPage'),
  Admin: L(() => import('@/pages/admin'), 'AdminPage'),
  NotFound: L(() => import('@/pages/misc'), 'NotFoundPage'),
  Forbidden: L(() => import('@/pages/misc'), 'ForbiddenPage'),
};

const P = (C: (p: Record<string, never>) => ReactNode) => () => <C />;
const G = (C: (p: Record<string, never>) => ReactNode, roles?: ('personal' | 'business' | 'admin' | 'supplier')[]) => () => <Guard roles={roles}><C /></Guard>;

const routes: RouteDef[] = [
  { path: '/', element: P(pages.Home) },
  { path: '/onboarding', element: P(pages.Onboarding) },
  { path: '/login', element: P(pages.Login) },
  { path: '/register', element: P(pages.Register) },
  { path: '/otp', element: P(pages.Otp) },
  { path: '/forgot-password', element: P(pages.Forgot) },
  { path: '/reset-password', element: P(pages.Reset) },
  { path: '/shop', element: P(pages.Shop) },
  { path: '/try-on', element: P(pages.TryOn) },
  { path: '/shop/category/:category', element: P(pages.Shop) },
  { path: '/shop/:id', element: P(pages.Product) },
  { path: '/compare', element: P(pages.Compare) },
  { path: '/cart', element: P(pages.Cart) },
  { path: '/checkout', element: G(pages.Checkout) },
  { path: '/orders', element: G(pages.Orders) },
  { path: '/orders/:id', element: G(pages.Order) },
  { path: '/cargo', element: G(pages.Cargo) },
  { path: '/cargo/consolidate', element: G(pages.Consolidate) },
  { path: '/cargo/:id', element: G(pages.Shipment) },
  { path: '/track', element: P(pages.Track) },
  { path: '/find', element: P(pages.Find) },
  { path: '/ai-buyer', element: P(pages.AIBuyer) },
  { path: '/business', element: G(pages.Business, ['business', 'admin']) },
  { path: '/suppliers', element: P(pages.Suppliers) },
  { path: '/suppliers/:id', element: P(pages.Supplier) },
  { path: '/pay', element: G(pages.Pay) },
  { path: '/pay/:id', element: G(pages.Invoice) },
  { path: '/auto', element: P(pages.Auto) },
  { path: '/auto/search', element: P(pages.AutoSearch) },
  { path: '/auto/compare', element: P(pages.AutoCompare) },
  { path: '/auto/reservations/:id', element: G(pages.Reservation) },
  { path: '/auto/:id', element: P(pages.Car) },
  { path: '/group-buy', element: P(pages.GroupBuys) },
  { path: '/group-buy/:id', element: P(pages.GroupBuy) },
  { path: '/vip', element: P(pages.Vip) },
  { path: '/vip/promotion', element: P(pages.Promotion) },
  { path: '/profile', element: G(pages.Profile) },
  { path: '/notifications', element: G(pages.Notifications) },
  { path: '/favorites', element: G(pages.Favorites) },
  { path: '/support', element: P(pages.Support) },
  { path: '/supplier', element: G(pages.SupplierPortal, ['supplier', 'admin']) },
  { path: '/admin', element: G(pages.Admin, ['admin']) },
  { path: '/admin/:section', element: G(pages.Admin, ['admin']) },
  { path: '/forbidden', element: P(pages.Forbidden) },
];

const BARE = ['/try-on', '/onboarding', '/login', '/register', '/otp', '/forgot-password', '/reset-password'];

class ErrorBoundary extends Component<{ children: ReactNode; fallback: (reset: () => void) => ReactNode }, { error: unknown }> {
  constructor(props: { children: ReactNode; fallback: (reset: () => void) => ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { console.error('[CARGO ONE] render error', error); }
  render() { return this.state.error ? this.props.fallback(() => this.setState({ error: null })) : this.props.children; }
}

function CrashScreen({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <h1 className="text-xl font-semibold">{t('error.title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('error.body')}</p>
        <Button className="mt-5" onClick={() => { reset(); navigate('/'); }}>{t('nav.home')}</Button>
      </div>
    </div>
  );
}

function PageFallback() {
  return <div className="space-y-4 pt-2" aria-hidden><div className="skeleton h-10 w-1/3 rounded-[10px]" /><div className="skeleton h-5 w-1/2 rounded-[10px]" /><div className="skeleton h-64 w-full rounded-[14px]" /></div>;
}

function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/' && !readPersisted('onboarded', false)) navigate('/onboarding', { replace: true });
  }, [pathname]);
  const bare = BARE.includes(pathname) || pathname === '/admin' || pathname.startsWith('/admin/');
  return (
    <AppShell bare={bare}>
      <ErrorBoundary key={pathname} fallback={(reset) => <CrashScreen reset={reset} />}>
        <Suspense fallback={<PageFallback />}>
          <Routes routes={routes} fallback={<pages.NotFound />} />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
// Launch animation (src/splash.html): tell it the app has rendered; it leaves after its minimum time.
requestAnimationFrame(() => (window as unknown as { __coSplashReady?: () => void }).__coSplashReady?.());
