import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import '@fumadocs-editor/ui/styles.css';
import './style.css';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  EditorThemeProvider,
  FileTree,
  MdxEditor,
  fumadocsUiComponents,
  admonitionSpec,
  filesFenceSpecs,
  useWorkspace,
  useEditorTheme,
  type MediaProvider,
} from '@fumadocs-editor/ui';
import { ASSET_ENDPOINT, UPLOAD_ENDPOINT, type TreeNode } from '@fumadocs-editor/core/sync';

async function request(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(`/__dsdocs_accounts${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('登录已失效，请刷新页面重新登录。');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '请求失败');
  return result;
}
const media: MediaProvider = {
  async upload(file) {
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'x-filename': encodeURIComponent(file.name) },
      body: file,
    });
    if (!response.ok) throw new Error('图片上传失败');
    return (await response.json()).src;
  },
  resolve: (src) =>
    /^(?:[a-z]+:|\/)/i.test(src) ? src : `${ASSET_ENDPOINT}/${src.replace(/^\.\//, '')}`,
};
function flatten(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'file' ? [node.path] : node.type === 'folder' ? flatten(node.children) : []
  );
}
function Documents() {
  const workspace = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState('synced');
  const ref = useRef<HTMLDivElement>(null);
  const [sidebar, setSidebar] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const paths = workspace.tree ? flatten(workspace.tree.nodes) : [];
  const active = selected && paths.includes(selected) ? selected : (paths[0] ?? null);
  useEffect(() => {
    if (!['dirty', 'saving', 'conflict', 'offline'].includes(status)) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [status]);
  return (
    <div className={`documents ${sidebar ? 'with-sidebar' : ''}`} ref={ref}>
      <aside aria-label="文档目录" hidden={!sidebar}>
        {workspace.tree ? (
          <FileTree
            tree={workspace.tree}
            run={workspace.run}
            active={active}
            onSelect={setSelected}
            container={ref}
          />
        ) : (
          <p role="status">{workspace.status === 'offline' ? '编辑服务不可用' : '正在连接文档…'}</p>
        )}
      </aside>
      <section className="editor" aria-label="编辑文档">
        {active ? (
          <>
            <div className="document-status">
              <button
                aria-label="切换目录"
                aria-expanded={sidebar}
                onClick={() => setSidebar(!sidebar)}
              >
                目录
              </button>
              <span>{active}</span>
              <span role="status">
                {status === 'synced'
                  ? '已保存'
                  : status === 'dirty'
                    ? '待保存'
                    : status === 'saving'
                      ? '保存中'
                      : status === 'offline'
                        ? '连接中断'
                        : status === 'conflict'
                          ? '需要处理冲突'
                          : status}
              </span>
            </div>
            <MdxEditor
              variant="page"
              sync={{ path: active, onStatus: setStatus }}
              syntax={{ math: true }}
              components={[...fumadocsUiComponents, admonitionSpec, ...filesFenceSpecs]}
              media={media}
            />
          </>
        ) : (
          <p>从目录创建或选择文档。</p>
        )}
      </section>
    </div>
  );
}
type Account = { id: number; username: string; name: string; email: string; active: boolean };
function Accounts({ notify }: { notify: (text: string) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<'create' | Account | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filtered = accounts.filter((user) =>
    `${user.username} ${user.name} ${user.email}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  async function load() {
    setLoading(true);
    setError('');
    try {
      setAccounts(await request(''));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function open(value: 'create' | Account) {
    setMode(value);
    dialog.current?.showModal();
  }
  async function changeActive(user: Account) {
    setBusy(true);
    try {
      await request(`/${user.id}`, 'PATCH', { active: !user.active });
      notify(user.active ? '账号已停用' : '账号已启用');
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === 'create') await request('', 'POST', Object.fromEntries(data));
      else if (mode)
        await request(`/${mode.id}/password`, 'POST', { password: data.get('password') });
      notify(mode === 'create' ? '账号已创建' : '密码已更新');
      dialog.current?.close();
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-page">
      <header>
        <h1>账号管理</h1>
        <button onClick={() => open('create')} disabled={busy}>
          创建账号
        </button>
      </header>
      <p>管理 DSdocs 本地编辑账号。认证、密码和会话由账号服务维护。</p>
      <label className="account-search">
        搜索账号
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>
      {error ? (
        <div role="alert">
          {error}
          <button onClick={() => void load()}>重试</button>
        </div>
      ) : loading ? (
        <p role="status">正在加载…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>姓名</th>
                <th>邮箱</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.name}</td>
                  <td>{user.email || '—'}</td>
                  <td>{user.active ? '已启用' : '已停用'}</td>
                  <td>
                    <button disabled={busy} onClick={() => open(user)}>
                      重置密码
                    </button>
                    <button
                      disabled={busy}
                      className={user.active ? 'danger' : ''}
                      onClick={() => void changeActive(user)}
                    >
                      {user.active ? '停用' : '启用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p>{query ? '没有匹配的账号。' : '暂无 DSdocs 本地账号。'}</p>}
          <nav className="pagination" aria-label="账号分页">
            <span>
              共 {filtered.length} 个账号，第 {currentPage}/{pageCount} 页
            </span>
            <label>
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              上一页
            </button>
            <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
              下一页
            </button>
          </nav>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="account-dialog-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => {
          dialog.current?.querySelector('form')?.reset();
          setMode(null);
        }}
      >
        <form onSubmit={save}>
          <h2 id="account-dialog-title">{mode === 'create' ? '创建账号' : '重置密码'}</h2>
          {mode === 'create' && (
            <>
              <label>
                用户名
                <input name="username" required pattern="[a-zA-Z0-9._-]{3,64}" autoComplete="off" />
              </label>
              <label>
                姓名
                <input name="name" required maxLength={150} />
              </label>
              <label>
                邮箱
                <input name="email" type="email" maxLength={254} />
              </label>
            </>
          )}
          <label>
            密码
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <footer>
            <button type="button" disabled={busy} onClick={() => dialog.current?.close()}>
              取消
            </button>
            <button disabled={busy} type="submit">
              {busy ? '保存中…' : '保存'}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}
function ThemeButton() {
  const { resolvedTheme, setTheme } = useEditorTheme();
  return (
    <button
      aria-label="切换主题"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? '浅色' : '深色'}
    </button>
  );
}
function App() {
  const { resolvedTheme } = useEditorTheme();
  const [page, setPage] = useState('documents'),
    [identity, setIdentity] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    request('/capabilities')
      .then((c) => setIdentity(c.enabled))
      .catch(() => setIdentity(false));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  return (
    <div className="shell" style={{ colorScheme: resolvedTheme }}>
      <header className="shell-header">
        <strong>DSdocs</strong>
        <nav aria-label="管理导航">
          <button
            aria-current={page === 'documents' ? 'page' : undefined}
            onClick={() => setPage('documents')}
          >
            文档
          </button>
          {identity && (
            <button
              aria-current={page === 'accounts' ? 'page' : undefined}
              onClick={() => setPage('accounts')}
            >
              账号
            </button>
          )}
        </nav>
        {identity && <a href="/outpost.goauthentik.io/sign_out">退出登录</a>}
        <ThemeButton />
      </header>
      {/* Keep the editor mounted so switching panels cannot discard a pending save. */}
      <div hidden={page !== 'documents'}>
        <Documents />
      </div>
      {page === 'accounts' && <Accounts notify={setNotice} />}
      <div className="notice" role="status">
        {notice}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorThemeProvider defaultTheme="system">
      <App />
    </EditorThemeProvider>
  </StrictMode>
);
