import { useFormDirty } from '@/hooks/useFormDirty';
import { useManagement } from '@/hooks/useManagement';
import { useRequest } from '@/hooks/useRequest';
import { content, type Doc } from '@/services';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { Form } from 'antd';
import { useEffect, useState } from 'react';
import { type SiteSettings } from '../../../../../packages/content/settings.mjs';
type Snapshot = { version: number; data: SiteSettings };
export function useSettingsEditor() {
  const { onSaved } = useManagement();
  const [form] = Form.useForm<SiteSettings>();
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [docs, setDocs] = useState<Doc[]>([]),
    [runtime, setRuntime] = useState<Record<string, string>>({});
  const dirty = useFormDirty(form, snapshot?.data as unknown as Record<string, unknown>);
  async function load() {
    setLoading(true);
    try {
      const [value, workspace, info] = await Promise.all([
        content('/settings'),
        content(),
        content('/runtime'),
      ]);
      setSnapshot(value);
      onSaved(value.data);
      form.setFieldsValue(value.data);
      setDocs(workspace.documents.filter((doc: Doc) => doc.published));
      setRuntime(info);
      setError(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useRequest(load);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  async function save() {
    try {
      const data = await form.validateFields();
      setSaving(true);
      const next = await content('/settings', 'PATCH', { version: snapshot?.version, data });
      setSnapshot(next);
      form.setFieldsValue(next.data);
      onSaved(next.data);
      notifyActionSuccess('save');
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      notifyActionFailed('save', e);
    } finally {
      setSaving(false);
    }
  }
  return { form, snapshot, error, loading, saving, docs, runtime, dirty, load, save };
}
