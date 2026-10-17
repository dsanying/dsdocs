import { collectTableGeometryIssues } from './table-geometry';
import { inspectSidebarRegions } from './sidebar-contract';
import {
  expect,
  test as base,
  type ConsoleMessage,
  type Locator,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';

import { APP_ORIGIN } from './app-origin';

interface BrowserConsoleReport {
  level: 'warning' | 'error';
  message: string;
  stack: string;
}

interface ExpectedConsoleReport {
  level: 'warning' | 'error';
  message: string;
  count?: number;
}

interface ExpectedHttpFailure {
  method: string;
  url: string;
  status: number;
  count?: number;
}

interface ExpectedRequestFailure {
  method: string;
  url: string;
  errorText: string;
  count?: number;
}

const expectationKey = (...parts: Array<string | number>) => JSON.stringify(parts);

const addExpectation = (entries: Map<string, number>, key: string, count = 1) => {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`运行时诊断预期次数必须为正整数，实际为 ${count}`);
  }
  entries.set(key, (entries.get(key) ?? 0) + count);
};

const consumeExpectation = (entries: Map<string, number>, key: string) => {
  const remaining = entries.get(key) ?? 0;
  if (remaining <= 0) return false;
  if (remaining === 1) entries.delete(key);
  else entries.set(key, remaining - 1);
  return true;
};

export class RuntimeNetworkExpectations {
  private readonly consoleReports = new Map<string, number>();

  registerConsoleReport(expectation: ExpectedConsoleReport) {
    if (!['warning', 'error'].includes(expectation.level) || !expectation.message.trim())
      throw new Error('预期诊断必须声明精确 level/message');
    addExpectation(
      this.consoleReports,
      expectationKey(expectation.level, expectation.message),
      expectation.count
    );
  }

  consumeConsoleReport(report: Pick<BrowserConsoleReport, 'level' | 'message'>) {
    return consumeExpectation(this.consoleReports, expectationKey(report.level, report.message));
  }

  private readonly httpFailures = new Map<string, number>();
  private readonly requestFailures = new Map<string, number>();
  private readonly observedHttpConsoleDiagnostics = new Map<string, number>();
  private readonly observedRequestConsoleDiagnostics = new Map<string, number>();

  registerHttpFailure(expectation: ExpectedHttpFailure) {
    if (expectation.status < 400 || expectation.status > 599) {
      throw new Error(`预期 HTTP 失败状态必须为 400-599，实际为 ${expectation.status}`);
    }
    addExpectation(
      this.httpFailures,
      expectationKey(expectation.method.toUpperCase(), expectation.url, expectation.status),
      expectation.count
    );
  }

  consumeHttpFailure(expectation: Omit<ExpectedHttpFailure, 'count'>) {
    const matched = consumeExpectation(
      this.httpFailures,
      expectationKey(expectation.method.toUpperCase(), expectation.url, expectation.status)
    );
    if (matched) {
      addExpectation(
        this.observedHttpConsoleDiagnostics,
        expectationKey(expectation.url, expectation.status)
      );
    }
    return matched;
  }

  registerRequestFailure(expectation: ExpectedRequestFailure) {
    addExpectation(
      this.requestFailures,
      expectationKey(expectation.method.toUpperCase(), expectation.url, expectation.errorText),
      expectation.count
    );
  }

  consumeRequestFailure(expectation: Omit<ExpectedRequestFailure, 'count'>) {
    const matched = consumeExpectation(
      this.requestFailures,
      expectationKey(expectation.method.toUpperCase(), expectation.url, expectation.errorText)
    );
    if (matched) {
      // 已声明的请求失败必然同时产生 "Failed to load resource: net::ERR_*" 控制台诊断
      addExpectation(this.observedRequestConsoleDiagnostics, expectation.url);
    }
    return matched;
  }

  consumeRequestConsoleDiagnostic(url: string) {
    return consumeExpectation(this.observedRequestConsoleDiagnostics, url);
  }

  consumeHttpConsoleDiagnostic(url: string, status: number) {
    return consumeExpectation(this.observedHttpConsoleDiagnostics, expectationKey(url, status));
  }

