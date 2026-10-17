import { spawn } from 'node:child_process';

const modes = {
  'ui-dev-forms': {env:{FRONTEND_UI_DEV:'1',FRONTEND_UI_TEST:'1'},command:['node_modules/@playwright/test/cli.js','test','tests/ui/action-footer-regressions.spec.ts','tests/ui/form-submit-regressions.spec.ts']},
  'build-ui': { env: { FRONTEND_UI_TEST: '1' }, command: ['node_modules/vite/bin/vite.js', 'build', '--outDir', '.playwright/app'] },
  'ui': { env: {}, command: ['node_modules/@playwright/test/cli.js', 'test', '--project=chromium'] },
  'ui-full': { env: { FRONTEND_UI_FULL: '1' }, command: ['node_modules/@playwright/test/cli.js', 'test'] },
};
const mode = modes[process.argv[2]];
if (!mode) throw new Error(`Unknown runtime mode: ${process.argv[2]}`);
const child = spawn(process.execPath, [...mode.command, ...process.argv.slice(3)], {
  stdio: 'inherit', env: { ...process.env, ...mode.env },
});
child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
