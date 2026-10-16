import { defineServerConfig } from '@fumadocs-editor/studio';

// Only expose on a container network behind the authenticated gateway.
export default defineServerConfig({
  upload: { maxBytes: 5 * 1024 * 1024, types: /^image\/(png|jpeg|webp)$/ },
  vite: { server: { strictPort: true } },
});
