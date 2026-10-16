'use client';
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
/** Official search dialog with the published-content search endpoint. */
export default function DocumentSearch(props: SharedProps) {
  const { locale } = useI18n();
  const search = useFetchSearch({ locale, api: `${base}/search-index.json` });
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
