import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base=new URL('../src/components/ui/',import.meta.url);
test('shared Tooltip and HelpTip use intrinsic width with a viewport ceiling',()=>{
 const css=readFileSync(new URL('Tooltip.css',base),'utf8');
 const help=readFileSync(new URL('HelpTip.css',base),'utf8');
 // 短提示单行自然宽度，只以视口为上限；自动图标名称提示不接收指针。
 assert.match(css,/\.ds-tooltip__container\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*calc\(100vw - var\(--ds-space-32\)\)[^}]*white-space:\s*nowrap/s);
 assert.match(css,/\.ds-icon-label-hint(?:\s*,|\s*\*|\s*\{)[^}]*pointer-events:\s*none/s);
 // 帮助说明是句子：按可读宽度恢复自然换行，仍以视口为上限。
 assert.match(help,/\.ds-help-tip__popup\s*\{[^}]*max-width:\s*min\([^;]*calc\(100vw - var\(--ds-space-32\)\)\)/s);
 assert.match(help,/\.ds-help-tip__popup\s+\.ds-tooltip__container\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s);
});
