-- 作品のタグ（ジャンル + 方向性5軸）を追加。
-- 各軸 1 つずつ、文字列で保存。既存作品は NULL のまま。
-- タイトル（単語ペア）と独立にランダム抽選するのが肝（意図的なズレで予想外の物語を生む）。

ALTER TABLE stories ADD COLUMN genre TEXT;
ALTER TABLE stories ADD COLUMN tone TEXT;
ALTER TABLE stories ADD COLUMN aftertaste TEXT;
ALTER TABLE stories ADD COLUMN plot_arc TEXT;
ALTER TABLE stories ADD COLUMN theme TEXT;
ALTER TABLE stories ADD COLUMN atmosphere TEXT;

-- 検索用インデックス（archive のフィルタで使う想定）
CREATE INDEX IF NOT EXISTS idx_stories_genre ON stories(genre);
CREATE INDEX IF NOT EXISTS idx_stories_tone ON stories(tone);
CREATE INDEX IF NOT EXISTS idx_stories_theme ON stories(theme);
