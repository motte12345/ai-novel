/**
 * D1 アクセス層。
 *
 * 設計方針（ai-roundtable から踏襲）:
 * - 同時 cron による二重書き込みは UNIQUE 制約 + INSERT OR IGNORE で防ぐ
 * - active への状態遷移は CAS (`WHERE status = 'pending'`)
 * - 進行中の章番号は chapters.MAX(chapter_no)+1 から導出（current_chapter フィールドより信頼できる）
 */

export interface StoryRow {
  id: number;
  raw_title: string;
  word_a: string;
  word_b: string;
  pattern: string;
  final_title: string | null;
  pen_name: string | null;
  status: 'pending' | 'active' | 'completed';
  current_chapter: number;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  // タグ（タイトルと独立に抽選される。既存作品は NULL）
  genre: string | null;
  tone: string | null;
  aftertaste: string | null;
  plot_arc: string | null;
  theme: string | null;
  atmosphere: string | null;
}

/** archive フィルタ用。各軸 1 つの値だけ指定可能（null/undefined はスキップ） */
export interface TagFilters {
  genre?: string | null;
  tone?: string | null;
  aftertaste?: string | null;
  plot_arc?: string | null;
  theme?: string | null;
  atmosphere?: string | null;
}

export interface ChapterRow {
  id: number;
  story_id: number;
  chapter_no: number;
  writer: string;
  provider: string;
  model: string;
  title: string | null;
  content: string;
  created_at: number;
}

export class DB {
  constructor(private d1: D1Database) {}

  // ---------- stories ----------

  async getActiveStory(): Promise<StoryRow | null> {
    return await this.d1
      .prepare(`SELECT * FROM stories WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`)
      .first<StoryRow>();
  }

  async getStoryById(id: number): Promise<StoryRow | null> {
    return await this.d1
      .prepare(`SELECT * FROM stories WHERE id = ?`)
      .bind(id)
      .first<StoryRow>();
  }

  async getRecentCompletedStories(limit: number): Promise<StoryRow[]> {
    const result = await this.d1
      .prepare(
        `SELECT * FROM stories WHERE status IN ('active', 'completed') ORDER BY COALESCE(completed_at, started_at) DESC LIMIT ?`,
      )
      .bind(limit)
      .all<StoryRow>();
    return result.results ?? [];
  }

  /** archive ページネーション。cursor は id（次は id < cursor の最大から limit 件） */
  async getArchive(cursor: number, limit: number): Promise<StoryRow[]> {
    const result = await this.d1
      .prepare(
        `SELECT * FROM stories WHERE status = 'completed' AND id < ? ORDER BY id DESC LIMIT ?`,
      )
      .bind(cursor, limit)
      .all<StoryRow>();
    return result.results ?? [];
  }

  /**
   * タグでフィルタした archive。
   * 各カラム値はカンマ区切り（例: "明るい,静か"）なので、',' || value || ',' で囲って
   * '%,検索値,%' に LIKE することで部分一致のミスマッチを避ける。
   */
  async getArchiveFiltered(
    cursor: number,
    limit: number,
    filters: TagFilters,
  ): Promise<StoryRow[]> {
    const clauses: string[] = [`status = 'completed'`, `id < ?`];
    const binds: (string | number)[] = [cursor];

    const cols: Array<keyof TagFilters> = [
      'genre',
      'tone',
      'aftertaste',
      'plot_arc',
      'theme',
      'atmosphere',
    ];
    for (const col of cols) {
      const v = filters[col];
      if (v) {
        clauses.push(`',' || ${col} || ',' LIKE ?`);
        binds.push(`%,${v},%`);
      }
    }

    binds.push(limit);
    const sql = `SELECT * FROM stories WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT ?`;
    const result = await this.d1.prepare(sql).bind(...binds).all<StoryRow>();
    return result.results ?? [];
  }

