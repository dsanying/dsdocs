import { LoadingState, QueryErrorAlert } from '@/components/ui';
import { ManagementContext } from '@/hooks/useManagement';
import { useRequest } from '@/hooks/useRequest';
import LoginPage from '@/pages/LoginPage';
import { content, request, type Account } from '@/services';
import { useAppStore } from '@/stores/useAppStore';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
export function AccessLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const query = useRequest(async () => {
    const capabilities = await request('/__dsdocs_accounts/capabilities');
    const current = capabilities.user as Account | null;
    if (current)
      useAppStore.getState().setCurrentUser({ name: current.username, userid: current.id });
    const settings =
      !capabilities.enabled || (current && !current.needsSetup) ? await content('/settings') : null;
    return {
      enabled: capabilities.enabled,
      current,
      siteName: settings?.data.siteName ?? 'DSdocs',
    };
  });
  const data = query.data;
  const [configuredName, setConfiguredName] = useState<string | null>(null);
  const siteName = configuredName ?? data?.siteName ?? 'DSdocs';
  useEffect(() => {
    document.title = siteName + ' · ' + t('common.vocab.administration');
  }, [siteName, t]);
  if (!data)
    return query.error ? (
      <QueryErrorAlert error={query.error} onRetry={() => void query.run()} layout="block" />
    ) : (
      <LoadingState label={t('common.loadingPage')} />
    );
  if (data.enabled && (!data.current || data.current.needsSetup))
    return <LoginPage setup={Boolean(data.current?.needsSetup)} />;
  return (
    <ManagementContext.Provider
      value={{
        current: data.current,
        siteName,
        onSaved: (value) => setConfiguredName(value.siteName),
      }}
    >
      {children}
    </ManagementContext.Provider>
  );
}
