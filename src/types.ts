export interface Story {
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
  // タグ（タイトルと独立に抽選される。既存作品は null）
  genre: string | null;
  tone: string | null;
  aftertaste: string | null;
  plot_arc: string | null;
  theme: string | null;
  atmosphere: string | null;
}

export interface Chapter {
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
