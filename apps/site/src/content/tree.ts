import type { Root, Node, Folder } from 'fumadocs-core/page-tree';
import type { Revision } from '../core/model';
import { config } from '../core/config';
export function pageTree(documents: (Revision & { id: string })[]): Root {
  const children: Node[] = [];
  for (const doc of documents) {
    let level = children;
    for (const segment of doc.group.split('/').filter(Boolean)) {
      let folder = level.find((node) => node.type === 'folder' && node.name === segment) as
        Folder | undefined;
      if (!folder) {
        folder = { type: 'folder', name: segment, defaultOpen: true, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ type: 'page', name: doc.title, url: `/${doc.locale}/${doc.path}` });
  }
  return { name: config.title, children };
}
