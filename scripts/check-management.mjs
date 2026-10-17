import {spawnSync} from 'node:child_process';
const result=spawnSync('pnpm',['-C','apps/manage',process.env.CI ? 'check:ci' : 'check'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