  describeUnmet() {
    const describe = (label: string, entries: Map<string, number>) =>
      [...entries.entries()].map(([key, count]) => `${label} ${key}，尚缺 ${count} 次`);
    return [
      ...describe('已处理 console 诊断', this.consoleReports),
      ...describe('HTTP 失败', this.httpFailures),
      ...describe('请求失败', this.requestFailures),
    ];
  }
}

const runtimeNetworkExpectations = new WeakMap<Page, RuntimeNetworkExpectations>();

const getRuntimeNetworkExpectations = (page: Page) => {
  const existing = runtimeNetworkExpectations.get(page);
  if (existing) return existing;
  const created = new RuntimeNetworkExpectations();
  runtimeNetworkExpectations.set(page, created);
  return created;
};

export function registerExpectedConsoleReport(page: Page, expectation: ExpectedConsoleReport) {
  getRuntimeNetworkExpectations(page).registerConsoleReport(expectation);
}

export function registerExpectedHttpFailure(page: Page, expectation: ExpectedHttpFailure) {
  getRuntimeNetworkExpectations(page).registerHttpFailure(expectation);
}

export function registerExpectedRequestFailure(page: Page, expectation: ExpectedRequestFailure) {
  getRuntimeNetworkExpectations(page).registerRequestFailure(expectation);
}

const isExpectedNetworkDiagnostic = (page: Page, message: ConsoleMessage) => {
  if (message.type() !== 'error') return false;
  const location = message.location();
  if (location.lineNumber !== 0 || location.columnNumber !== 0) return false;
  const expectations = getRuntimeNetworkExpectations(page);
  const statusMatch = message
    .text()
    .match(/^Failed to load resource: the server responded with a status of (\d+) \(.+\)$/);
  if (statusMatch) {
    return expectations.consumeHttpConsoleDiagnostic(location.url, Number(statusMatch[1]));
  }
  if (/^Failed to load resource: net::ERR_\w+$/.test(message.text())) {
    return expectations.consumeRequestConsoleDiagnostic(location.url);
  }
  return false;
};

interface FirefoxEngineDiagnostic {
  browserName: string;
  pageUrl: string;
  type: string;
  text: string;
  lineNumber: number;
}

export const isAuditedFirefoxEngineDiagnostic = ({
  browserName,
  pageUrl,
  type,
  text,
  lineNumber,
}: FirefoxEngineDiagnostic) => {
  const match = text.match(
    /^\[JavaScript Warning: "This site appears to use a scroll-linked positioning effect\. This may not work well with asynchronous panning; see https:\/\/firefox-source-docs\.mozilla\.org\/performance\/scroll-linked_effects\.html for further details and to join the discussion on related tools and features!" \{file: "([^"\s]+)" line: 0\}\]$/
  );
  if (browserName !== 'firefox' || type !== 'warning' || lineNumber !== 0 || !match) {
    return false;
  }
  try {
    const diagnosticUrl = new URL(match[1]);
    const currentUrl = new URL(pageUrl);
    return (
      diagnosticUrl.origin === currentUrl.origin &&
      diagnosticUrl.pathname === currentUrl.pathname &&
      diagnosticUrl.pathname.startsWith('/')
    );
  } catch {
    return false;
  }
};

const isFirefoxScrollLinkedDiagnostic = (
  page: Page,
  browserName: string,
  message: ConsoleMessage
) => {
  const location = message.location();
  return isAuditedFirefoxEngineDiagnostic({
    browserName,
    pageUrl: page.url(),
    type: message.type(),
    text: message.text(),
    lineNumber: location.lineNumber,
  });
};

