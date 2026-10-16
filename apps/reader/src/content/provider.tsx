'use client';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Framework } from 'fumadocs-core/framework';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '../../../../packages/content/settings.mjs';
import { PageFooter, type FooterProps } from 'fumadocs-ui/layouts/docs/page';
import { createContext, useContext, useEffect } from 'react';
import DocumentSearch from './search';
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

// Uploaded image dimensions are unknown; use the framework HTML image adapter.
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
      src={source}
      alt={alt ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
};

export function DocumentationProvider({
  locale,
  settings,
  translations,
  children,
}: {
  settings: SiteSettings;
  locale: string;
  translations: Record<string, string>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);
  return (
    <SettingsContext.Provider value={settings}>
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
        theme={{ defaultTheme: settings.theme }}
        search={{ enabled: settings.searchEnabled, SearchDialog: DocumentSearch }}
      >
        {children}
      </RootProvider>
    </SettingsContext.Provider>
  );
}

const SettingsContext = createContext<SiteSettings | null>(null);
export function DocumentationFooter(props: FooterProps) {
  const value = useContext(SettingsContext)!;
  return (
    <>
      <div>{value.showPreviousNext && <PageFooter {...props} />}</div>
      {(value.footerText || value.footerLinks.length > 0) && (
        <footer className="mt-8 border-t pt-4 text-sm text-fd-muted-foreground">
          <p>{value.footerText}</p>
          <nav className="flex flex-wrap gap-4">
            {value.footerLinks.map((link) => (
              <DocumentationLink key={link.url + link.label} href={link.url}>
                {link.label}
              </DocumentationLink>
            ))}
          </nav>
        </footer>
      )}
    </>
  );
}
export function LanguageEntry({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  useEffect(() => {
    let language: string | null = null;
    try {
      language = localStorage.getItem('dsdocs-language');
    } catch {}
    const browserLanguage = navigator.languages?.[0] ?? navigator.language;
    if (language !== 'zh' && language !== 'en' && settings.defaultLanguage !== 'auto')
      language = settings.defaultLanguage;
    const target =
      language === 'zh' || (language !== 'en' && browserLanguage.toLowerCase().startsWith('zh'))
        ? 'zh'
        : 'en';
    router.replace(`/${target}`);
  }, [router, settings.defaultLanguage]);
  return (
    <main className="mx-auto max-w-xl p-12">
      <h1 className="text-2xl font-semibold">{settings.siteName}</h1>
      <p>正在打开文档 / Opening documentation…</p>
    </main>
  );
}
