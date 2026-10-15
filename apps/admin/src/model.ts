import type { Content, Document } from './api';
export const emptyContent: Content = {
  title: '',
  description: '',
  path: '',
  locale: 'zh',
  version: 'latest',
  translationKey: '',
  group: '',
  order: 0,
  mdx: '',
};
export function formContent(document: Document): Content {
  const { number, actor, createdAt, ...content } = document.draft;
  void number;
  void actor;
  void createdAt;
  return content;
}
export function equalContent(left: Content, right: Content) {
  return (Object.keys(emptyContent) as Array<keyof Content>).every(
    (key) => left[key] === right[key]
  );
}
export function naturalName(left: string, right: string) {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}
