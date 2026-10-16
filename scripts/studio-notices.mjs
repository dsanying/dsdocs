import { collectLicenses } from './collect-licenses.mjs';
await collectLicenses(
  'apps/studio',
  new URL('../apps/studio/THIRD_PARTY_NOTICES.txt', import.meta.url)
);
