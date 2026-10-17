import { AppPage } from '@/components/ui';
import { Result } from 'antd';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <AppPage>
      <Result status="404" title={t('app.404.title')} subTitle={t('app.404.subtitle')} />
    </AppPage>
  );
}
