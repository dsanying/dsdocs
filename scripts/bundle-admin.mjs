import { collectLicenses } from './collect-licenses.mjs';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'apps/site/public/admin');
await mkdir(output, { recursive: true });
await rm(output, { recursive: true, force: true });
await cp(path.join(root, 'apps/admin/dist'), output, { recursive: true });

await collectLicenses('apps/admin', path.join(output, 'THIRD_PARTY_NOTICES.txt'));
