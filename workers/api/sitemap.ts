/**
 * 動的 sitemap.xml 生成。
 * トップ・archive + 完結作品（最大1000件）を返す。
 */
import { DB } from '../lib/db.js';

const BASE_URL = 'https://novel.simtool.dev';
const MAX_ARCHIVE_STORIES = 1000;

export async function handleSitemap(db: DB): Promise<Response> {
  const stories = await db.getArchive(Number.MAX_SAFE_INTEGER, MAX_ARCHIVE_STORIES);

  const urls: string[] = [
    `<url><loc>${BASE_URL}/</loc><changefreq>always</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${BASE_URL}/archive</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`,
  ];

  for (const s of stories) {
    const lastmod = s.completed_at
      ? new Date(s.completed_at * 1000).toISOString().split('T')[0]
      : undefined;
    const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
    urls.push(
      `<url><loc>${BASE_URL}/story/${s.id}</loc>${lastmodTag}<changefreq>never</changefreq><priority>0.7</priority></url>`,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // 1時間キャッシュ（cron間隔と一致）
    },
  });
}
