import { collectLicenses } from './collect-licenses.mjs';
await collectLicenses(
  'apps/reader',
  new URL('../apps/reader/public/THIRD_PARTY_NOTICES.txt', import.meta.url)
);
