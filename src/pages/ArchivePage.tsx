import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StoryTags } from '../components/StoryTags';
import type { Story } from '../types';

const PAGE_SIZE = 30;

export function ArchivePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .archive({ limit: PAGE_SIZE })
      .then((r) => {
        setStories(r.stories);
        setCursor(r.next_cursor);
        setHasMore(r.next_cursor !== null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  const loadMore = async () => {
    if (cursor === null) return;
    setLoading(true);
    try {
      const r = await api.archive({ cursor, limit: PAGE_SIZE });
      setStories((prev) => [...prev, ...r.stories]);
      setCursor(r.next_cursor);
      setHasMore(r.next_cursor !== null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="archive-head">
        <h2>過去の作品</h2>
        <p className="archive-sub">完結した短編の一覧</p>
      </header>

      {error && <p className="error">エラー: {error}</p>}
      {!error && stories.length === 0 && !loading && (
        <p className="empty">まだ完結した作品はありません</p>
      )}

      <ul className="archive-list">
        {stories.map((s) => (
          <li key={s.id} className="archive-item">
            <Link to={`/story/${s.id}`} className="archive-link">
              <span className="archive-no">No.{String(s.id).padStart(4, '0')}</span>
              <span className="archive-title">
                {s.final_title ?? s.raw_title}
                <StoryTags story={s} compact />
              </span>
              {s.pen_name && <span className="archive-pen">{s.pen_name}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button className="load-more" onClick={loadMore} disabled={loading}>
          {loading ? '読込中...' : 'さらに読み込む'}
        </button>
      )}
    </>
  );
}
