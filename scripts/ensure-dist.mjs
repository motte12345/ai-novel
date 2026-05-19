// wrangler が assets directory を要求するので、フロント未実装段階でも空の dist を用意する。
// Phase 3 で vite build に置き換わる。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

const indexPath = join(distDir, 'index.html');
if (!existsSync(indexPath)) {
  writeFileSync(
    indexPath,
    `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>ai-novel (placeholder)</title>
  </head>
  <body>
    <h1>ai-novel</h1>
    <p>Phase 2 (Workers/D1) のみ稼働中。フロントは Phase 3 で実装予定。</p>
    <p>API: <code>/api/current</code>, <code>/api/recent</code>, <code>/api/archive</code>, <code>/api/story/:id</code></p>
  </body>
</html>
`,
    'utf-8',
  );
}
