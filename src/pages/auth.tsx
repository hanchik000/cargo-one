import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useLocation } from '@/lib/router';
import { useAction, writePersisted } from '@/lib/hooks';
import { authService } from '@/services/authService';
import { useAuth } from '@/state/auth';
import type { Role, SessionUser } from '@/lib/types';
import { Button, Checkbox, cn, Input, Notice, Tabs } from '@/components/ui';
import { LanguageSwitcher, Logo, usePageTitle } from '@/components/shell';
import { IconArrow, IconBusiness, IconCrown, IconLayers, IconProfile, IconAdmin, IconInfo } from '@/components/icons';
import { asset, IS_STATIC_DEMO } from '@/lib/assets';
import { CargoLine } from '@/components/commerce';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+\d{8,15}$/;
const normPhone = (p: string) => p.replace(/[^\d+]/g, '');

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  const tiles = ['p1', 'p11', 'p7', 'p18', 'p21', 'p27'];
  return (
    <div className="grid min-h-dvh bg-mist lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#111] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="dot-grid-dark absolute inset-0" aria-hidden />
        <div className="relative"><Logo dark animated /></div>
        <div className="relative">
          <div className="grid max-w-[460px] grid-cols-3 gap-3">
            {tiles.map((id, i) => (
              <div key={id} className="animate-float overflow-hidden rounded-[20px] bg-white/5 ring-1 ring-white/10" style={{ animationDelay: `${i * 0.6}s`, animationDuration: `${6 + (i % 3)}s` }}>
                <img src={asset(`img/products/${id}-0.webp`)} alt="" className="img-in aspect-square w-full object-cover" />
              </div>
            ))}
          </div>
          <p className="display mt-10 text-[44px] uppercase xl:text-[56px]">{t('home.hero.title_1')}<br /><span className="text-accent-grad">{t('home.hero.title_2')}</span></p>
          <p className="mt-3 text-[15px] text-white/55">{t('onb.2.find')} · {t('onb.2.buy')} · {t('onb.2.pay')} · {t('onb.2.cargo')}</p>
        </div>
        <div className="relative"><CargoLine dark compact nodes={[{ label: 'CN' }, { label: '' }, { label: '' }, { label: 'TM' }]} progress={2.2} /><div className="mt-2 flex justify-between text-[11px] font-semibold tracking-[0.14em] text-white/40"><span>CN</span><span>TM</span></div></div>
      </aside>
      <main className="flex flex-col px-5 py-6 md:px-12">
        <div className="flex items-center justify-between"><span className="lg:invisible"><Logo /></span><LanguageSwitcher compact /></div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          <h1 className="display text-[28px] uppercase md:text-[34px]">{title}</h1>
          {subtitle ? <p className="mt-2 text-[15px] text-muted">{subtitle}</p> : null}
          <div className="animate-rise mt-8 rounded-[28px] bg-paper p-5 shadow-[var(--shadow-soft)] md:p-7">{children}</div>
          {footer ? <div className="mt-8 text-center text-sm text-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

function useAfterLogin() {
  const { setSession } = useAuth();
  const { query } = useLocation();
  return (user: SessionUser, firstTime = false) => {
    setSession(user);
    if (firstTime) { writePersisted('onboarded', false); navigate('/onboarding', { replace: true }); return; }
    const next = query.get('next');
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : user.role === 'admin' ? '/admin' : user.role === 'supplier' ? '/supplier' : user.role === 'business' ? '/business' : '/';
    navigate(safe, { replace: true });
  };
}

function ErrorText({ code }: { code?: string }) {
  const { tk } = useI18n();
  if (!code) return null;
  return <Notice tone="bad">{tk(`auth.err.${code}`)}</Notice>;
}

function SocialButtons() {
  const { t } = useI18n();
  const after = useAfterLogin();
  const [busy, setBusy] = useState<'' | 'google' | 'apple'>('');
  const [err, setErr] = useState('');
  const go = async (p: 'google' | 'apple') => {
    setBusy(p); setErr('');
    try { const r = await authService.oauth(p); after(r.user); } catch (e) { setErr((e as { code?: string }).code || 'server_error'); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" loading={busy === 'google'} onClick={() => go('google')}>{t('auth.google')}</Button>
        <Button variant="secondary" loading={busy === 'apple'} onClick={() => go('apple')}>{t('auth.apple')}</Button>
      </div>
      <p className="text-center text-[11.5px] text-faint">{t('auth.oauth_mock_note')}</p>
      <ErrorText code={err} />
    </div>
  );
}

function DemoAccounts() {
  const { t } = useI18n();
  const { demoMode } = useAuth();
  const after = useAfterLogin();
  const [busy, setBusy] = useState<Role | ''>('');
  if (!demoMode) return null;
  const roles: { role: Role; icon: typeof IconProfile }[] = [{ role: 'personal', icon: IconProfile }, { role: 'business', icon: IconBusiness }, { role: 'supplier', icon: IconLayers }, { role: 'admin', icon: IconAdmin }];
  return (
    <div className="mt-6 rounded-[22px] border-[1.5px] border-dashed border-mist-3 p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><IconCrown className="size-4 text-accent" aria-hidden />{t('auth.demo_title')}</div>
      <div className="grid grid-cols-2 gap-2">
        {roles.map(({ role, icon: Icon }) => (
          <Button key={role} size="sm" variant="secondary" icon={Icon} loading={busy === role} onClick={async () => { setBusy(role); try { const r = await authService.demo(role); after(r.user); } finally { setBusy(''); } }}>
            {t(`role.${role}`)}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-muted">{t('auth.demo_note')}{IS_STATIC_DEMO ? ` ${t('auth.static_note')}` : ''}</p>
    </div>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  usePageTitle(t('auth.sign_in'), t('meta.login'));
  const after = useAfterLogin();
  const { query } = useLocation();
  const [tab, setTab] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('+993');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const otp = useAction(authService.requestOtp);
  const login = useAction(authService.login);

  const phoneErr = !PHONE_RE.test(normPhone(phone)) ? t('form.invalid_phone') : null;
  const idErr = !identifier.trim() ? t('form.required') : null;
  const pwErr = password.length < 1 ? t('form.required') : null;

  const submitPhone = async () => {
    setTouched(true);
    if (phoneErr) return;
    const r = await otp.run(normPhone(phone), 'login');
    if (r) navigate(`/otp?phone=${encodeURIComponent(normPhone(phone))}&purpose=login${r.devCode ? `&dev=${r.devCode}` : ''}${query.get('next') ? `&next=${encodeURIComponent(query.get('next')!)}` : ''}`);
  };
  const submitEmail = async () => {
    setTouched(true);
    if (idErr || pwErr) return;
    const r = await login.run(identifier, password);
    if (r) after(r.user);
  };

  return (
    <AuthLayout title={t('auth.welcome')} subtitle={t('auth.welcome_sub')} footer={<>{t('auth.no_account')} <Link to={`/register${query.get('next') ? `?next=${encodeURIComponent(query.get('next')!)}` : ''}`} className="font-medium text-ink underline underline-offset-4">{t('auth.create_account')}</Link></>}>
      <Tabs variant="pill" value={tab} onChange={(v) => { setTab(v); setTouched(false); }} items={[{ value: 'phone', label: t('auth.by_phone') }, { value: 'email', label: t('auth.by_email') }]} className="mb-6" label={t('auth.method')} />
      {tab === 'phone' ? (
        <form className="space-y-4" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submitPhone(); }} noValidate>
          <Input label={t('auth.phone')} value={phone} onChange={setPhone} inputMode="tel" autoComplete="tel" error={touched ? phoneErr : null} hint={t('form.phone_hint')} />
          <ErrorText code={(otp.error as { code?: string } | null)?.code} />
          <Button type="submit" full size="lg" loading={otp.pending} iconRight={IconArrow}>{t('auth.send_code')}</Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submitEmail(); }} noValidate>
          <Input label={t('auth.email_or_phone')} value={identifier} onChange={setIdentifier} autoComplete="username" error={touched ? idErr : null} />
          <Input label={t('auth.password')} type="password" value={password} onChange={setPassword} autoComplete="current-password" error={touched ? pwErr : null} />
          <div className="text-right"><Link to="/forgot-password" className="text-[13px] text-muted underline underline-offset-4 hover:text-ink">{t('auth.forgot')}</Link></div>
          <ErrorText code={(login.error as { code?: string } | null)?.code} />
          <Button type="submit" full size="lg" loading={login.pending}>{t('auth.sign_in')}</Button>
        </form>
      )}
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.12em] text-faint"><span className="h-px flex-1 bg-line" />{t('auth.or')}<span className="h-px flex-1 bg-line" /></div>
      <SocialButtons />
      <DemoAccounts />
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  usePageTitle(t('auth.create_account'), t('meta.register'));
  const [type, setType] = useState<'personal' | 'business'>('personal');
  const [f, setF] = useState({ name: '', email: '', phone: '+993', password: '', company: '' });
  const [terms, setTerms] = useState(false);
  const [touched, setTouched] = useState(false);
  const reg = useAction(authService.register);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const errs = {
    name: f.name.trim().length < 2 ? t('form.required') : null,
    email: !EMAIL_RE.test(f.email.trim()) ? t('form.invalid_email') : null,
    phone: !PHONE_RE.test(normPhone(f.phone)) ? t('form.invalid_phone') : null,
    password: f.password.length < 8 ? t('form.password_min') : null,
    company: type === 'business' && f.company.trim().length < 2 ? t('form.required') : null,
    terms: !terms ? t('form.accept_terms') : null,
  };
  const valid = Object.values(errs).every((x) => !x);
  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const r = await reg.run({ name: f.name.trim(), email: f.email.trim(), phone: normPhone(f.phone), password: f.password, accountType: type, companyName: f.company.trim() || undefined });
    if (r) navigate(`/otp?phone=${encodeURIComponent(r.phone)}&purpose=register${r.devCode ? `&dev=${r.devCode}` : ''}`);
  };
  const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(f.password)).length);
  return (
    <AuthLayout title={t('auth.create_account')} subtitle={t('auth.register_sub')} footer={<>{t('auth.have_account')} <Link to="/login" className="font-medium text-ink underline underline-offset-4">{t('auth.sign_in')}</Link></>}>
      <div className="mb-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('auth.account_type')}>
        {(['personal', 'business'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} className={cn('press rounded-[20px] p-4 text-left transition', type === k ? 'bg-ink text-on-ink' : 'bg-mist hover:bg-mist-2')}>
            {k === 'personal' ? <IconProfile className="mb-3 size-5" aria-hidden /> : <IconBusiness className="mb-3 size-5" aria-hidden />}
            <div className="text-sm font-semibold">{t(`role.${k}`)}</div>
            <div className={cn('mt-0.5 text-xs', type === k ? 'opacity-60' : 'text-muted')}>{t(`auth.type_${k}_desc`)}</div>
          </button>
        ))}
      </div>
      <form className="space-y-4" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submit(); }} noValidate>
        <Input label={t('auth.full_name')} value={f.name} onChange={set('name')} autoComplete="name" error={touched ? errs.name : null} />
        {type === 'business' ? <Input label={t('auth.company')} value={f.company} onChange={set('company')} autoComplete="organization" error={touched ? errs.company : null} /> : null}
        <Input label={t('auth.email')} type="email" value={f.email} onChange={set('email')} autoComplete="email" error={touched ? errs.email : null} />
        <Input label={t('auth.phone')} value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" error={touched ? errs.phone : null} hint={t('auth.phone_otp_hint')} />
        <div>
          <Input label={t('auth.password')} type="password" value={f.password} onChange={set('password')} autoComplete="new-password" error={touched ? errs.password : null} hint={t('form.password_min')} />
          <div className="mt-2 flex gap-1" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i < strength ? (strength >= 3 ? 'bg-ok' : 'accent-grad') : 'bg-mist-2')} />)}</div>
        </div>
        <Checkbox label={t('auth.terms')} checked={terms} onChange={setTerms} description={touched && errs.terms ? <span className="text-bad">{errs.terms}</span> : t('auth.terms_desc')} />
        <ErrorText code={(reg.error as { code?: string } | null)?.code} />
        <Button type="submit" full size="lg" loading={reg.pending} iconRight={IconArrow}>{t('auth.continue')}</Button>
      </form>
    </AuthLayout>
  );
}

