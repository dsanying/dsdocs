import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
const zh = {
  documents: '文档',
  assets: '附件',
  components: '组件',
  users: '用户',
  audit: '审计日志',
  login: '登录',
  logout: '退出登录',
  username: '用户名',
  password: '密码',
  create: '新增',
  edit: '编辑',
  save: '保存',
  cancel: '取消',
  publish: '发布',
  unpublish: '下线',
  remove: '删除',
  export: '导出',
  preview: '预览',
  retry: '重试',
  search: '搜索',
  keyword: '关键词',
  title: '标题',
  description: '摘要',
  path: '页面路径',
  locale: '内容语言',
  group: '目录',
  order: '排序',
  source: 'MDX 源码',
  body: '正文',
  zh: '简体中文',
  en: 'English',
  back: '返回',
  draft: '草稿',
  published: '已发布',
  changed: '有未发布修改',
  history: '历史版本',
  restore: '恢复为草稿',
  addTranslation: '新增翻译',
  viewTranslation: '查看翻译',
  access: '后台管理权限',
  allowed: '允许管理',
  denied: '禁止进入',
  newUser: '新增用户',
  editUser: '编辑用户',
  passwordHint: '使用 12 至 256 个字符。编辑账号时留空可保留原密码。',
  accessHint:
    '所有有效账号拥有相同管理权限。修改权限或密码会注销该账号的全部会话。至少保留一个有效管理账号。',
  pathHint: '使用小写字母、数字、连字符或下划线，以 / 分隔层级。',
  groupHint: '以 / 分隔目录层级，留空放在根目录。',
  sourceHint: '可视化与源码编辑共用 MDX 原文。发布和预览时校验语法及组件。',
  confirm: '确认执行此操作？',
  unpublishHint: '下线后该页面不再通过后台的公开入口提供。已导出的静态站点需要重新构建。',
  deleteHint: '删除后公开入口下线，已保存的历史仍保留。',
  assetDeleteHint: '已被任何历史版本引用的附件不能删除。',
  loading: '正在加载',
  empty: '暂无数据',
  failed: '操作失败',
  succeeded: '操作成功',
  readFailed: '读取失败',
  name: '名称',
  type: '类型',
  size: '字节数',
  actions: '操作',
  upload: '上传',
  copy: '复制',
  properties: '可用属性',
  actor: '执行人',
  operation: '变更动作',
  target: '目标',
  time: '时间',
  theme: '切换主题',
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
  language: '选择语言',
  navigation: '打开导航',
  close: '关闭',
  unsaved: '有未保存的修改，是否离开？',
  leave: '离开',
  stay: '继续编辑',
  notFound: '页面不存在',
  loginRequired: '请登录后台',
  formatHint: '仅支持 PNG、JPEG、WebP 和 PDF，每个文件不超过 5 MiB。',
  allAccess: '账号仅区分是否允许进入后台，所有有效账号均可管理文档、附件和其他账号。',
  exportHint: '导出已发布 MDX 和引用附件，可交给独立文件读者端构建。',
};
const en: Record<keyof typeof zh, string> = {
  documents: 'Documents',
  assets: 'Attachments',
  components: 'Components',
  users: 'Users',
  audit: 'Audit log',
  login: 'Sign in',
  logout: 'Sign out',
  username: 'Username',
  password: 'Password',
  create: 'Create',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  publish: 'Publish',
  unpublish: 'Unpublish',
  remove: 'Delete',
  export: 'Export',
  preview: 'Preview',
  retry: 'Retry',
  search: 'Search',
  keyword: 'Keyword',
  title: 'Title',
  description: 'Description',
  path: 'Page path',
  locale: 'Content language',
  group: 'Directory',
  order: 'Order',
  source: 'MDX source',
  body: 'Content',
  zh: '简体中文',
  en: 'English',
  back: 'Back',
  draft: 'Draft',
  published: 'Published',
  changed: 'Unpublished changes',
  history: 'Revision history',
  restore: 'Restore as draft',
  addTranslation: 'Add translation',
  viewTranslation: 'View translation',
  access: 'Management access',
  allowed: 'Allowed',
  denied: 'Denied',
  newUser: 'Create user',
  editUser: 'Edit user',
  passwordHint: 'Use 12 to 256 characters. Leave empty when editing to keep the current password.',
  accessHint:
    'All enabled accounts have equal access. Changing access or password revokes all sessions for that account. Keep at least one enabled manager.',
  pathHint:
    'Use lowercase letters, numbers, hyphens or underscores. Separate path segments with /.',
  groupHint: 'Separate directory levels with /. Leave empty for the root.',
  sourceHint:
    'Visual and source editing share the MDX text. Preview and publication validate syntax and components.',
  confirm: 'Proceed with this action?',
  unpublishHint:
    'This removes the backend public route. An exported static site must be rebuilt separately.',
  deleteHint: 'The public route is removed. Saved revision history is retained.',
  assetDeleteHint: 'Attachments referenced by any saved revision cannot be deleted.',
  loading: 'Loading',
  empty: 'No data',
  failed: 'Action failed',
  succeeded: 'Action succeeded',
  readFailed: 'Unable to load',
  name: 'Name',
  type: 'Type',
  size: 'Bytes',
  actions: 'Actions',
  upload: 'Upload',
  copy: 'Copy',
  properties: 'Properties',
  actor: 'Actor',
  operation: 'Action',
  target: 'Target',
  time: 'Time',
  theme: 'Theme',
  light: 'Light',
  dark: 'Dark',
  system: 'System',
  language: 'Language',
  navigation: 'Open navigation',
  close: 'Close',
  unsaved: 'Leave with unsaved changes?',
  leave: 'Leave',
  stay: 'Keep editing',
  notFound: 'Page not found',
  loginRequired: 'Sign in to manage documentation',
  formatHint: 'PNG, JPEG, WebP and PDF, up to 5 MiB per file.',
  allAccess:
    'Accounts either have management access or do not. All enabled accounts can manage documents, attachments and other accounts.',
  exportHint: 'Export published MDX and referenced attachments for the independent file reader.',
};
export type TextKey = keyof typeof zh;
type Locale = 'zh' | 'en';
const Context = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TextKey) => string;
}>({ locale: 'zh', setLocale: () => {}, t: (key) => zh[key] });
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('dsdocs-admin-language');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* Storage may be disabled. */
  }
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, set] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);
  function setLocale(value: Locale) {
    set(value);
    try {
      localStorage.setItem('dsdocs-admin-language', value);
    } catch {
      /* Optional preference. */
    }
  }
  return (
    <Context.Provider value={{ locale, setLocale, t: (key) => (locale === 'zh' ? zh : en)[key] }}>
      {children}
    </Context.Provider>
  );
}
export const useText = () => useContext(Context);
