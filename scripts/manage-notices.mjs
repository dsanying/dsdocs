import { collectLicenses } from './collect-licenses.mjs';
await collectLicenses(
  'apps/manage',
  new URL('../apps/manage/THIRD_PARTY_NOTICES.txt', import.meta.url)
);