export function OtpPage() {
  const { t } = useI18n();
  usePageTitle(t('auth.otp_title'));
  const { query } = useLocation();
  const phone = query.get('phone') || '';
  const purpose = (query.get('purpose') === 'register' ? 'register' : 'login') as 'login' | 'register';
  const [dev, setDev] = useState(query.get('dev') || '');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [wait, setWait] = useState(45);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const after = useAfterLogin();
  const verify = useAction(authService.verifyOtp);
  const resend = useAction(authService.requestOtp);
  useEffect(() => { const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const code = digits.join('');
  const submit = async (c = code) => {
    if (c.length !== 6) return;
    const r = await verify.run(phone, c, purpose);
    if (r) after(r.user, purpose === 'register');
    else setDigits(Array(6).fill(''));
  };
  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) { // paste
      const arr = clean.slice(0, 6).split('');
      const next = Array(6).fill('').map((_, k) => arr[k] || '');
      setDigits(next); refs.current[Math.min(5, arr.length)]?.focus();
      if (arr.length === 6) void submit(arr.join(''));
      return;
    }
    const next = [...digits]; next[i] = clean; setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.join('').length === 6) void submit(next.join(''));
  };
  if (!phone) return <AuthLayout title={t('auth.otp_title')}><Notice tone="warn">{t('auth.otp_missing')}</Notice><Button className="mt-4" to="/login">{t('auth.sign_in')}</Button></AuthLayout>;
  return (
    <AuthLayout title={t('auth.otp_title')} subtitle={t('auth.otp_sub', { phone })} footer={<Link to={purpose === 'register' ? '/register' : '/login'} className="underline underline-offset-4">{t('auth.change_number')}</Link>}>
      <form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); void submit(); }}>
        <fieldset className="flex justify-between gap-2" aria-label={t('auth.otp_code')}>
          {digits.map((d, i) => (
            <input key={i} ref={(el: HTMLInputElement | null) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`${t('auth.digit')} ${i + 1}`}
              onChange={(e: { target: HTMLInputElement }) => setAt(i, e.target.value)}
              onKeyDown={(e: { key: string }) => { if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }}
              className={cn('num h-16 w-full rounded-[18px] bg-mist text-center text-[26px] font-semibold outline-none transition', verify.error ? 'ring-2 ring-bad' : 'focus:bg-paper focus:shadow-[0_0_0_2px_var(--color-ink)]')} maxLength={6} />
          ))}
        </fieldset>
        <div className="mt-4 space-y-3">
          <ErrorText code={(verify.error as { code?: string } | null)?.code} />
          {dev ? <Notice tone="neutral" icon={IconInfo}>{t('auth.otp_dev', { code: dev })}</Notice> : null}
          <Button type="submit" full size="lg" loading={verify.pending} disabled={code.length !== 6}>{t('auth.verify')}</Button>
          <Button variant="ghost" full disabled={wait > 0 || resend.pending} onClick={async () => { const r = await resend.run(phone, purpose); if (r) { setWait(45); if (r.devCode) setDev(r.devCode); } }}>
            {wait > 0 ? t('auth.resend_in', { s: wait }) : t('auth.resend')}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function ForgotPage() {
  const { t } = useI18n();
  usePageTitle(t('auth.forgot'));
  const [id, setId] = useState('');
  const [touched, setTouched] = useState(false);
  const forgot = useAction(authService.forgot);
  const err = !id.trim() ? t('form.required') : null;
  return (
    <AuthLayout title={t('auth.forgot')} subtitle={t('auth.forgot_sub')} footer={<Link to="/login" className="underline underline-offset-4">{t('auth.back_to_login')}</Link>}>
      <form className="space-y-4" onSubmit={async (e: { preventDefault(): void }) => {
        e.preventDefault(); setTouched(true); if (err) return;
        const r = await forgot.run(id.trim());
        if (r) navigate(`/reset-password?id=${encodeURIComponent(id.trim())}${r.devCode ? `&dev=${r.devCode}` : ''}`);
      }} noValidate>
        <Input label={t('auth.email_or_phone')} value={id} onChange={setId} autoComplete="username" error={touched ? err : null} />
        <ErrorText code={(forgot.error as { code?: string } | null)?.code} />
        <Button type="submit" full size="lg" loading={forgot.pending}>{t('auth.send_reset')}</Button>
      </form>
    </AuthLayout>
  );
}

