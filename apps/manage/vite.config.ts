import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(() => {
  // UI 契约测试包由 scripts/run-runtime.mjs 用 FRONTEND_UI_TEST 环境变量标记（跨平台，
  // 不依赖 shell 语法）：增加 contract-fixture 第二入口并保留 console，供浏览器守卫采集真实诊断。
  const isUITestBuild = process.env.FRONTEND_UI_TEST === '1';

  return {
    base: '/',
    plugins: [
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5183,
      strictPort: true,
      // 浏览器验证产物不属于源码，避免测试写入触发开发页面反复重载。
      watch: { ignored: ['**/.playwright/**', '**/test-results/**', '**/playwright-report/**'] },
      // 按目标应用的真实后端在这里登记代理；本模板不预设任何上游服务。
      fs: { deny: ['.env', '.env.*', '**/*.sqlite', '**/*.sqlite-*', '**/*.key', '**/server/**'] },
      proxy: {
        '/__dsdocs_auth': 'http://127.0.0.1:5182',
        '/__dsdocs_accounts': 'http://127.0.0.1:5182',
        '/__dsdocs_content': 'http://127.0.0.1:5182',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false, // 禁用 source map, 实际上 vite8 默认就是false就是了
      rolldownOptions: {
        input: isUITestBuild
          ? {
              'tests/ui/viewport-fixture': path.resolve(
                import.meta.dirname,
                'tests/ui/viewport-fixture.html'
              ),
              'tests/ui/tabs-fill-fixture': path.resolve(
                import.meta.dirname,
                'tests/ui/tabs-fill-fixture.html'
              ),
              app: path.resolve(import.meta.dirname, 'index.html'),
              'tests/ui/contract-fixture': path.resolve(
                import.meta.dirname,
                'tests/ui/contract-fixture.html'
              ),
            }
          : undefined,
        output: {
          codeSplitting: {
            groups: [
              // React 与 Vite 预加载辅助是入口必需的公共模块，单独成组并优先于各 vendor 组；
              // 否则会被依赖它们的分组（如 vendor-monaco）按依赖关系吸入，入口再以错误的名字静态导入。
              // 注意不要关闭 includeDependenciesRecursively：跨组模块初始化顺序会被打乱（运行时 “n is not a function”）。
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]|preload-helper/,
                priority: 20,
              },
              // Markdown/高亮等重依赖经共享懒加载边界打包（scripts/bundle/lazy-boundary.mjs），
              // 构建插件会阻止手工分组吸入 React 后反向污染入口。
              {
                name: 'vendor-echarts',
                test: /[\\/]node_modules[\\/].*(echarts|zrender)[\\/]/,
              },
              {
                // 只收拢 React 封装；编辑器本体（monaco-editor）交给自动分块，保持 editor.api 与 jsonMode 两个懒加载块。
                // 不得用 maxSize 拆分本体：跨分块后初始化顺序被打乱，生产包打开 JSON 视图即报 “t is not a function”。
                name: 'vendor-monaco',
                test: /[\\/]node_modules[\\/].*@monaco-editor[\\/]/,
              },
              {
                name: 'vendor-dnd',
                test: /[\\/]node_modules[\\/].*@dnd-kit[\\/]/,
              },
            ],
          },
          // 普通生产包移除 console；UI 契约包保留 console，确保浏览器守卫能捕获真实产物诊断。
          minify: {
            compress: {
              dropConsole: !isUITestBuild,
              dropDebugger: true,
            },
          },
        },
      },
      // 业务分块上限；唯一接近上限的是 JSON 编辑器懒加载的 Monaco 本体 editor.api（压缩后约 2.7 MB，
      // 不可安全拆分，见上方分组注释），上限按它设定。出现其他超限分块时应拆分而不是继续上调。
      chunkSizeWarningLimit: 3000,
    },
  };
});
