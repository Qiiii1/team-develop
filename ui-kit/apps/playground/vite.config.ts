import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ base: './', resolve: { alias: {
'@ok-ah/ui/styles.css': fileURLToPath(new URL('../../packages/ui/src/styles.css', import.meta.url)),
'@ok-ah/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url))
} } });
