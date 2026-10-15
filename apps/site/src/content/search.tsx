'use client';
import { useMemo } from 'react';
import { useFetchSearch } from 'fumadocs-core/search/client';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import {
  SearchDialog,
  SearchDialogOverlay,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogClose,
  SearchDialogList,
  SearchDialogFooter,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
const base = process.env.NEXT_PUBLIC_DSDOCS_BASE_PATH ?? '/docs';
/** Keep official search UI; publication results must not outlive an open dialog. */
export default function PublishedSearch(props: SharedProps) {
  return props.open ? <QueryDialog {...props} /> : null;
}
function QueryDialog(props: SharedProps) {
  const { locale } = useI18n();
  const cache = useMemo(() => new Map(), []);
  const search = useFetchSearch({ locale, api: `${base}/api/v1/search`, cache });
  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
        <SearchDialogFooter />
      </SearchDialogContent>
    </SearchDialog>
  );
}
