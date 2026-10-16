import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import 'monaco-editor/language/json/monaco.contribution.js';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';

type MonacoWorkerEnvironment = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker;
  };
};

const workerEnvironment = globalThis as MonacoWorkerEnvironment;
workerEnvironment.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

// 显式使用随应用发布的 ESM 与 worker，禁止 loader 回退到默认 jsDelivr CDN。
loader.config({ monaco });

export default Editor;