export function installRuntimeDiagnostics(page: Page, violations: string[]) {
  const networkExpectations = getRuntimeNetworkExpectations(page);
  const onPageError = (error: Error) => {
    violations.push(
      `[pageerror] ${error.name}: ${error.message}\n  stack: ${error.stack ?? '不可用'}`
    );
  };

  const onRequestFailed = (request: Request) => {
    const errorText = request.failure()?.errorText ?? '未知请求失败';
    const failure = {
      method: request.method(),
      url: request.url(),
      errorText,
    };
    if (networkExpectations.consumeRequestFailure(failure)) return;
    violations.push(
      `[requestfailed] ${failure.method} ${failure.url}\n  error: ${failure.errorText}`
    );
  };

  const onResponse = (response: Response) => {
    if (response.status() < 400) return;
    const failure = {
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
    };
    if (networkExpectations.consumeHttpFailure(failure)) return;
    violations.push(
      `[http] ${failure.method} ${failure.url}\n  status: ${failure.status} ${response.statusText()}`
    );
  };

  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  return () => {
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  };
}

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page, browserName }, use) => {
      const violations: string[] = [];
      const networkExpectations = getRuntimeNetworkExpectations(page);
      const removeRuntimeDiagnostics = installRuntimeDiagnostics(page, violations);

      await page.exposeFunction('__reportConsoleGuard', (report: BrowserConsoleReport) => {
        if (networkExpectations.consumeConsoleReport(report)) return;
        violations.push(`[${report.level}] ${report.message}\n  stack: ${report.stack}`);
      });
      await page.addInitScript(() => {
        (Error as ErrorConstructor & { stackTraceLimit?: number }).stackTraceLimit = 50;
        const guardWindow = window as typeof window & {
          __reportConsoleGuard: (report: BrowserConsoleReport) => Promise<void>;
        };
        const formatArgument = (value: unknown) => {
          if (typeof value === 'string') return value;
          if (value instanceof Error) return `${value.name}: ${value.message}`;
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        };

        for (const level of ['warn', 'error'] as const) {
          const original = console[level].bind(console);
          console[level] = (...args: unknown[]) => {
            const message = args.map(formatArgument).join(' ');
            const stack = new Error('console-guard').stack ?? '';
            void guardWindow.__reportConsoleGuard({
              level: level === 'warn' ? 'warning' : 'error',
              message,
              stack,
            });
            original(...args);
          };
        }
      });

      const onConsole = (message: ConsoleMessage) => {
        if (!['warning', 'error'].includes(message.type())) return;
        if (isExpectedNetworkDiagnostic(page, message)) return;
        if (isFirefoxScrollLinkedDiagnostic(page, browserName, message)) return;

        const location = message.location();
        if (location.lineNumber !== 0) return;
        if (
          networkExpectations.consumeConsoleReport({
            level: message.type() === 'warning' ? 'warning' : 'error',
            message: message.text(),
          })
        )
          return;
        violations.push(
          `[${message.type()}] ${message.text()}\n  at ${location.url}:${location.lineNumber}:${location.columnNumber}`
        );
      };

      page.on('console', onConsole);
      await use();
      page.off('console', onConsole);
      removeRuntimeDiagnostics();

      violations.push(
        ...(await inspectSidebarRegions(page)).map((message) => `[sidebar] ${message}`)
      );

      violations.push(
        ...(await collectTableGeometryIssues(page)).map((message) => `[table-geometry] ${message}`)
      );

      const currentUrl = page.url();
      if (currentUrl.startsWith(`${APP_ORIGIN}/`) && !currentUrl.includes('/tests/ui/')) {
        const heading = page.getByRole('heading', { level: 1 });
        const headingCount = await heading.count();
        if (headingCount !== 1) {
          violations.push(
            `[a11y] 页面必须恰好包含一个一级标题，实际为 ${headingCount}：${currentUrl}`
          );
        } else if (
          await heading.evaluate((element) => element.parentElement?.hasAttribute('title'))
        ) {
          violations.push(`[a11y] 页面一级标题不得由 Pro 字符串标题生成原生 title：${currentUrl}`);
        }
      }

      violations.push(
        ...networkExpectations.describeUnmet().map((message) => `[expected-network] ${message}`)
      );

      if (violations.length > 0) {
        throw new Error(`检测到未声明的浏览器运行时诊断：\n${violations.join('\n')}`);
      }
    },
    { auto: true },
  ],
});

export { expect };
export type {
  BrowserConsoleReport,
  ExpectedConsoleReport,
  ExpectedHttpFailure,
  ExpectedRequestFailure,
  Locator,
  Page,
};
