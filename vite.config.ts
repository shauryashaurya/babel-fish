import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// ./data is the single source of data and copy. The app fetches it at runtime.
function serveData(): Plugin {
  const root = resolve('data');
  let outDir = resolve('dist');
  return {
    name: 'serve-data',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    configureServer(server) {
      // The app reads ./data once when the page opens, so any change there needs a full reload, not a hot update.
      server.watcher.add(root);
      server.watcher.on('all', (_event, file) => { if (resolve(file).startsWith(root + sep)) server.ws.send({type: 'full-reload'}); });
      server.middlewares.use('/data', (req, res, next) => {
        const file = resolve(root, '.' + decodeURIComponent((req.url || '').split('?')[0]));
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');
        createReadStream(file).pipe(res);
      });
    },
    transformIndexHtml(html) {
      const {app} = JSON.parse(readFileSync(join(root, 'content/copy.json'), 'utf8'));
      return html.replace('%APP_TITLE%', app.title).replace('%APP_DESCRIPTION%', app.description);
    },
    closeBundle() { cpSync(root, join(outDir, 'data'), { recursive: true }); },
  };
}

export default defineConfig({
  plugins: [svelte(), serveData()],
  base: './',
  build: { target: 'es2022' },
});
