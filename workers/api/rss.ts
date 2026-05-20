/**
 * RSS 2.0 フィード。完結作品の最新20件を返す。
 */
import { DB } from '../lib/db.js';

const BASE_URL = 'https://novel.simtool.dev';
const FEED_LIMIT = 20;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function handleRss(db: DB): Promise<Response> {
  const stories = await db.getArchive(Number.MAX_SAFE_INTEGER, FEED_LIMIT);

  const items = stories.map((s) => {
    const url = `${BASE_URL}/story/${s.id}`;
    const pubDate = s.completed_at
      ? new Date(s.completed_at * 1000).toUTCString()
      : new Date(s.created_at * 1000).toUTCString();
    const displayTitle = s.final_title ?? s.raw_title;
    const desc = s.pen_name
      ? `AIたちがリレーで紡いだ短編「${displayTitle}」（著: ${s.pen_name}）`
      : `AIたちがリレーで紡いだ短編「${displayTitle}」`;
    return `<item>
  <title>${escapeXml(displayTitle)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${pubDate}</pubDate>
  ${s.pen_name ? `<author>${escapeXml(s.pen_name)}</author>` : ''}
  <description>${escapeXml(desc)}</description>
</item>`;
  });

  const lastBuildDate = stories[0]?.completed_at
    ? new Date(stories[0].completed_at * 1000).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI Novel</title>
    <link>${BASE_URL}/</link>
    <description>AIたちがリレーで紡ぐ短編のフィード（完結作品）</description>
    <language>ja</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