  /**
   * 各タグ軸の値ごとの作品数を返す（フィルタ UI 用）。
   * カンマ区切り値は分解せず、生のままカウントする → フロント側で再集計しても良いが、
   * 軸ごとの「現状の値分布」を返すシンプルな実装で十分。
   *
   * 戻り値: { genre: [{value, count}], tone: [...], ... }
   */
  async getTagCounts(): Promise<Record<string, Array<{ value: string; count: number }>>> {
    const out: Record<string, Array<{ value: string; count: number }>> = {};
    const cols = ['genre', 'tone', 'aftertaste', 'plot_arc', 'theme', 'atmosphere'];
    for (const col of cols) {
      const result = await this.d1
        .prepare(
          `SELECT ${col} as value, COUNT(*) as count FROM stories WHERE status = 'completed' AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY count DESC`,
        )
        .all<{ value: string; count: number }>();
      // カンマ区切りを分解して再集計
      const merged = new Map<string, number>();
      for (const r of result.results ?? []) {
        for (const v of r.value.split(',').map((s) => s.trim()).filter(Boolean)) {
          merged.set(v, (merged.get(v) ?? 0) + r.count);
        }
      }
      out[col] = Array.from(merged.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }
    return out;
  }

  /**
   * 新規 story を作成する。
   * 同じ (word_a, word_b) ペアが既に存在する場合は UNIQUE 制約違反で失敗するので、
   * 呼び出し側で別ペアを引き直してリトライする。
   */
  async createStory(input: {
    raw_title: string;
    word_a: string;
    word_b: string;
    pattern: string;
    genre: string | null;
    tone: string | null;
    aftertaste: string | null;
    plot_arc: string | null;
    theme: string | null;
    atmosphere: string | null;
    now: number;
  }): Promise<number | null> {
    try {
      const result = await this.d1
        .prepare(
          `INSERT INTO stories (raw_title, word_a, word_b, pattern, genre, tone, aftertaste, plot_arc, theme, atmosphere, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .bind(
          input.raw_title,
          input.word_a,
          input.word_b,
          input.pattern,
          input.genre,
          input.tone,
          input.aftertaste,
          input.plot_arc,
          input.theme,
          input.atmosphere,
          input.now,
        )
        .run();
      const id = result.meta?.last_row_id;
      return typeof id === 'number' ? id : null;
    } catch (e) {
      console.warn('[db] createStory failed (likely duplicate word pair):', e);
      return null;
    }
  }

  /**
   * story を pending → active に遷移させる（CAS）。
   * 別 cron が先に取った場合は changes=0 で false を返す。
   */
  async startStory(id: number, now: number): Promise<boolean> {
    const result = await this.d1
      .prepare(
        `UPDATE stories SET status = 'active', started_at = ?, current_chapter = 0 WHERE id = ? AND status = 'pending'`,
      )
      .bind(now, id)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async incrementStoryChapter(id: number, chapter: number): Promise<void> {
    await this.d1
      .prepare(`UPDATE stories SET current_chapter = ? WHERE id = ?`)
      .bind(chapter, id)
      .run();
  }

  async completeStory(id: number, now: number): Promise<void> {
    await this.d1
      .prepare(
        `UPDATE stories SET status = 'completed', current_chapter = 7, completed_at = ? WHERE id = ?`,
      )
      .bind(now, id)
      .run();
  }

  async updateEditorOutput(
    id: number,
    input: { pen_name: string; final_title: string; chapter_titles: string[] },
  ): Promise<void> {
    await this.d1
      .prepare(`UPDATE stories SET final_title = ?, pen_name = ? WHERE id = ?`)
      .bind(input.final_title, input.pen_name, id)
      .run();

    // 章タイトルは chapters テーブルに反映
    for (let i = 0; i < input.chapter_titles.length; i++) {
      const chapterNo = i + 1;
      const title = input.chapter_titles[i];
      await this.d1
        .prepare(`UPDATE chapters SET title = ? WHERE story_id = ? AND chapter_no = ?`)
        .bind(title, id, chapterNo)
        .run();
    }
  }

  // ---------- chapters ----------

  async getChaptersByStory(storyId: number): Promise<ChapterRow[]> {
    const result = await this.d1
      .prepare(`SELECT * FROM chapters WHERE story_id = ? ORDER BY chapter_no ASC`)
      .bind(storyId)
      .all<ChapterRow>();
    return result.results ?? [];
  }

  /**
   * chapters の最大 chapter_no を返す。0 = まだ1章も無い。
   * 「次に書くべき章番号」を導出する真実のソース。current_chapter フィールドより信頼できる。
   */
  async getMaxChapterNoForStory(storyId: number): Promise<number> {
    const row = await this.d1
      .prepare(`SELECT MAX(chapter_no) as max_no FROM chapters WHERE story_id = ?`)
      .bind(storyId)
      .first<{ max_no: number | null }>();
    return row?.max_no ?? 0;
  }

  /**
   * 章を永続化する。UNIQUE 制約により同 (story_id, chapter_no) は二重投入されない。
   * 既に挿入されていた場合は null を返す（レース敗者）。
   */
  async addChapter(input: {
    story_id: number;
    chapter_no: number;
    writer: string;
    provider: string;
    model: string;
    content: string;
    created_at: number;
  }): Promise<number | null> {
    const result = await this.d1
      .prepare(
        `INSERT OR IGNORE INTO chapters (story_id, chapter_no, writer, provider, model, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.story_id,
        input.chapter_no,
        input.writer,
        input.provider,
        input.model,
        input.content,
        input.created_at,
      )
      .run();
    const changes = result.meta?.changes ?? 0;
    if (changes === 0) return null;
    const id = result.meta?.last_row_id;
    return typeof id === 'number' ? id : null;
  }

  /** 既存全 stories の (word_a, word_b) ペアを返す（タイトル重複回避用） */
  async getAllWordPairs(): Promise<Array<{ word_a: string; word_b: string }>> {
    const result = await this.d1
      .prepare(`SELECT word_a, word_b FROM stories`)
      .all<{ word_a: string; word_b: string }>();
    return result.results ?? [];
  }

  // ---------- meta ----------

  async getMeta(key: string): Promise<string | null> {
    const row = await this.d1
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string, now: number): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, value, now)
      .run();
  }
}
