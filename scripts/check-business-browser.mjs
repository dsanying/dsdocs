import {spawnSync} from 'node:child_process';
for(const script of ['test:browser','test:starter:browser','test:settings:browser','test:layout:browser']) {
 const result=spawnSync('pnpm',['run',script],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status ?? 1);
}
