import { useI18n } from '@/i18n';
import { Button, EmptyState } from '@/components/ui';
import { CargoLine } from '@/components/commerce';
import { IconBan, IconSearch } from '@/components/icons';
import { usePageTitle } from '@/components/shell';
import { useAuth } from '@/state/auth';

export function NotFoundPage() {
  const { t } = useI18n();
  usePageTitle(t('error.page_not_found'));
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div className="w-full max-w-lg">
        <div className="display text-[96px] leading-none tracking-[-0.04em] md:text-[140px]">4<span className="text-accent-grad">0</span>4</div>
        <div className="mx-auto mt-8 max-w-sm"><CargoLine nodes={[{ label: 'CN' }, { label: '?' }, { label: 'TM' }]} progress={1} /></div>
        <h1 className="mt-8 text-[22px] font-semibold tracking-tight">{t('error.page_not_found')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t('error.page_not_found_body')}</p>
        <div className="mt-7 flex justify-center gap-2"><Button to="/">{t('nav.home')}</Button><Button variant="secondary" icon={IconSearch} to="/track">{t('nav.track')}</Button></div>
      </div>
    </div>
  );
}

export function ForbiddenPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  usePageTitle(t('error.forbidden'));
  return (
    <EmptyState icon={IconBan} title={t('error.forbidden')} body={t('error.forbidden_body')}
      action={<div className="flex gap-2"><Button to="/">{t('nav.home')}</Button>{user ? <Button variant="secondary" onClick={() => { void logout(); }}>{t('auth.switch_account')}</Button> : <Button variant="secondary" to="/login">{t('auth.sign_in')}</Button>}</div>} />
  );
}
