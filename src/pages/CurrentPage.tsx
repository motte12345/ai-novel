import { useEffect, useState } from 'react';
import { api } from '../api';
import { Countdown } from '../components/Countdown';
import type { Chapter, Story } from '../types';

const STORY_CHAPTERS = 6;

export function CurrentPage() {
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      api
        .current()
        .then((r) => {
          if (!mounted) return;
          setStory(r.story);
          setChapters(r.chapters);
          setLoading(false);
        })
        .catch((e) => {
          if (!mounted) return;
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        });
    };
    load();
    // 進行中は1分ごとに自動更新
    const t = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  if (loading) return <p className="loading">読込中...</p>;
  if (error) return <p className="error">エラー: {error}</p>;
  if (!story) return <p className="empty">まだ作品がありません。1時間以内に最初の章が生まれます。</p>;

  const isActive = story.status === 'active';
  const lastChapter = chapters.filter((c) => c.chapter_no <= STORY_CHAPTERS).slice(-1)[0];
  const writerChapters = chapters.filter((c) => c.chapter_no <= STORY_CHAPTERS);
  const completed = writerChapters.length;

  return (
    <>
      {isActive && (
        <div className="active-meta">
          <Countdown lastChapterAt={lastChapter?.created_at ?? null} />
        </div>
      )}

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
          <div className="chapter-gauge">
            {Array.from({ length: STORY_CHAPTERS }).map((_, i) => (
              <span key={i} className={`tick ${i < completed ? 'on' : ''}`} />
            ))}
          </div>
          <span>{completed} / {STORY_CHAPTERS} 章</span>
        </div>
      </header>

      <ChapterListView chapters={writerChapters} />
    </>
  );
}

function ChapterListView({ chapters }: { chapters: Chapter[] }) {
  if (chapters.length === 0) {
    return <p className="empty-chapters">最初の章を執筆中です...</p>;
  }
  return (
    <div className="chapters">
      {chapters.map((c) => (
        <article key={c.id} className="chapter">
          <div className="chapter-head">
            <span className="chapter-no">第{c.chapter_no}章</span>
            {c.title ? (
              <span className="chapter-title">{c.title}</span>
            ) : (
              <span className="chapter-title-pending">（章タイトルは完結時に付きます）</span>
            )}
          </div>
          <div className="chapter-body">{c.content}</div>
        </article>
      ))}
    </div>
  );
}
