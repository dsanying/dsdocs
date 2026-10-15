import { stringify } from 'yaml';
import type { Store } from './store';
import type { Actor } from './model';
import { inspectMdx, splitSource } from '../content/validate';
import { basePath } from './config';

/** A consistent published snapshot. No drafts, identities, sessions or history leave the CMS. */
export function exportFiles(store: Store, actor: Actor, publicPrefix = basePath) {
  store.authorize(actor, 'read');
  return store.transaction(() => {
    store.authorize(actor, 'read');
    const files: Record<string, Uint8Array> = {};
    const extensions: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    for (const doc of store.published()) {
      let source = doc.mdx;
      const analysis = inspectMdx(source);
      if (analysis.diagnostics.length) throw new Error('Published content failed validation');
      for (const id of analysis.assets) {
        const asset = store.asset(id),
          relative = `assets/${id}.${extensions[String(asset.mime)]}`;
        files[`public/${relative}`] = Buffer.from(asset.bytes as Uint8Array);
        for (const link of analysis.links.filter(
          (link) => link.match(/\/api\/v1\/assets\/([a-f0-9-]{36})(?:$|[?#])/)?.[1] === id
        )) {
          const suffix = link.match(/[?#].*$/)?.[0] ?? '';
          source = source.replaceAll(link, `${publicPrefix}/${relative}${suffix}`);
        }
      }
      const { frontmatter, body } = splitSource(source);
      const metadata = {
        ...frontmatter,
        title: doc.title,
        description: doc.description,
        translationKey: doc.translationKey,
        group: doc.group,
        order: doc.order,
      };
      files[`content/docs/${doc.locale}/${doc.path}.mdx`] = Buffer.from(
        `---\n${stringify(metadata)}---\n${body}`
      );
    }
    files['dsdocs-export.json'] = Buffer.from(
      JSON.stringify(
        {
          format: 'dsdocs-files',
          version: 1,
          basePath: publicPrefix,
          documents: store.published().length,
        },
        null,
        2
      ) + '\n'
    );
    return files;
  });
}
