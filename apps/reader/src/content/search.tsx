'use client';
import { useFlexsearchStatic } from 'fumadocs-core/search/client/flexsearch-static';
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
/** Official static client and dialog parts; no backend request or custom reader styling. */
export default function StaticSearch(props: SharedProps) {
  const { locale } = useI18n();
  const search = useFlexsearchStatic({ locale, from: `${base}/search-index.json` });
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