export function ResetPage() {
  const { t } = useI18n();
  usePageTitle(t('auth.reset_title'));
  const { query } = useLocation();
  const [id, setId] = useState(query.get('id') || '');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const reset = useAction(authService.reset);
  const errs = { id: !id.trim() ? t('form.required') : null, code: !/^\d{6}$/.test(code) ? t('auth.code_6') : null, pw: pw.length < 8 ? t('form.password_min') : null, pw2: pw !== pw2 ? t('form.password_match') : null };
  if (done) return <AuthLayout title={t('auth.reset_done')} subtitle={t('auth.reset_done_sub')}><Button full size="lg" to="/login">{t('auth.sign_in')}</Button></AuthLayout>;
  return (
    <AuthLayout title={t('auth.reset_title')} subtitle={t('auth.reset_sub')}>
      <form className="space-y-4" onSubmit={async (e: { preventDefault(): void }) => {
        e.preventDefault(); setTouched(true);
        if (Object.values(errs).some(Boolean)) return;
        const r = await reset.run(id.trim(), code, pw);
        if (r) setDone(true);
      }} noValidate>
        <Input label={t('auth.email_or_phone')} value={id} onChange={setId} error={touched ? errs.id : null} />
        <Input label={t('auth.otp_code')} value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" error={touched ? errs.code : null} />
        {query.get('dev') ? <Notice tone="neutral" icon={IconInfo}>{t('auth.otp_dev', { code: query.get('dev')! })}</Notice> : null}
        <Input label={t('auth.new_password')} type="password" value={pw} onChange={setPw} autoComplete="new-password" error={touched ? errs.pw : null} />
        <Input label={t('auth.confirm_password')} type="password" value={pw2} onChange={setPw2} autoComplete="new-password" error={touched ? errs.pw2 : null} />
        <ErrorText code={(reset.error as { code?: string } | null)?.code} />
        <Button type="submit" full size="lg" loading={reset.pending}>{t('auth.reset_action')}</Button>
      </form>
    </AuthLayout>
  );
}
