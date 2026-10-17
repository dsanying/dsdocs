import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingState } from '@/components/ui';

export const PageFallback: FC = () => {
  const { t } = useTranslation();
  return <LoadingState variant="page" label={t('common.loadingPage')} />;
};
