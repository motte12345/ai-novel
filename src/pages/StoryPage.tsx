import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Chapter, Story } from '../types';

const STORY_CHAPTERS = 6;

export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .story(Number(id))
      .then((r) => {
        setStory(r.story);
        setChapters(r.chapters);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="loading">読込中...</p>;
  if (error) return <p className="error">エラー: {error}</p>;
  if (!story) return <p className="error">作品が見つかりません</p>;

  const writerChapters = chapters.filter((c) => c.chapter_no <= STORY_CHAPTERS);

  return (
    <>
      <p style={{ marginBottom: 16 }}>
        <Link to="/archive">← 過去の作品一覧へ</Link>
      </p>

      <header className="story-head">
        <div className="story-no">No. {String(story.id).padStart(4, '0')}</div>
        <h2 className="story-title">{story.final_title ?? story.raw_title}</h2>
        {story.final_title && story.final_title !== story.raw_title && (
          <div className="story-title-raw">原題: {story.raw_title}</div>
        )}
        {story.pen_name && <div className="story-pen">著: {story.pen_name}</div>}
        <div className="story-meta">
          <span className={`status-pill ${story.status}`}>
            {story.status === 'active' ? '執筆中' : '完結'}
          </span>
          <span>{writerChapters.length} / {STORY_CHAPTERS} 章</span>
        </div>
      </header>

      <div className="chapters">
        {writerChapters.map((c) => (
          <article key={c.id} className="chapter">
            <div className="chapter-head">
              <span className="chapter-no">第{c.chapter_no}章</span>
              {c.title ? (
                <span className="chapter-title">{c.title}</span>
              ) : (
                <span className="chapter-title-pending">（章タイトル未生成）</span>
              )}
            </div>
            <div className="chapter-body">{c.content}</div>
          </article>
        ))}
      </div>
    </>
  );
}
