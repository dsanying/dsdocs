import { content, upload } from '@/services';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
export type Asset = { id: string; name: string; size: number };
export function useAssetActions(load: () => Promise<unknown>) {
  const remove = async (row: Asset) => {
    try {
      await content(`/assets/${row.id}`, 'DELETE', {});
      await load();
      notifyActionSuccess('delete');
    } catch (e) {
      notifyActionFailed('delete', e);
    }
  };
  async function uploadFile(file: File) {
    try {
      await upload(file);
      await load();
      notifyActionSuccess('upload');
    } catch (error) {
      notifyActionFailed('upload', error);
    }
  }
  return { remove, uploadFile };
}
