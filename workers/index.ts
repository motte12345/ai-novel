/**
 * Cloudflare Worker エントリポイント。
 * - fetch: API エンドポイント + 静的アセット配信
 * - scheduled: 60分おきに1章進める
 */
import wordsJson from '../prompts/words.json';
import { handleArchive, handleCurrent, handleRecent, handleStory } from './api/handlers.js';
import { handleStoryOgHtml } from './api/og-html.js';
import { handleRss } from './api/rss.js';
import { handleSitemap } from './api/sitemap.js';
import { advanceOneChapter } from './lib/chapter-runner.js';
import { isBot } from './lib/bot-ua.js';
import { DB } from './lib/db.js';
import { notifyOnce } from './lib/line-notify.js';
import type { WordsDict } from './lib/relay.js';

const words = wordsJson as WordsDict;

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  LINE_CHANNEL_TOKEN?: string;
  LINE_USER_ID?: string;
  ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = new DB(env.DB);

    if (path === '/sitemap.xml') {
      return handleSitemap(db);
    }
    if (path === '/rss.xml' || path === '/feed.xml') {
      return handleRss(db);
    }
    if (path === '/api/current') {
      return handleCurrent(db);
    }
    if (path === '/api/recent') {
      return handleRecent(db, url);
    }
    if (path === '/api/archive') {
      return handleArchive(db, url);
    }
    const storyMatch = path.match(/^\/api\/story\/(\d+)$/);
    if (storyMatch) {
      return handleStory(db, Number(storyMatch[1]));
    }
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // SNS/検索エンジン bot で /story/:id にアクセスがあった場合、
    // 作品情報を埋めた OGP メタタグ入り HTML を返す（シェア時に作品タイトルが表示される）
    const storyPageMatch = path.match(/^\/story\/(\d+)\/?$/);
    if (storyPageMatch && isBot(request.headers.get('user-agent'))) {
      return handleStoryOgHtml(db, Number(storyPageMatch[1]));
    }

    // 静的アセット（SPA fallback は wrangler.toml の single-page-application 設定で処理）
    return env.ASSETS.fetch(request);
  },

  /**
   * Cron 発火: 60分おきに1章進める。
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new DB(env.DB);
    const now = Math.floor(Date.now() / 1000);

    ctx.waitUntil(
      advanceOneChapter({ db, env, words, now })
        .then((result) => {
          console.log('[cron]', JSON.stringify(result));
        })
        .catch(async (err) => {
          console.error('[cron] error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          await notifyOnce(
            db,
            'cron_fatal',
            `[ai-novel] Cron 致命的エラー\n${msg.slice(0, 500)}`,
            env,
            now,
          );
        }),
    );
  },
};
