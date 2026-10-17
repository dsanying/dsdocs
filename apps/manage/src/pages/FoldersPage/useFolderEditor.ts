import { content, type Folder } from '@/services';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { useState } from 'react';
import { folderChanges } from './folderModel';
export function useFolderEditor(load: () => Promise<unknown>) {
  const [editing, setEditing] = useState<Partial<Folder> | null>(null);
  const close = () => setEditing(null);
  const finish = async (values: Record<string, unknown>) => {
    try {
      await content(
        `/folders${editing?.id ? `/${editing.id}` : ''}`,
        editing?.id ? 'PATCH' : 'POST',
        folderChanges(values, editing)
      );
      await load();
      notifyActionSuccess('save');
      return true;
    } catch (e) {
      notifyActionFailed('save', e);
      return false;
    }
  };
  const remove = async (row: Folder) => {
    try {
      await content(`/folders/${row.id}`, 'DELETE', {});
      await load();
      notifyActionSuccess('delete');
    } catch (e) {
      notifyActionFailed('delete', e);
    }
  };
  return { editing, setEditing, close, finish, remove };
}
