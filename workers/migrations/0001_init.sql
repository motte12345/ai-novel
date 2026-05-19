-- 短編
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_title TEXT NOT NULL,             -- 単語ペアから合成された素のタイトル「ランプと夕暮れ」
  word_a TEXT NOT NULL,                -- 抽出元の単語A
  word_b TEXT NOT NULL,                -- 抽出元の単語B
  pattern TEXT NOT NULL,               -- 合成パターン（'{a}と{b}' 等）
  final_title TEXT,                    -- 編集者AIが仕上げたタイトル
  pen_name TEXT,                       -- 編集者AIが命名したペンネーム
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | completed
  current_chapter INTEGER NOT NULL DEFAULT 0,  -- 0..7 (0=未開始, 7=完了)
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_completed ON stories(completed_at DESC);
-- 同じ単語ペアの重複作品を防ぐ
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stories_word_pair ON stories(word_a, word_b);

-- 章（作家ターン 1〜6 + 編集者ターン 7）
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL,
  chapter_no INTEGER NOT NULL,         -- 1..7 (7は編集者ターンの生出力)
  writer TEXT NOT NULL,                -- writer_a | writer_b | writer_c | editor
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  title TEXT,                          -- 編集者が後付けする章タイトル（1..6 のみ）
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE INDEX IF NOT EXISTS idx_chapters_story ON chapters(story_id, chapter_no);
-- 同一作品の同一章番号が二重投入されないようにする（cron レース対策）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_chapters_story_no ON chapters(story_id, chapter_no);

-- メタ情報（key-value）
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
