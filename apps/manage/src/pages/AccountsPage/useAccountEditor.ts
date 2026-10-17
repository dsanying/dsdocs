import { request, type Account } from '@/services';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { useState } from 'react';
import { accountChanges } from './accountModel';
export function useAccountEditor(current: Account | null, load: () => Promise<unknown>) {
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const close = () => setEditing(null);
  const finish = async (values: Record<string, unknown>) => {
    if (!current) return false;
    try {
      const self = editing?.id === current.id;
      const data = accountChanges(values, self);
      const result = await request(
        editing?.id
          ? self
            ? '/__dsdocs_accounts/me'
            : `/__dsdocs_accounts/${editing.id}`
          : '/__dsdocs_accounts',
        editing?.id ? 'PATCH' : 'POST',
        data
      );
      if (result.relogin) {
        location.assign('/login');
        return true;
      }
      await load();
      notifyActionSuccess('save');
      return true;
    } catch (e) {
      notifyActionFailed('save', e);
      return false;
    }
  };
  const remove = async (row: Account) => {
    try {
      await request(`/__dsdocs_accounts/${row.id}`, 'DELETE', {});
      await load();
      notifyActionSuccess('delete');
    } catch (e) {
      notifyActionFailed('delete', e);
    }
  };
  return { editing, setEditing, close, finish, remove };
}
