/**
 * REST API ハンドラ。
 */
import { DB, type TagFilters } from '../lib/db.js';

const TAG_KEYS: Array<keyof TagFilters> = [
  'genre',
  'tone',
  'aftertaste',
  'plot_arc',
  'theme',
  'atmosphere',
];

function parseTagFilters(url: URL): { filters: TagFilters; anyActive: boolean } {
  const filters: TagFilters = {};
  let anyActive = false;
  for (const key of TAG_KEYS) {
    const v = url.searchParams.get(key);
    if (v && v.trim()) {
      filters[key] = v.trim();
      anyActive = true;
    }
  }
  return { filters, anyActive };
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=30',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function notFound(): Response {
  return jsonResponse({ error: 'Not found' }, 404);
}

/**
 * GET /api/current
 * 進行中の short story (active) + これまでの章。
 * active が無ければ直近の completed を返す。
 */
export async function handleCurrent(db: DB): Promise<Response> {
  const story = await db.getActiveStory();
  if (!story) {
    const recent = await db.getRecentCompletedStories(1);
    if (recent.length === 0) return jsonResponse({ story: null, chapters: [] });
    const chapters = await db.getChaptersByStory(recent[0].id);
    return jsonResponse({ story: recent[0], chapters });
  }
  const chapters = await db.getChaptersByStory(story.id);
  return jsonResponse({ story, chapters });
}

/**
 * GET /api/recent?limit=10
 * 直近の story メタ情報（サイドバー用、軽量）
 */
export async function handleRecent(db: DB, url: URL): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '10'), 50);
  const stories = await db.getRecentCompletedStories(limit);
  return jsonResponse({ stories });
}

/**
 * GET /api/archive?cursor=N&limit=20&genre=...&tone=...
 * 完了 story のページネーション（タグフィルタ対応）
 */
export async function handleArchive(db: DB, url: URL): Promise<Response> {
  const cursor = Number(url.searchParams.get('cursor') ?? '999999999');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100);
  const { filters, anyActive } = parseTagFilters(url);
  const stories = anyActive
    ? await db.getArchiveFiltered(cursor, limit, filters)
    : await db.getArchive(cursor, limit);
  const nextCursor = stories.length === limit ? stories[stories.length - 1].id : null;
  return jsonResponse({ stories, next_cursor: nextCursor });
}

/**
 * GET /api/tags
 * 各タグ軸の値ごとの件数（フィルタ UI 用）
 */
export async function handleTags(db: DB): Promise<Response> {
  const counts = await db.getTagCounts();
  return jsonResponse({ counts });
}

/**
 * GET /api/story/:id
 * 特定 story の全章
 */
export async function handleStory(db: DB, id: number): Promise<Response> {
  const story = await db.getStoryById(id);
  if (!story) return notFound();
  const chapters = await db.getChaptersByStory(story.id);
  return jsonResponse({ story, chapters });
}
