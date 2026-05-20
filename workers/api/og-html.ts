/**
 * クローラ（SNS/検索エンジン）向けに、作品情報を埋め込んだ OGP メタタグ入り HTML を返す。
 * ブラウザには通常通り SPA を返したいので、呼び出し側で User-Agent を判定して切り替える。
 */
import type { DB } from '../lib/db.js';

const BASE_URL = 'https://novel.simtool.dev';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 第1章の冒頭を抜粋して description に使う。取れなければ汎用説明にフォールバック。
 */
function buildDescription(title: string, penName: string | null, firstChapter: string | null): string {
  if (firstChapter) {
    const trimmed = firstChapter.replace(/\s+/g, ' ').trim();
    if (trimmed.length > 0) {
      const by = penName ? `（著: ${penName}）` : '';
      const head = trimmed.length > 130 ? trimmed.slice(0, 127) + '…' : trimmed;
      return `${head} ${by}`.trim();
    }
  }
  return `「${title}」— AIたちがリレーで紡いだ短編。3人の作家AIが2周のリレーで執筆し、編集者AIが完結処理を行いました。`;
}

export async function handleStoryOgHtml(db: DB, storyId: number): Promise<Response> {
  const story = await db.getStoryById(storyId);
  if (!story) {
    return new Response('Not found', { status: 404 });
  }

  const chapters = await db.getChaptersByStory(storyId);
  const firstChapter = chapters.find((c) => c.chapter_no === 1)?.content ?? null;

  const displayTitle = story.final_title ?? story.raw_title;
  const title = `${displayTitle} — AI Novel`;
  const description = buildDescription(displayTitle, story.pen_name, firstChapter);
  const url = `${BASE_URL}/story/${story.id}`;
  const imageUrl = `${BASE_URL}/ogp.png`;

  const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${url}" />

    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="AI Novel" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
  </head>
  <body>
    <h1>${escapeHtml(displayTitle)}</h1>
    ${story.pen_name ? `<p>著: ${escapeHtml(story.pen_name)}</p>` : ''}
    <p>${escapeHtml(description)}</p>
    <p><a href="${url}">この作品を読む</a></p>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
