import { DocsBody } from 'fumadocs-ui/page';
import type { ComponentProps } from 'react';

/** Use children for framework-rendered Markdown. HTML must come from a trusted server renderer. */
export function PublishedContent(props: ComponentProps<typeof DocsBody>) {
  return <DocsBody {...props} />;
}
