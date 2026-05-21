/**
 * Cron 1回の発火で「章を1つ進める」を担う高水準ロジック。
 * - active な story がなければ新規 story を作成 + 即 active 化
 * - 章を生成して chapters に挿入（UNIQUE で二重投入防止）
 * - 第6章まで終わったら editor を呼び、出力をパースして story を completed に
 *
 * 単語辞書は呼び出し側 (index.ts) で JSON import して渡す（Workers ランタイムは fs 不可）。
 */
import { DB } from './db.js';
import { notifyOnce } from './line-notify.js';
import type { ProviderEnv } from './providers.js';
import {
  generateStoryTags,
  generateTitle,
  parseEditorOutput,
  runOneChapter,
  STORY_CHAPTERS,
  TOTAL_CHAPTERS,
  trimToLastSentence,
  type WordsDict,
} from './relay.js';

interface NotifyEnv {
  LINE_CHANNEL_TOKEN?: string;
  LINE_USER_ID?: string;
}

interface RunContext {
  db: DB;
  env: ProviderEnv & NotifyEnv;
  words: WordsDict;
  now: number;
}

export interface ChapterResult {
  status: string;
  story_id?: number;
  chapter_no?: number;
  writer?: string;
  editor_parsed?: boolean;
}

/**
 * 新規 story を作成する。
 * 単語ペアが既存と重複した場合は別ペアで最大10回リトライ。
 */
async function createNewStory(db: DB, words: WordsDict, now: number): Promise<number | null> {
  for (let i = 0; i < 10; i++) {
    const title = generateTitle(words);
    const tags = generateStoryTags(words);
    const id = await db.createStory({
      raw_title: title.raw_title,
      word_a: title.word_a,
      word_b: title.word_b,
      pattern: title.pattern,
      genre: tags.genre,
      tone: tags.tone,
      aftertaste: tags.aftertaste,
      plot_arc: tags.plot_arc,
      theme: tags.theme,
      atmosphere: tags.atmosphere,
      now,
    });
    if (id !== null) return id;
    // UNIQUE 制約違反（同じ word_a, word_b 既存）→ 別ペアで再試行
  }
  return null;
}

export async function advanceOneChapter(ctx: RunContext): Promise<ChapterResult> {
  const { db, env, words, now } = ctx;

  // ---------- 1. active な story を確保 ----------
  let active = await db.getActiveStory();

  if (!active) {
    // 新規 story を作る + 即 active 化（pending は介さない、シンプル運用）
    const newId = await createNewStory(db, words, now);
    if (newId === null) {
      return { status: 'create_failed' };
    }
    const won = await db.startStory(newId, now);
    if (!won) {
      // 別 cron が先に active 化した → 次回に任せる
      return { status: 'lost_start_race', story_id: newId };
    }
    active = await db.getStoryById(newId);
    if (!active) {
      return { status: 'fetch_failed', story_id: newId };
    }
  }

  // ---------- 2. 次に書くべき章番号 ----------
  const maxChapter = await db.getMaxChapterNoForStory(active.id);
  const nextChapterNo = maxChapter + 1;

  if (nextChapterNo > TOTAL_CHAPTERS) {
    // すでに editor まで完了している → completed に遷移（防御的）
    await db.completeStory(active.id, now);
    return { status: 'story_already_done', story_id: active.id };
  }

  // ---------- 3. 章実行 ----------
  const prevChapters = await db.getChaptersByStory(active.id);
  const prevForRelay = prevChapters
    .filter((c) => c.chapter_no <= STORY_CHAPTERS) // 編集者ターン (7) は履歴に含めない
    .map((c) => ({
      chapter_no: c.chapter_no,
      writer: c.writer as 'writer_a' | 'writer_b' | 'writer_c',
      content: c.content,
    }));

  const failKey = `fail_count:story_${active.id}_chapter_${nextChapterNo}`;
  let result;
  try {
    result = await runOneChapter({
      story: {
        id: active.id,
        raw_title: active.raw_title,
        genre: active.genre,
        tone: active.tone,
        aftertaste: active.aftertaste,
        plot_arc: active.plot_arc,
        theme: active.theme,
        atmosphere: active.atmosphere,
      },
      chapterNo: nextChapterNo,
      prevChapters: prevForRelay,
      env,
    });
    await db.setMeta(failKey, '0', now);
  } catch (err) {
    const prevFailCount = Number((await db.getMeta(failKey)) ?? '0');
    const newFailCount = prevFailCount + 1;
    await db.setMeta(failKey, String(newFailCount), now);

    if (newFailCount >= 3) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await notifyOnce(
        db,
        `chapter_fail_${active.id}_${nextChapterNo}`,
        `[ai-novel] Chapter 失敗が${newFailCount}回連続\n作品: #${active.id} ${active.raw_title}\nChapter ${nextChapterNo}\n${errMsg.slice(0, 300)}`,
        env,
        now,
      );
    }
    throw err;
  }

  // 作家ターンは末尾トリム、編集者ターンは生出力をそのまま保存
  const content =
    nextChapterNo <= STORY_CHAPTERS ? trimToLastSentence(result.content) : result.content;

  // ---------- 4. 永続化 ----------
  const insertedId = await db.addChapter({
    story_id: active.id,
    chapter_no: nextChapterNo,
    writer: result.writer,
    provider: result.provider,
    model: result.model,
    content,
    created_at: now,
  });

  if (insertedId === null) {
    // レース敗者: 別 cron が同じ章を先に書いた
    return { status: 'lost_chapter_race', story_id: active.id, chapter_no: nextChapterNo };
  }

  await db.incrementStoryChapter(active.id, nextChapterNo);
  await db.setMeta('last_cron_run_at', String(now), now);

  // ---------- 5. 編集者ターン後の完結処理 ----------
  if (nextChapterNo === TOTAL_CHAPTERS) {
    const parsed = parseEditorOutput(result.content);
    const hasFullParse =
      parsed.pen_name.length > 0 &&
      parsed.final_title.length > 0 &&
      parsed.chapter_titles.length === STORY_CHAPTERS;

    if (hasFullParse) {
      await db.updateEditorOutput(active.id, parsed);
    } else {
      console.warn(
        `[chapter-runner] editor output parse incomplete:`,
        parsed,
        'raw:',
        result.content.slice(0, 200),
      );
    }
    await db.completeStory(active.id, now);
    return {
      status: 'story_completed',
      story_id: active.id,
      chapter_no: nextChapterNo,
      writer: result.writer,
      editor_parsed: hasFullParse,
    };
  }

  return {
    status: 'chapter_advanced',
    story_id: active.id,
    chapter_no: nextChapterNo,
    writer: result.writer,
  };
}

