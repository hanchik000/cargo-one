import { useI18n } from '@/i18n';
import { navigate, useQueryParam } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { notificationService } from '@/services/accountServices';
import type { AppNotification, NotificationType } from '@/lib/types';
import { Button, cn, EmptyState, ErrorState, IconButton, PageHeader, SkeletonRows, Tabs } from '@/components/ui';
import { usePageTitle } from '@/components/shell';
import { IconBell, IconCargo, IconCheck, IconContainer, IconCrown, IconDrop, IconFactory, IconGift, IconPackage, IconPackageOk, IconShield, IconTrash, IconUsers, IconWallet } from '@/components/icons';
import type { IconType } from 'react-icons';

const ICON: Record<NotificationType, IconType> = {
  order: IconPackage, payment: IconWallet, supplier: IconFactory, cargo: IconCargo, customs: IconContainer, delivery: IconPackageOk,
  price_drop: IconDrop, group_buy: IconUsers, vip: IconCrown, promotion: IconGift, security: IconShield,
};

export function useNotificationText() {
  const { tk } = useI18n();
  return (n: AppNotification) => {
    if (n.key === 'custom') return { title: String(n.params.title), body: String(n.params.body) };
    const p: Record<string, string | number> = { ...n.params };
    if (p.stage) p.stage = tk(`stage.${p.stage}`);
    if (p.status) p.status = tk(`status.invoice.${p.status}`);
    if (p.step) p.step = tk(`auto.step.${p.step}`);
    return { title: tk(`notif.${n.key}.title`, p), body: tk(`notif.${n.key}.body`, p) };
  };
}

export function NotificationsPage() {
  const { t, tk, rel } = useI18n();
  usePageTitle(t('nav.notifications'));
  const [f, setF] = useQueryParam('filter');
  const filter = (f || 'all') as 'all' | 'unread';
  const q = useQuery(() => notificationService.list(filter), [filter]);
  const all = useAction(notificationService.markAllRead);
  const text = useNotificationText();
  const unread = notificationService.unreadCount();
  const open = async (n: AppNotification) => { await notificationService.markRead(n.id); if (n.link) navigate(n.link); };
  return (
    <div>
      <PageHeader display title={t('nav.notifications')} subtitle={unread ? t('notif.unread_n', { n: unread }) : t('notif.all_read')}
        actions={<Button variant="secondary" icon={IconCheck} loading={all.pending} disabled={!unread} onClick={() => all.run()}>{t('notif.mark_all')}</Button>} />
      <Tabs value={filter} onChange={(v) => setF(v === 'all' ? '' : v)} items={[{ value: 'all', label: t('common.all') }, { value: 'unread', label: t('notif.unread'), count: unread }]} className="mb-6" label={t('nav.notifications')} />
      {q.loading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data?.length ? (
        <EmptyState icon={IconBell} title={filter === 'unread' ? t('notif.empty_unread') : t('notif.empty')} body={t('notif.empty_body')} />
      ) : (
        <ul className="card stagger divide-y divide-line overflow-hidden">
          {q.data.map((n) => {
            const Icon = ICON[n.type];
            const { title, body } = text(n);
            return (
              <li key={n.id} className={cn('group flex items-start gap-4 p-4 transition-colors hover:bg-mist/60 md:px-6 md:py-5', !n.read && 'bg-accent-soft/40')}>
                <span className={cn('relative grid size-11 shrink-0 place-items-center rounded-full', n.read ? 'bg-mist' : 'bg-ink text-on-ink')}><Icon className="size-[18px]" aria-hidden />{!n.read ? <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-accent ring-2 ring-paper" aria-hidden /> : null}</span>
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2"><span className={cn('text-[14px]', !n.read && 'font-semibold')}>{title}</span>{!n.read ? <span className="sr-only">{t('notif.unread')}</span> : null}</div>
                  <p className="mt-0.5 text-[13px] text-muted">{body}</p>
                  <div className="mt-1 text-[11.5px] text-faint">{tk(`notif.type.${n.type}`)} · {rel(n.createdAt)}</div>
                </button>
                <div className="flex shrink-0 gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100 md:focus-within:opacity-100">
                  {!n.read ? <IconButton icon={IconCheck} size="sm" label={t('notif.mark_read')} onClick={() => notificationService.markRead(n.id)} /> : null}
                  <IconButton icon={IconTrash} size="sm" label={t('common.delete')} onClick={() => notificationService.remove(n.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
