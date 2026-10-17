import type { Page, Route } from '@playwright/test';
import { registerExpectedHttpFailure } from './console-guard';

export interface MockRequest {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  postData: string | null;
}

export type ApiHandler = (route: Route, request: MockRequest) => Promise<boolean> | boolean;

export async function installStrictApiMock(page: Page, handlers: ApiHandler[]) {
  const unexpected: string[] = [];

  await page.route('**/*', async (route) => {
    const playwrightRequest = route.request();
    const url = new URL(playwrightRequest.url());
    const request: MockRequest = {
      method: playwrightRequest.method(),
      pathname: url.pathname,
      searchParams: url.searchParams,
      postData: playwrightRequest.postData(),
    };

    for (const handler of handlers) {
      if (await handler(route, request)) return;
    }

    if (['fetch', 'xhr'].includes(playwrightRequest.resourceType())) {
      unexpected.push(`${request.method} ${url.pathname}${url.search}`);
      await route.abort('failed');
      return;
    }

    await route.fallback();
  });

  return {
    expectNoUnexpectedRequests() {
      if (unexpected.length > 0) {
        throw new Error(`存在未声明的 API 请求：\n${unexpected.join('\n')}`);
      }
    },
  };
}

export async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ code: status >= 400 ? status : 0, data }),
  });
}

export async function fulfillApiError(route: Route, message: string, status = 500) {
  registerExpectedHttpFailure(route.request().frame().page(), {
    method: route.request().method(),
    url: route.request().url(),
    status,
  });
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ code: status, data: null, message }),
  });
}

export function createDeferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
