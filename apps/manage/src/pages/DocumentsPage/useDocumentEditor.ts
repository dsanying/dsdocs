import { designTokens } from '@/design/tokens';
import { useRequest } from '@/hooks/useRequest';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import { Grid } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { content, upload, type Doc, type Folder } from '@/services';
import { useThemeStore } from '@/stores/useThemeStore';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
export function useDocumentEditor(visible: boolean) {
  const { t } = useTranslation();
  const screenMobile = Grid.useBreakpoint().md === false;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const mobile =
    workspaceWidth > 0 ? workspaceWidth < designTokens.breakpoint.narrow : screenMobile;
  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWorkspaceWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [treeOpen, setTreeOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [moreOpen, setMoreOpen] = useState(false);
  const [previousMobile, setPreviousMobile] = useState(mobile);
  if (previousMobile !== mobile) {
    setPreviousMobile(mobile);
    if (!mobile) {
      setTreeOpen(false);
      setMoreOpen(false);
    }
  }
  const theme = useThemeStore((state) => state.mode);
  const [docs, setDocs] = useState<Doc[]>([]),
    [folders, setFolders] = useState<Folder[]>([]),
    [active, setActive] = useState<Doc | null>(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState<'saved' | 'saving' | 'pending' | 'saveFailed'>('saved'),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<{ id: number; createdAt: string }[] | null>(null);
  const draftRef = useRef<Doc | null>(null),
    dirtyRef = useRef(false),
    pending = useRef<Promise<void> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    editorRef = useRef<MDXEditorMethods>(null),
    selection = useRef(0);
  async function load() {
    try {
      const data = await content();
      setDocs(data.documents);
      setFolders(data.folders);
      if (!dirtyRef.current) setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useRequest(load, { manual: !visible, refreshDeps: [visible] });
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || pending.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  async function flush(): Promise<void> {
    clearTimeout(timer.current);
    if (pending.current) {
      await pending.current;
      if (dirtyRef.current) return flush();
      return;
    }
    if (!dirtyRef.current || !draftRef.current) return;
    pending.current = (async () => {
      while (dirtyRef.current && draftRef.current) {
        const snapshot = { ...draftRef.current };
        dirtyRef.current = false;
        setStatus('saving');
        try {
          const result: Doc = await content(`/documents/${snapshot.id}`, 'PATCH', {
            version: snapshot.version,
            title: snapshot.title,
            slug: snapshot.slug,
            locale: snapshot.locale,
            description: snapshot.description,
            folder: snapshot.folder,
            body: snapshot.body,
          });
          draftRef.current = {
            ...draftRef.current,
            version: result.version,
            published: result.published,
          };
          setActive({ ...draftRef.current });
          setStatus(dirtyRef.current ? 'pending' : 'saved');
          setError('');
          setDocs((previous) => previous.map((x) => (x.id === result.id ? result : x)));
        } catch (e) {
          dirtyRef.current = true;
          setStatus('saveFailed');
          setError((e as Error).message);
          throw e;
        }
      }
    })().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }
  function change(patch: Partial<Doc>) {
    if (!draftRef.current) return;
    draftRef.current = { ...draftRef.current, ...patch };
    setActive({ ...draftRef.current });
    dirtyRef.current = true;
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 600);
  }
  async function select(id: string) {
    const generation = ++selection.current;
    try {
      await flush();
      const data = await content();
      setDocs(data.documents);
      if (generation !== selection.current) return;
      const next = data.documents.find((x: Doc) => x.id === id);
      if (!next) throw new Error(t('dsdocs.documentMissingRefresh'));
      draftRef.current = next;
      dirtyRef.current = false;
      setActive(next);
      setTreeOpen(false);
      setStatus('saved');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reloadDraft() {
    const id = draftRef.current?.id;
    if (!id) {
      await load();
      return;
    }
    clearTimeout(timer.current);
    await pending.current?.catch(() => {});
    try {
      const data = await content();
      const next = data.documents.find((item: Doc) => item.id === id);
      if (!next) throw new Error(t('common.vocab.thisDocumentNoLongerExists'));
      if (draftRef.current?.id !== id) return;
      dirtyRef.current = false;
      draftRef.current = next;
      setActive(next);
      setDocs(data.documents);
      editorRef.current?.setMarkdown(next.body);
      setStatus('saved');
      setError('');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function publish() {
    if (busy || !draftRef.current) return;
    const id = draftRef.current.id;
    setBusy(true);
    try {
      await flush();
      if (draftRef.current?.id !== id) throw new Error(t('dsdocs.documentChanged'));
      const result = await content(`/documents/${id}/publish`, 'POST', {
        version: draftRef.current!.version,
      });
      if (draftRef.current?.id === id) {
        draftRef.current = { ...draftRef.current, published: result.published };
        setActive({ ...draftRef.current });
      }
      await load();
      notifyActionSuccess('publish');
    } catch (e) {
      notifyActionFailed('publish', e);
    } finally {
      setBusy(false);
    }
  }

  const showHistory = async () => {
    if (!active) return;
    try {
      await flush();
      setHistory(await content(`/documents/${active.id}/revisions`));
      setMoreOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const unpublishDocument = async () => {
    if (!active) return;
    try {
      await flush();
      await content(`/documents/${active.id}/unpublish`, 'POST', {});
      await load();
      setMoreOpen(false);
      notifyActionSuccess('update');
    } catch (error) {
      notifyActionFailed('update', error);
    }
  };
  const deleteDocument = async () => {
    if (!active) return;
    try {
      await flush();
      await content(`/documents/${active.id}`, 'DELETE', {});
      draftRef.current = null;
      setActive(null);
      await load();
      setMoreOpen(false);
      notifyActionSuccess('delete');
    } catch (error) {
      notifyActionFailed('delete', error);
    }
  };
  const createDocument = async (values: Record<string, unknown>) => {
    try {
      await flush();
      const next = await content('/documents', 'POST', values);
      await load();
      await select(next.id);
      notifyActionSuccess('create');
      return true;
    } catch (e) {
      notifyActionFailed('create', e);
      return false;
    }
  };
  const restoreRevision = async (values: Record<string, unknown>) => {
    try {
      await flush();
      const restored = await content(`/documents/${draftRef.current!.id}/restore`, 'POST', {
        revision: values.revision,
        version: draftRef.current!.version,
      });
      draftRef.current = restored;
      dirtyRef.current = false;
      setActive(restored);
      editorRef.current?.setMarkdown(restored.body);
      setStatus('saved');
      await load();
      notifyActionSuccess('save');
      return true;
    } catch (e) {
      notifyActionFailed('save', e);
      return false;
    }
  };
  function changeBody(body: string) {
    if (body !== draftRef.current?.body) change({ body });
  }
  async function insertAttachment(file: File) {
    try {
      const asset = await upload(file);
      editorRef.current?.insertMarkdown(
        `\n[${asset.name.replace(/[[\]\\]/g, '')}](${asset.src})\n`
      );
      notifyActionSuccess('upload');
    } catch (error) {
      notifyActionFailed('upload', error);
    }
  }
  return {
    changeBody,
    insertAttachment,
    workspaceRef,
    showHistory,
    unpublishDocument,
    deleteDocument,
    createDocument,
    restoreRevision,
    mobile,
    treeOpen,
    setTreeOpen,
    infoOpen,
    setInfoOpen,
    moreOpen,
    setMoreOpen,
    theme,
    docs,
    folders,
    active,
    error,
    setError,
    status,
    creating,
    setCreating,
    busy,
    history,
    setHistory,
    editorRef,
    load,
    flush,
    change,
    select,
    reloadDraft,
    publish,
  };
}
