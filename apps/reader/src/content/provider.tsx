'use client';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Framework } from 'fumadocs-core/framework';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import StaticSearch from './search';
import { chineseUI } from './ui-translations';
const base = process.env.NEXT_PUBLIC_DSDOCS_BASE_PATH ?? '/docs';

// Next Link applies the configured base path itself.
export const DocumentationLink: NonNullable<Framework['Link']> = ({ href = '', ...props }) => {
  const target =
    base &&
    (href === base ||
      href.startsWith(`${base}/`) ||
      href.startsWith(`${base}#`) ||
      href.startsWith(`${base}?`))
      ? href.slice(base.length) || '/'
      : href;
  return <Link href={target} {...props} />;
};

// Studio stores root-relative workspace assets; static readers use the public copy.
// Keep the native Fumadocs MDX image wrapper, with the provider's standard HTML image adapter.
export const DocumentationImage: NonNullable<Framework['Image']> = ({
  src,
  priority,
  alt,
  ...props
}) => {
  const source =
    typeof src === 'string' ? src : src && ('default' in src ? src.default.src : src.src);
  return (
    <img
      {...props}
      src={source?.startsWith('./assets/') ? `${base}/${source.slice(2)}` : source}
      alt={alt ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
};

export function DocumentationProvider({
  locale,
  translations,
  children,
}: {
  locale: string;
  translations: Record<string, string>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);
  return (
    <RootProvider
      components={{ Link: DocumentationLink, Image: DocumentationImage }}
      i18n={{
        locale,
        locales: [
          { locale: 'zh', name: '简体中文' },
          { locale: 'en', name: 'English' },
        ],
        onLocaleChange(next) {
          try {
            localStorage.setItem('dsdocs-language', next);
          } catch {}
          router.push(translations[next] ?? `/${next}`);
        },
        translations: locale === 'zh' ? chineseUI : {},
      }}
      search={{ SearchDialog: StaticSearch }}
    >
      {children}
    </RootProvider>
  );
}

export function LanguageEntry() {
  const router = useRouter();
  useEffect(() => {
    let language: string | null = null;
    try {
      language = localStorage.getItem('dsdocs-language');
    } catch {}
    const browserLanguage = navigator.languages?.[0] ?? navigator.language;
    const target =
      language === 'zh' || (language !== 'en' && browserLanguage.toLowerCase().startsWith('zh'))
        ? 'zh'
        : 'en';
    router.replace(`/${target}`);
  }, [router]);
  return (
    <main className="mx-auto max-w-xl p-12">
      <h1 className="text-2xl font-semibold">DSdocs</h1>
      <p>正在打开文档 / Opening documentation…</p>
    </main>
  );
}
