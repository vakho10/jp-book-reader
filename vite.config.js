import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const OUT = path.resolve(import.meta.dirname, 'out');

// `npm run dev`: list locally built books (out/*.book.json) so the app can auto-load them.
const devBooks = {
  name: 'dev-books',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__dev/books', (_req, res) => {
      const ids = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith('.book.json')).map((f) => f.replace(/\.book\.json$/, '')) : [];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(ids));
    });
  },
};

// The published app must never contain book text. Fail the build if it does.
const noBookData = {
  name: 'no-book-data',
  apply: 'build',
  generateBundle(_opts, bundle) {
    for (const [name, chunk] of Object.entries(bundle)) {
      const code = chunk.type === 'chunk' ? chunk.code : String(chunk.source);
      if (/"blocks"\s*:\s*\[\s*\{/.test(code) || /\.book\.json/.test(name)) {
        this.error(`${name} looks like it contains book data. Book files must stay out of the app build.`);
      }
    }
  },
};

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), viteSingleFile(), devBooks, noBookData],
  build: { outDir: 'dist', emptyOutDir: true },
});
