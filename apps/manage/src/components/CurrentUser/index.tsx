import { AccountMenu, type AccountMenuProps } from '@/components/ui';
import { useAppStore } from '@/stores/useAppStore';

export function CurrentUser({
  compact = false,
  ...props
}: Omit<AccountMenuProps, 'name' | 'avatar'>) {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!currentUser?.name) return null;
  return (
    <AccountMenu {...props} name={currentUser.name} avatar={currentUser.avatar} compact={compact} />
  );
}
